import os
import re
import csv
import json
from datetime import datetime
from flask import Flask, request, jsonify, render_template, session, redirect, url_for, make_response
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy
import pdfplumber
import spacy
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)

app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# Secret key
app.config['SECRET_KEY'] = os.environ.get(
    'SECRET_KEY',
    'dev-secret-key'
)

# Database configuration
database_path = os.environ.get(
    'DATABASE_PATH',
    os.path.join(app.instance_path, 'users.db')
)

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{database_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.instance_path, exist_ok=True)

# Load spaCy model
try:
    nlp = spacy.load('en_core_web_sm')
except OSError:
    raise Exception("Run: python -m spacy download en_core_web_sm")


# -------------------- Database Models --------------------

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    analyses = db.relationship('AnalysisHistory', backref='user', lazy=True)


class AnalysisHistory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    job_description = db.Column(db.Text, nullable=False)
    score = db.Column(db.Float, nullable=False)
    matched_skills = db.Column(db.Text)   # JSON array
    missing_skills = db.Column(db.Text)   # JSON array
    suggestions = db.Column(db.Text)      # JSON array
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# Create tables if they don't exist
with app.app_context():
    db.create_all()


# -------------------- Skill loading --------------------

def load_skills(csv_path='data/skills.csv'):
    skills = []

    if not os.path.exists(csv_path):
        return [
            'Python', 'Java', 'C++', 'JavaScript', 'HTML', 'CSS', 'React',
            'Node.js', 'Flask', 'Django', 'SQL', 'MySQL', 'MongoDB', 'Git',
            'GitHub', 'AWS', 'Docker', 'Machine Learning', 'Deep Learning',
            'NLP', 'Pandas', 'NumPy', 'TensorFlow', 'PyTorch', 'Communication',
            'Leadership', 'Teamwork', 'Problem Solving'
        ]

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)

        for row in reader:
            if row:
                skills.append(row[0].strip())

    return skills


SKILLS = load_skills()


# -------------------- Core functions --------------------

def extract_text_from_pdf(pdf_path):
    text = ""

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()

            if page_text:
                text += page_text + "\n"

    return text.strip()


def clean_text(text):
    text = text.lower()
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def extract_name_email(text):
    doc = nlp(text)

    name = None

    for ent in doc.ents:
        if ent.label_ == "PERSON":
            name = ent.text
            break

    if not name:
        lines = text.split('\n')

        if lines:
            name = lines[0].strip()

    email_match = re.search(
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
        text
    )

    email = email_match.group(0) if email_match else None

    return name, email


def compute_skill_match(resume_text, jd_text, skills):
    resume_lower = clean_text(resume_text)
    jd_lower = clean_text(jd_text)

    skills_in_jd = [
        s for s in skills
        if s.lower() in jd_lower
    ]

    total_jd_skills = len(skills_in_jd)

    if total_jd_skills == 0:
        return 0.0, [], [], []

    matched = []
    missing = []

    for skill in skills:
        skill_lower = skill.lower()

        in_resume = skill_lower in resume_lower
        in_jd = skill_lower in jd_lower

        if in_jd and in_resume:
            matched.append(skill)

        elif in_jd and not in_resume:
            missing.append(skill)

    match_ratio = len(matched) / total_jd_skills

    return match_ratio, matched, missing, skills_in_jd


def compute_cosine_similarity(resume_text, jd_text):
    if not resume_text or not jd_text:
        return 0.0

    vectorizer = TfidfVectorizer(stop_words='english')

    try:
        tfidf_matrix = vectorizer.fit_transform(
            [resume_text, jd_text]
        )

        similarity = cosine_similarity(
            tfidf_matrix[0:1],
            tfidf_matrix[1:2]
        )

        return similarity[0][0]

    except ValueError:
        return 0.0


def generate_suggestions(missing_skills):
    if not missing_skills:
        return [
            "Great job! Your resume covers all the skills mentioned in the job description."
        ]

    suggestions = []

    suggestions.append(
        f"Consider adding these skills to your resume: {', '.join(missing_skills)}."
    )

    suggestions.append(
        "Tailor your resume to include relevant keywords from the job description."
    )

    suggestions.append(
        "Highlight your experience with the missing skills if you have them, using concrete examples."
    )

    return suggestions


# -------------------- Authentication helpers --------------------

def login_required(f):
    from functools import wraps

    @wraps(f)
    def decorated_function(*args, **kwargs):

        if 'user_id' not in session:
            return redirect(url_for('login'))

        response = make_response(
            f(*args, **kwargs)
        )

        # Set cache headers for protected pages
        response.headers['Cache-Control'] = (
            'no-store, no-cache, must-revalidate, max-age=0'
        )
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'

        return response

    return decorated_function


# -------------------- Global after_request for all pages --------------------

@app.after_request
def add_cache_headers(response):

    # Skip static files
    if request.path.startswith('/static/'):
        return response

    response.headers['Cache-Control'] = (
        'no-store, no-cache, must-revalidate, max-age=0'
    )
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'

    return response


# -------------------- Routes --------------------

@app.route('/')
@login_required
def index():
    return render_template('index.html')


@app.route('/register', methods=['GET', 'POST'])
def register():

    if request.method == 'POST':

        name = request.form.get('name', '').strip()
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '').strip()
        confirm = request.form.get('confirm_password', '').strip()

        errors = []

        if not name:
            errors.append('Please enter your name.')

        if not email:
            errors.append('Please enter your email address.')

        elif not re.match(
            r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$',
            email
        ):
            errors.append('Please enter a valid email address.')

        if not password:
            errors.append('Please enter a password.')

        elif len(password) < 6:
            errors.append('Password must be at least 6 characters.')

        if password and confirm and password != confirm:
            errors.append('Passwords do not match.')

        if not errors:

            if User.query.filter_by(email=email).first():
                errors.append(
                    'An account with this email already exists.'
                )

        if errors:
            return render_template(
                'register.html',
                error='<br>'.join(errors),
                name=name,
                email=email
            )

        hashed = generate_password_hash(password)

        new_user = User(
            name=name,
            email=email,
            password_hash=hashed
        )

        db.session.add(new_user)
        db.session.commit()

        return redirect(url_for('login'))

    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():

    if request.method == 'POST':

        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '').strip()

        errors = []

        if not email:
            errors.append('Please enter your email address.')

        elif not re.match(
            r'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$',
            email
        ):
            errors.append('Please enter a valid email address.')

        if not password:
            errors.append('Please enter your password.')

        if errors:
            return render_template(
                'login.html',
                error='<br>'.join(errors)
            )

        user = User.query.filter_by(email=email).first()

        if not user or not check_password_hash(
            user.password_hash,
            password
        ):
            return render_template(
                'login.html',
                error='Invalid email or password.'
            )

        session['user_id'] = user.id
        session['user_name'] = user.name

        return redirect(url_for('index'))

    return render_template('login.html')


@app.route('/logout')
def logout():

    session.clear()

    response = redirect(
        url_for('login')
    )

    response.headers['Cache-Control'] = (
        'no-store, no-cache, must-revalidate, max-age=0'
    )
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'

    return response


# -------------------- Existing API routes (protected) --------------------

@app.route('/upload', methods=['POST'])
@login_required
def upload_resume():

    if 'resume' not in request.files:
        return jsonify({
            'error': 'No resume file uploaded'
        }), 400

    file = request.files['resume']

    if file.filename == '':
        return jsonify({
            'error': 'No file selected'
        }), 400

    if not file.filename.lower().endswith('.pdf'):
        return jsonify({
            'error': 'Only PDF files are allowed'
        }), 400

    filename = secure_filename(file.filename)

    filepath = os.path.join(
        app.config['UPLOAD_FOLDER'],
        filename
    )

    file.save(filepath)

    try:

        resume_text = extract_text_from_pdf(filepath)

        if not resume_text:
            return jsonify({
                'error': 'Could not extract text from PDF. Ensure it is text-based.'
            }), 400

        name, email = extract_name_email(resume_text)

        resume_lower = clean_text(resume_text)

        detected_skills = [
            s for s in SKILLS
            if s.lower() in resume_lower
        ]

        top_skills = detected_skills[:5]

        session['resume_text'] = resume_text
        session['resume_filename'] = filename

        session['resume_summary'] = {
            'name': name,
            'email': email,
            'skill_count': len(detected_skills),
            'top_skills': top_skills
        }

        return jsonify({
            'message': 'Resume uploaded successfully',
            'filename': filename,
            'summary': session['resume_summary']
        })

    except Exception as e:

        return jsonify({
            'error': f'Processing error: {str(e)}'
        }), 500

    finally:

        if os.path.exists(filepath):
            os.remove(filepath)


@app.route('/analyze', methods=['POST'])
@login_required
def analyze():

    resume_text = session.get('resume_text')

    if not resume_text:
        return jsonify({
            'error': 'Please upload a resume first.'
        }), 400

    jd_text = request.form.get(
        'job_description',
        ''
    ).strip()

    if not jd_text:
        return jsonify({
            'error': 'Job description cannot be empty.'
        }), 400

    match_ratio, matched, missing, skills_in_jd = compute_skill_match(
        resume_text,
        jd_text,
        SKILLS
    )

    cos_sim = compute_cosine_similarity(
        resume_text,
        jd_text
    )

    final_score = round(
        (0.6 * match_ratio + 0.4 * cos_sim) * 100,
        2
    )

    skill_match_pct = round(
        match_ratio * 100,
        2
    )

    content_relevance_pct = round(
        cos_sim * 100,
        2
    )

    keyword_coverage_pct = skill_match_pct

    suggestions = generate_suggestions(
        missing
    )

    # Save analysis to database
    user_id = session.get('user_id')

    if user_id:

        analysis = AnalysisHistory(
            user_id=user_id,
            job_description=jd_text,
            score=final_score,
            matched_skills=json.dumps(matched),
            missing_skills=json.dumps(missing),
            suggestions=json.dumps(suggestions)
        )

        db.session.add(analysis)
        db.session.commit()

    response = {
        'score': final_score,
        'matched_skills': matched,
        'missing_skills': missing,
        'suggestions': suggestions,
        'skill_match_pct': skill_match_pct,
        'content_relevance_pct': content_relevance_pct,
        'keyword_coverage_pct': keyword_coverage_pct
    }

    return jsonify(response)


@app.route('/history')
@login_required
def get_history():

    user_id = session.get('user_id')

    if not user_id:
        return jsonify({
            'error': 'Not logged in'
        }), 401

    analyses = (
        AnalysisHistory.query
        .filter_by(user_id=user_id)
        .order_by(AnalysisHistory.created_at.desc())
        .limit(10)
        .all()
    )

    history_data = []

    for a in analyses:

        history_data.append({
            'id': a.id,
            'job_description': a.job_description,
            'score': a.score,
            'matched_skills': (
                json.loads(a.matched_skills)
                if a.matched_skills
                else []
            ),
            'missing_skills': (
                json.loads(a.missing_skills)
                if a.missing_skills
                else []
            ),
            'suggestions': (
                json.loads(a.suggestions)
                if a.suggestions
                else []
            ),
            'created_at': a.created_at.strftime(
                '%Y-%m-%d %H:%M'
            )
        })

    return jsonify(history_data)


@app.route('/reset', methods=['POST'])
@login_required
def reset_session():

    session.pop('resume_text', None)
    session.pop('resume_filename', None)
    session.pop('resume_summary', None)

    return jsonify({
        'message': 'Session cleared'
    })


if __name__ == '__main__':
    app.run(
        debug=True,
        host='0.0.0.0',
        port=5000
    )
