let mediaRecorder;
let audioChunks = [];
let isRecording = false;

let thinkTimer;
let timeLeft = 30;

let recordingInterval; 
let evaluationData = null; 
let fullTranscriptData = null; 
let currentAudioPlayer = null; 

// Visualizer Variables
let audioCtx = null;
let analyser = null;
let dataArray = null;
let visualizerCtx = null;
let drawVisual;
let audioSource = null; 
let globalStream = null; // Keeps the microphone alive for the visualizer

const landingScreen = document.getElementById('landing-screen');
const startInterviewBtn = document.getElementById('start-interview-btn');

const recordBtn = document.getElementById('record-btn');
const statusText = document.getElementById('status-text');
const chatBox = document.getElementById('chat-box');
const timerDisplay = document.getElementById('timer-display');
const visualizerCanvas = document.getElementById('visualizer');

const interviewScreen = document.getElementById('interview-screen');
const evalScreen = document.getElementById('evaluation-screen');
const detailedScreen = document.getElementById('detailed-screen');
const feedbackScreen = document.getElementById('feedback-screen');

const finalRecText = document.getElementById('final-recommendation');
const rubricContent = document.getElementById('rubric-content');
const viewDetailsBtn = document.getElementById('view-details-btn');
const backToSummaryBtn = document.getElementById('back-to-summary-btn');
const overallExplanation = document.getElementById('overall-explanation');
const detailedContent = document.getElementById('detailed-content');

const viewTranscriptBtn = document.getElementById('view-transcript-btn');
const transcriptModal = document.getElementById('transcript-modal');
const closeTranscriptBtn = document.getElementById('close-transcript-btn');
const transcriptLog = document.getElementById('transcript-log');

const exitBtn1 = document.getElementById('exit-btn-1');
const exitBtn2 = document.getElementById('exit-btn-2');
const submitFeedbackBtn = document.getElementById('submit-feedback-btn');

const thankYouPopup = document.getElementById('thank-you-popup');
const errorPopup = document.getElementById('error-popup');
const closeErrorBtn = document.getElementById('close-error-btn');

window.onload = async () => {
    await fetch('/api/reset', { method: 'POST' });
    visualizerCtx = visualizerCanvas.getContext('2d');
    visualizerCanvas.width = 300;
    visualizerCanvas.height = 60;
};

function playAudioResponse(base64Data, onEndCallback) {
    if (currentAudioPlayer) currentAudioPlayer.pause();
    try {
        currentAudioPlayer = new Audio("data:audio/mp3;base64," + base64Data);
        currentAudioPlayer.playbackRate = 1.05; 
        currentAudioPlayer.onended = () => { if (onEndCallback) onEndCallback(); };
        currentAudioPlayer.onerror = (e) => { if (onEndCallback) onEndCallback(); };
        currentAudioPlayer.play().catch(e => { if (onEndCallback) onEndCallback(); });
    } catch (e) {
        if (onEndCallback) onEndCallback();
    }
}

function drawWaveform() {
    if (!isRecording || !analyser) return;
    drawVisual = requestAnimationFrame(drawWaveform);

    analyser.getByteFrequencyData(dataArray);

    visualizerCtx.fillStyle = '#0f1115'; 
    visualizerCtx.fillRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);

    const barWidth = (visualizerCanvas.width / analyser.frequencyBinCount) * 2.5;
    let barHeight;
    let x = 0;

    for (let i = 0; i < analyser.frequencyBinCount; i++) {
        barHeight = (dataArray[i] / 2) + 2; // +2 forces a visible line even in silence
        visualizerCtx.fillStyle = '#FDB813'; 
        visualizerCtx.fillRect(x, visualizerCanvas.height - barHeight, barWidth, barHeight);
        x += barWidth + 1;
    }
}

startInterviewBtn.addEventListener('click', async () => {
    startInterviewBtn.innerText = "Connecting...";
    startInterviewBtn.disabled = true;

    try {
        globalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(globalStream);
        
        mediaRecorder.ondataavailable = e => { audioChunks.push(e.data); };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            audioChunks = [];
            
            const formData = new FormData();
            formData.append("audio", audioBlob, "recording.webm");
            formData.append("is_timeout", "false");

            appendMessage('user', '...'); 
            statusText.innerText = "Transcribing...";
            processChatRequest(formData);
        };
    } catch (err) {
        alert("Microphone access is required to take the interview.");
        startInterviewBtn.innerText = "Start Interview";
        startInterviewBtn.disabled = false;
        return;
    }

    try {
        const introResponse = await fetch('/api/intro');
        const introData = await introResponse.json();

        landingScreen.classList.add('hidden');
        interviewScreen.classList.remove('hidden');

        appendMessage('ai', introData.text);
        
        playAudioResponse(introData.audio, () => {
            recordBtn.disabled = false;
            recordBtn.innerText = 'Start Answering';
            statusText.innerText = "Click the button below to start your answer.";
            startTimer();
        });
    } catch (e) {
        startInterviewBtn.innerText = "Start Interview";
        startInterviewBtn.disabled = false;
    }
});

function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerText = role === 'user' ? `You: ${text}` : text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function startTimer() {
    timeLeft = 30;
    timerDisplay.innerHTML = `Time to answer: <span id="think-time-left">${timeLeft}</span>s`;
    timerDisplay.classList.remove('hidden', 'warning');

    thinkTimer = setInterval(() => {
        timeLeft--;
        const span = document.getElementById('think-time-left');
        if (span) span.innerText = timeLeft;
        if (timeLeft <= 10) timerDisplay.classList.add('warning');
        if (timeLeft <= 0) {
            clearInterval(thinkTimer);
            handleTimeout();
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(thinkTimer);
    timerDisplay.classList.add('hidden');
}

async function handleTimeout() {
    recordBtn.classList.remove('recording');
    recordBtn.innerText = 'Processing...';
    recordBtn.disabled = true;
    timerDisplay.classList.add('hidden');
    visualizerCanvas.style.display = 'none'; 

    const formData = new FormData();
    formData.append("is_timeout", "true");
    formData.append("audio", new Blob([''], { type: 'audio/webm' })); 

    appendMessage('user', '[No response]');
    statusText.innerText = "Transmitting...";
    processChatRequest(formData);
}

recordBtn.addEventListener('click', async () => {
    if (!isRecording) {
        stopTimer(); 
        
        try { mediaRecorder.start(); } catch (e) { console.error("Microphone issue:", e); }
        
        // Build Audio Context safely using the global stream
        if (!audioCtx) {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new window.AudioContext();
            analyser = audioCtx.createAnalyser();
            audioSource = audioCtx.createMediaStreamSource(globalStream);
            audioSource.connect(analyser);
            analyser.fftSize = 256;
            dataArray = new Uint8Array(analyser.frequencyBinCount);
        }
        
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }
        
        isRecording = true;
        recordBtn.classList.add('recording');
        recordBtn.innerText = 'Stop Answering & Send';
        statusText.innerText = "Recording... Speak clearly.";

        // Force Display
        visualizerCanvas.style.display = 'block';
        drawWaveform();

        let recordingTimeLeft = 30; 
        timerDisplay.innerHTML = `Recording limit: <span id="recording-time-left">${recordingTimeLeft}</span>s`;
        timerDisplay.classList.remove('hidden', 'warning');

        recordingInterval = setInterval(() => {
            recordingTimeLeft--;
            const span = document.getElementById('recording-time-left');
            if (span) span.innerText = recordingTimeLeft;
            if (recordingTimeLeft <= 10) timerDisplay.classList.add('warning');

            if (recordingTimeLeft <= 0) {
                clearInterval(recordingInterval);
                if (isRecording) {
                    mediaRecorder.stop();
                    isRecording = false;
                    recordBtn.classList.remove('recording');
                    recordBtn.innerText = 'Processing...';
                    recordBtn.disabled = true;
                    statusText.innerText = "Time limit reached. Transmitting...";
                    timerDisplay.classList.add('hidden');
                    visualizerCanvas.style.display = 'none'; 
                    cancelAnimationFrame(drawVisual);
                }
            }
        }, 1000);

    } else {
        clearInterval(recordingInterval); 
        timerDisplay.classList.add('hidden');
        visualizerCanvas.style.display = 'none'; 
        cancelAnimationFrame(drawVisual);
        
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.classList.remove('recording');
        recordBtn.innerText = 'Processing...';
        recordBtn.disabled = true; 
        statusText.innerText = "Transmitting...";
    }
});

async function processChatRequest(formData) {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if(chatBox.lastChild.innerText === 'You: ...') chatBox.removeChild(chatBox.lastChild);
        if(data.user_text !== "[No response]") appendMessage('user', data.user_text);

        if (data.is_complete) {
            recordBtn.style.display = "none";
            stopTimer();
            if (recordingInterval) clearInterval(recordingInterval);
        }

        statusText.innerText = "Alex is analyzing your response...";
        
        setTimeout(() => {
            statusText.innerText = "Alex is speaking..."; 
            appendMessage('ai', data.ai_text);
            
            playAudioResponse(data.audio, () => {
                if (data.is_complete) {
                    triggerEvaluation();
                } else {
                    recordBtn.disabled = false;
                    recordBtn.innerText = 'Start Answering';
                    statusText.innerText = "Click the button below to start your answer.";
                    startTimer(); 
                }
            });
            
        }, 1000); 

    } catch (error) {
        statusText.innerText = "An error occurred. Please refresh.";
    }
}

async function triggerEvaluation() {
    statusText.innerText = "Interview complete. Generating evaluation rubric...";
    recordBtn.style.display = "none";
    stopTimer();
    if (recordingInterval) clearInterval(recordingInterval);
    if (currentAudioPlayer) currentAudioPlayer.pause();
    
    setTimeout(async () => {
        interviewScreen.classList.add('hidden');
        evalScreen.classList.remove('hidden');
        
        try {
            const response = await fetch('/api/evaluate', { method: 'POST' });
            if (!response.ok) throw new Error("Server status: " + response.status);
            
            const payload = await response.json(); 
            
            // Ultra-safe parsing
            let rawEval = payload.evaluation || {};
            if (typeof rawEval === 'string') {
                try { rawEval = JSON.parse(rawEval); } catch (err) {}
            }

            // Extract the core data
            evaluationData = rawEval.evaluation ? rawEval.evaluation : rawEval;
            fullTranscriptData = payload.transcript || [];
            
            // Ensure no missing variables crash the UI
            const rec = evaluationData.final_recommendation || "Review Required";
            finalRecText.innerText = `Final Recommendation: ${rec}`;
            
            viewDetailsBtn.classList.remove('hidden'); 
            viewTranscriptBtn.classList.remove('hidden'); 
            exitBtn1.classList.remove('hidden'); 
            
            if (evaluationData.dimensions && Array.isArray(evaluationData.dimensions)) {
                renderRadarChart(evaluationData.dimensions);
                let html = '';
                evaluationData.dimensions.forEach(dim => {
                    html += `
                        <div class="dimension-card">
                            <h4>${dim.name} <span class="score-badge">${dim.score || 0}/10</span></h4>
                        </div>
                    `;
                });
                rubricContent.innerHTML = html;
            } else {
                rubricContent.innerHTML = "<p>Evaluation data unavailable.</p>";
            }
            
        } catch (error) {
            console.error("Evaluation error:", error);
            finalRecText.innerText = "Final Recommendation: Needs Manual Review";
            viewTranscriptBtn.classList.remove('hidden'); 
            exitBtn1.classList.remove('hidden'); 
            rubricContent.innerHTML = "<p style='color:#ef4444;'>There was an error formatting the data. Please view the transcript.</p>";
        }
        
    }, 2000);
}

viewTranscriptBtn.addEventListener('click', () => {
    transcriptLog.innerHTML = '';
    
    if (fullTranscriptData && fullTranscriptData.length > 0) {
        fullTranscriptData.forEach(msg => {
            if (msg.role === 'system') return; 
            let displayRole = msg.role === 'assistant' ? 'Alex (AI)' : 'You';
            let text = msg.content.replace(/\[INTERVIEW\s*_?COMPLET[ED]*\]/gi, '').trim();
            if (!text) return;

            transcriptLog.innerHTML += `
                <div class="t-msg ${msg.role}">
                    <strong>${displayRole}:</strong><br/>
                    ${text}
                </div>
            `;
        });
    } else {
        transcriptLog.innerHTML = "<p>Transcript not available.</p>";
    }
    
    transcriptModal.classList.remove('hidden');
});

closeTranscriptBtn.addEventListener('click', () => {
    transcriptModal.classList.add('hidden');
});

viewDetailsBtn.addEventListener('click', () => {
    evalScreen.classList.add('hidden');
    detailedScreen.classList.remove('hidden');
    renderDetailedReport();
});

backToSummaryBtn.addEventListener('click', () => {
    detailedScreen.classList.add('hidden');
    evalScreen.classList.remove('hidden');
});

function openFeedback() {
    evalScreen.classList.add('hidden');
    detailedScreen.classList.add('hidden');
    feedbackScreen.classList.remove('hidden');
}

exitBtn1.addEventListener('click', openFeedback);
exitBtn2.addEventListener('click', openFeedback);

submitFeedbackBtn.addEventListener('click', () => {
    const form = document.getElementById('feedback-form');
    const formData = new FormData(form);
    
    if ([...formData.keys()].length < 6) {
        errorPopup.classList.remove('hidden');
        return; 
    }

    thankYouPopup.classList.remove('hidden');
    setTimeout(() => {
        window.location.reload();
    }, 3000);
});

closeErrorBtn.addEventListener('click', () => {
    errorPopup.classList.add('hidden');
});

function renderDetailedReport() {
    overallExplanation.innerText = evaluationData?.overall_explanation || "No explanation provided.";
    
    let html = '';
    if (evaluationData && evaluationData.dimensions) {
        evaluationData.dimensions.forEach(dim => {
            const percentage = ((dim.score || 0) / 10) * 100;
            html += `
                <div class="detailed-card">
                    <h4>${dim.name} <span style="float:right; color: var(--primary);">${dim.score || 0}/10</span></h4>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${percentage}%"></div>
                    </div>
                    <p class="feedback-text"><strong>Feedback:</strong> ${dim.feedback || "None"}</p>
                    <p class="evidence-text"><strong>Evidence:</strong> " ${dim.evidence || "None"} "</p>
                    <p class="improvement-text"><strong>How to Improve:</strong> ${dim.improvements || "None"}</p>
                </div>
            `;
        });
    }
    detailedContent.innerHTML = html || "<p>No detailed data available.</p>";
}

function renderRadarChart(dimensions) {
    if (!dimensions || dimensions.length === 0) return;
    
    const ctx = document.getElementById('rubric-chart').getContext('2d');
    const labels = dimensions.map(d => d.name);
    const data = dimensions.map(d => d.score || 0);

    new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Candidate Score',
                data: data,
                backgroundColor: 'rgba(253, 184, 19, 0.3)',
                borderColor: 'rgba(253, 184, 19, 1)',
                pointBackgroundColor: '#FDB813',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#FDB813',
                borderWidth: 2
            }]
        },
        options: {
            scales: {
                r: {
                    angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    pointLabels: { color: '#e2e8f0', font: { size: 14 } },
                    suggestedMin: 0,
                    suggestedMax: 10, 
                    ticks: { display: false }
                }
            },
            plugins: { legend: { display: false } },
            maintainAspectRatio: false 
        }
    });
}