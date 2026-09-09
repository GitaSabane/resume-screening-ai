document.addEventListener('DOMContentLoaded', function() {
    // DOM refs
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const resumeStatus = document.getElementById('resume-status');
    const resumeFilename = document.getElementById('resume-filename');
    const candidateName = document.getElementById('candidate-name');
    const candidateEmail = document.getElementById('candidate-email');
    const skillCount = document.getElementById('skill-count');
    const topSkills = document.getElementById('top-skills');
    const changeResumeBtn = document.getElementById('change-resume-btn');
    const jobDesc = document.getElementById('job-desc');
    const analyzeBtn = document.getElementById('analyze-btn');
    const clearJdBtn = document.getElementById('clear-jd-btn');
    const analyzeAnotherBtn = document.getElementById('analyze-another-btn');
    const newAnalysisBtn = document.getElementById('new-analysis-btn');
    const startOverBtn = document.getElementById('start-over-btn');
    const loading = document.getElementById('loading');
    const errorMsg = document.getElementById('error-msg');
    const resultSection = document.getElementById('result-section');
    const historySection = document.getElementById('history-section');
    const historyList = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const copyBtn = document.getElementById('copy-result-btn');
    const charCounter = document.getElementById('char-counter');
    const sampleBtns = document.querySelectorAll('.sample-btn');
    const scorePath = document.getElementById('score-path');
    const scoreText = document.getElementById('score-text');
    const scorePercent = document.getElementById('score-percent');
    const scoreLabel = document.getElementById('score-label');
    const scoreExplanation = document.getElementById('score-explanation');
    const skillMatchPct = document.getElementById('skill-match-pct');
    const contentRelevancePct = document.getElementById('content-relevance-pct');
    const keywordCoveragePct = document.getElementById('keyword-coverage-pct');
    const readinessSummary = document.getElementById('readiness-summary');
    const matchedList = document.getElementById('matched-list');
    const missingList = document.getElementById('missing-list');
    const suggestionsList = document.getElementById('suggestions-list');

    // State
    let currentResult = null;
    let history = []; // will be loaded from server
    let resumeUploaded = false;

    // --- Helper functions ---
    function showError(msg) {
        const el = document.getElementById('error-msg');
        if (msg) {
            el.textContent = msg;
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    }

    function updateAnalyzeButton() {
        const jd = jobDesc.value.trim();
        if (resumeUploaded && jd.length >= 20) {
            analyzeBtn.disabled = false;
            analyzeBtn.title = '';
        } else {
            analyzeBtn.disabled = true;
            if (!resumeUploaded) {
                analyzeBtn.title = 'Please upload a resume first.';
            } else if (jd.length < 20) {
                analyzeBtn.title = 'Please enter a longer job description (at least 20 characters).';
            }
        }
    }

    function updateCharCounter() {
        const len = jobDesc.value.length;
        charCounter.textContent = len + ' characters';
    }

    // --- Load history from server ---
    function loadHistory() {
        fetch('/history')
            .then(response => response.json())
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    history = data;
                    updateHistory();
                    historySection.style.display = 'block';
                }
            })
            .catch(err => console.error('Failed to load history:', err));
    }

    // --- Resume Upload ---
    function handleFile(file) {
        if (!file || file.type !== 'application/pdf') {
            showError('Please select a valid PDF file.');
            return;
        }
        if (file.size > 16 * 1024 * 1024) {
            showError('File is too large. Maximum size is 16 MB.');
            return;
        }

        const formData = new FormData();
        formData.append('resume', file);
        showError('');
        loading.style.display = 'block';
        analyzeBtn.disabled = true;

        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            loading.style.display = 'none';
            if (data.error) {
                showError(data.error);
                return;
            }
            resumeUploaded = true;
            resumeFilename.textContent = data.filename;
            const summary = data.summary || {};
            candidateName.textContent = summary.name ? '👤 ' + summary.name : '';
            candidateEmail.textContent = summary.email ? '📧 ' + summary.email : '';
            skillCount.textContent = summary.skill_count ? '📊 ' + summary.skill_count + ' skills detected' : '';
            topSkills.textContent = summary.top_skills ? '🔹 ' + summary.top_skills.join(' • ') : '';
            resumeStatus.style.display = 'flex';
            dropZone.style.display = 'none';
            updateAnalyzeButton();
            document.getElementById('jd-section').scrollIntoView({ behavior: 'smooth' });
        })
        .catch(err => {
            loading.style.display = 'none';
            showError('Network error: ' + err.message);
        });
    }

    // Drag & drop
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length) handleFile(files[0]);
    });

    // Change Resume
    changeResumeBtn.addEventListener('click', function() {
        fetch('/reset', { method: 'POST' })
            .then(() => {
                resumeUploaded = false;
                resumeStatus.style.display = 'none';
                dropZone.style.display = 'block';
                resultSection.style.display = 'none';
                // Do not hide history; it remains
                currentResult = null;
                jobDesc.value = '';
                updateCharCounter();
                updateAnalyzeButton();
                showError('');
                document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
                document.getElementById('step1').classList.add('active');
            });
    });

    // --- Job Description input ---
    jobDesc.addEventListener('input', function() {
        updateCharCounter();
        updateAnalyzeButton();
    });

    clearJdBtn.addEventListener('click', function() {
        jobDesc.value = '';
        updateCharCounter();
        updateAnalyzeButton();
        showError('');
    });

    // Sample jobs
    sampleBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const sample = this.dataset.job;
            let text = '';
            if (sample === 'Python Developer') {
                text = `We are looking for a Python Developer with experience in Flask, Django, SQL, Git, and AWS. Knowledge of Docker and CI/CD is a plus. Strong problem-solving skills and teamwork are essential.`;
            } else if (sample === 'Data Analyst') {
                text = `Data Analyst role: proficiency in Python, Pandas, NumPy, SQL, and data visualization tools (Tableau, Power BI). Excellent communication skills and ability to work with cross-functional teams.`;
            } else if (sample === 'Frontend Developer') {
                text = `Frontend Developer needed: strong skills in HTML, CSS, JavaScript, React, and Git. Experience with responsive design and UI/UX principles. Good problem-solving and collaboration skills.`;
            }
            jobDesc.value = text;
            updateCharCounter();
            updateAnalyzeButton();
            showError('');
        });
    });

    // --- Analyze ---
    analyzeBtn.addEventListener('click', function() {
        const jd = jobDesc.value.trim();
        if (!jd || jd.length < 20) {
            showError('Please enter a job description with at least 20 characters.');
            return;
        }
        if (!resumeUploaded) {
            showError('Please upload a resume first.');
            return;
        }

        showError('');
        loading.style.display = 'block';
        resultSection.style.display = 'none';
        analyzeBtn.disabled = true;

        const formData = new FormData();
        formData.append('job_description', jd);

        fetch('/analyze', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            loading.style.display = 'none';
            analyzeBtn.disabled = false;
            if (data.error) {
                showError(data.error);
                return;
            }
            currentResult = data;
            displayResult(data);
            // Add to history (server will have saved it, but we can also add locally)
            // Reload history to get the latest from server
            loadHistory();
            document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
            document.getElementById('step3').classList.add('active');
        })
        .catch(err => {
            loading.style.display = 'none';
            analyzeBtn.disabled = false;
            showError('Network error: ' + err.message);
        });
    });

    // --- Display Result ---
    function displayResult(data) {
        const score = data.score;
        const radius = 15.9155;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (score / 100) * circumference;
        scorePath.style.strokeDasharray = circumference + ' ' + circumference;
        scorePath.style.strokeDashoffset = offset;
        scoreText.textContent = score + '%';
        scorePercent.textContent = score + '%';

        let label, explanation;
        if (score >= 80) {
            label = 'Strong Match';
            explanation = 'Your resume aligns very well with the job requirements.';
        } else if (score >= 60) {
            label = 'Good Match';
            explanation = 'Your resume matches most of the required skills and keywords.';
        } else if (score >= 40) {
            label = 'Moderate Match';
            explanation = 'Your resume has some relevant skills but could be improved.';
        } else {
            label = 'Needs Improvement';
            explanation = 'Your resume could be better tailored to this job.';
        }
        scoreLabel.textContent = label;
        scoreExplanation.textContent = explanation;

        skillMatchPct.textContent = data.skill_match_pct + '%';
        contentRelevancePct.textContent = data.content_relevance_pct + '%';
        keywordCoveragePct.textContent = data.keyword_coverage_pct + '%';

        const avg = (data.skill_match_pct + data.content_relevance_pct + data.keyword_coverage_pct) / 3;
        let readinessMsg = '';
        if (avg >= 75) readinessMsg = 'Your resume is a strong fit for this position.';
        else if (avg >= 50) readinessMsg = 'Your resume is a decent fit, but consider improving keyword coverage and skills.';
        else readinessMsg = 'Your resume may need significant updates to match this job.';
        readinessSummary.textContent = readinessMsg;

        matchedList.innerHTML = data.matched_skills.map(s => `<li>${s}</li>`).join('') || '<li>None</li>';
        if (data.missing_skills.length) {
            missingList.innerHTML = data.missing_skills.map(s => {
                return `<li>${s} <span class="missing-explanation">${s} is mentioned in the job description but was not detected in your resume.</span></li>`;
            }).join('');
        } else {
            missingList.innerHTML = '<li>None – all required skills are present!</li>';
        }

        suggestionsList.innerHTML = data.suggestions.map(s => `<li>${s}</li>`).join('');

        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        document.getElementById('step3').classList.add('active');
    }

    // --- History ---
    function updateHistory() {
        if (history.length === 0) {
            historySection.style.display = 'none';
            return;
        }
        historyList.innerHTML = history.map((item, index) =>
            `<li data-id="${item.id || index}">
                <span><span class="history-score">${item.score}%</span> – ${item.job_description.slice(0, 50)}${item.job_description.length > 50 ? '...' : ''}</span>
                <span class="history-timestamp">${item.created_at || ''}</span>
            </li>`
        ).join('');
        // Click to restore result
        document.querySelectorAll('#history-list li').forEach(li => {
            li.addEventListener('click', function() {
                const idx = parseInt(this.dataset.id);
                // Find the analysis by id (if we have it) or by index
                // Since we may have multiple items, we can use index
                // But we stored id in data-id, so we can search history
                const id = parseInt(this.dataset.id);
                const entry = history.find(h => h.id === id);
                if (entry) {
                    // We need to display the result. We have the full data in entry.
                    // However, the entry might not have all breakdown fields.
                    // We can reconstruct a result object.
                    const result = {
                        score: entry.score,
                        matched_skills: entry.matched_skills || [],
                        missing_skills: entry.missing_skills || [],
                        suggestions: entry.suggestions || [],
                        skill_match_pct: 0, // we don't store these breakdowns in DB
                        content_relevance_pct: 0,
                        keyword_coverage_pct: 0
                    };
                    // For breakdown, we could compute on the fly, but we'll just show score.
                    // We'll display it.
                    currentResult = result;
                    displayResult(result);
                }
            });
        });
    }

    // Clear history (client-side only; server history remains)
    clearHistoryBtn.addEventListener('click', function() {
        if (confirm('Clear all history from this view? (History is still stored on the server.)')) {
            history = [];
            updateHistory();
        }
    });

    // --- Copy result ---
    copyBtn.addEventListener('click', function() {
        if (!currentResult) return;
        const text = `Match Score: ${currentResult.score}%\n\nMatched Skills: ${currentResult.matched_skills.join(', ')}\nMissing Skills: ${currentResult.missing_skills.join(', ')}\nSuggestions: ${currentResult.suggestions.join(' ')}`;
        navigator.clipboard.writeText(text).then(() => {
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
            }, 2000);
        }).catch(() => alert('Could not copy. Please select and copy manually.'));
    });

    // --- Next actions ---
    analyzeAnotherBtn.addEventListener('click', function() {
        resultSection.style.display = 'none';
        jobDesc.value = '';
        updateCharCounter();
        updateAnalyzeButton();
        showError('');
        document.getElementById('jd-section').scrollIntoView({ behavior: 'smooth' });
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        document.getElementById('step2').classList.add('active');
    });

    newAnalysisBtn.addEventListener('click', function() {
        analyzeAnotherBtn.click();
    });

    startOverBtn.addEventListener('click', function() {
        if (confirm('This will clear your uploaded resume and all analyses. Proceed?')) {
            fetch('/reset', { method: 'POST' })
                .then(() => {
                    resumeUploaded = false;
                    resumeStatus.style.display = 'none';
                    dropZone.style.display = 'block';
                    resultSection.style.display = 'none';
                    // Do not clear history from server, but we can reload
                    loadHistory();
                    currentResult = null;
                    jobDesc.value = '';
                    updateCharCounter();
                    updateAnalyzeButton();
                    showError('');
                    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
                    document.getElementById('step1').classList.add('active');
                });
        }
    });

    // Initialize
    updateCharCounter();
    updateAnalyzeButton();
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById('step1').classList.add('active');
    // Load history from server
    loadHistory();
});