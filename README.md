
<div align="center">
  <h1>🎙️ Cuemath AI Tutor Screener</h1>
  <p><strong>An autonomous, voice-based AI interviewer designed to evaluate the soft skills, patience, and clarity of math tutor candidates.</strong></p>
</div>

---

## 📖 Context
Cuemath hires hundreds of tutors every month. Evaluating whether a candidate can explain concepts simply, demonstrate warmth, and show patience is traditionally done via human-led phone screens. It is expensive, slow, and hard to scale.

**The Solution:** Build an AI interviewer that conducts a natural, short, voice-to-voice conversation with candidates, assesses their soft skills dynamically, and outputs a highly detailed, evidence-backed evaluation rubric.

---

## ✨ Features & "Delight"

I didn't just want to build a functional bot; I wanted to build an experience that feels polished, fair, and professional for a candidate's first interaction with Cuemath.

* **Natural Conversational Flow:** The AI gracefully handles transitions, acknowledges greetings before diving into technical questions, and actively asks follow-up questions if a candidate gives a surface-level scenario answer.
* **Audio Waveform Visualizer:** Candidates have real-time visual feedback that their microphone is active and transmitting, reducing technical anxiety.
* **The "View Transcript" Transparency:** Evaluation scores aren't a black box. Candidates (and reviewers) can view the entire unedited conversation log to see exactly why they received their scores.
* **Grammar & Filler Word Tracking:** The AI transcription pipeline is explicitly prompted to capture filler words ("um", "uh") to accurately penalize low-confidence fluency.
* **Strict Evidence Extraction:** The LLM evaluator is forbidden from summarizing. It must extract exact, word-for-word quotes from the candidate to justify every score.

---

## 🧠 Process Thinking & Smart Choices

Building a real-time voice pipeline is messy. Here are the specific tradeoffs and engineering choices made to handle the reality of browsers and LLMs:

### 1. Defeating the "Ghost Words" (Whisper Hallucinations)
**The Problem:** I discovered that when a candidate is silent, or if there is background fan noise, OpenAI's Whisper model aggressively hallucinates words (e.g., *"Svendk takk"*, *"Amen"*, *"Thanks for watching"*).
**The Fix:** I built a custom backend "Ghost Word Filter." If the text matches known hallucinations or is too short, the backend registers it as an explicit `[No response]` timeout rather than passing garbage data to the LLM.

### 2. The Browser AudioContext Trap
**The Problem:** To build the Audio Visualizer, I used the browser's `AudioContext` API. However, Chrome's strict Autoplay policies frequently suspended the audio context if it was created asynchronously or wasn't tied directly to the very first user click.
**The Fix:** I completely decoupled the microphone stream logic. The microphone permission and stream are locked in on the very first "Start Interview" landing screen, while the visualizer canvas remains hidden until needed. This bypasses Chrome's garbage collector and guarantees the visualizer never fails.

### 3. Rate Limit Crash Protection (The 70B vs. 8B Tradeoff)
**The Problem:** I used Llama-3 70B for its incredibly strict reasoning and formatting capabilities. However, real-time voice processing burns through free-tier API rate limits instantly. When Groq threw a `429 Rate Limit` error, the UI would crash.
**The Fix:** I wrapped all LLM calls in absolute `try/except` safety nets. If the 70B model exhausts its tokens, the system gracefully falls back to a lighter `llama3-8b` model to keep the conversation flowing. If the API completely dies, it safely renders a fallback UI instead of a 500 Server Error.

### 4. Defensive JSON Parsing
**The Problem:** LLMs occasionally wrap their JSON outputs in Markdown blocks (````json ... ````) or insert conversational filler before the data, causing standard `json.loads()` to crash the evaluation screen.
**The Fix:** Implemented a highly aggressive Regular Expression (`re.search(r'\{.*\}', raw_content, re.DOTALL)`) that physically rips the JSON object out of the LLM's response, stripping all Markdown and invisible characters.

---

## 🛠️ Tech Stack & Architecture

* **Backend:** Python / FastAPI (for lightning-fast async audio handling)
* **Frontend:** Vanilla HTML / CSS / JavaScript (No heavy frameworks, highly optimized)
* **Speech-to-Text (STT):** OpenAI `whisper-large-v3` (via Groq API)
* **Text-to-Speech (TTS):** Microsoft `edge-tts` (Backend generation to bypass strict browser speech synthesis limits)
* **LLM Engine:** Meta `llama-3.3-70b-versatile` (via Groq API)

---

## 🚀 Running Locally

### Prerequisites
* Python 3.8+
* A Groq API Key

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/kanan-pandey1612/Cuemath-AI-Tutor-Screener
    cd Cuemath-AI-Tutor-Screener
    ```

2.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

3.  **Setup Security / Environment Variables:**
    Create a `.env` file in the root directory and add your API key:
    ```env
    GROQ_API_KEY=your_groq_api_key_here
    ```
    *(Note: `.env` is included in `.gitignore` to prevent credential leaks, fulfilling the security requirement).*

4.  **Run the Server:**
    ```bash
    uvicorn main:app --reload
    ```
5.  **Open the Application:**
    Navigate to `http://127.0.0.1:8000/static/index.html` in your browser.

---
<div align="center">
  <p><i>Built for the Cuemath Assessment</i></p>
</div>
