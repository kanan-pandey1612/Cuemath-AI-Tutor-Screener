import os
import shutil
import tempfile
import json
import random
import base64
import re  
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, RedirectResponse
from groq import Groq
from dotenv import load_dotenv
import edge_tts 

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return RedirectResponse(url="/static/index.html")

session_data = {
    "history": [],
    "consecutive_timeouts": 0
}

QUESTION_POOL = [
    "Explain the concept of zero to a 6-year-old.",
    "How would you explain fractions using a pizza or a cake?",
    "A student is crying because they keep getting the wrong answer. How do you handle this?",
    "Why do you want to teach at Cuemath specifically?",
    "Explain negative numbers to a student who has never seen them before.",
    "How do you keep a distracted 8-year-old engaged during an online session?",
    "A parent is upset because their child's grades haven't improved yet. What do you say?",
    "How do you teach a student who claims 'math is useless in real life'?",
    "Explain what a prime number is using a real-world analogy.",
    "A student gives a wildly incorrect answer but is very confident. How do you correct them?",
    "What do you do if your internet connection gets choppy during a session?",
    "How do you praise a student to encourage a growth mindset?",
    "A student memorizes formulas but doesn't understand the logic. How do you fix this?",
    "How would you teach a student to read an analog clock?",
    "What is your strategy for a student who works much faster than average and gets bored?",
    "Explain the concept of probability using a deck of cards or dice.",
    "A student refuses to turn on their camera. How do you build rapport?",
    "How will you explain the difference between a square and a rectangle to a student?",
    "What is the most common mistake you see students make in math?",
    "How do you explain 'pi' to a middle schooler?",
    "A student says they forgot everything from the last session. What is your next move?",
    "How do you explain the order of operations (PEMDAS/BODMAS)?",
    "Describe a time you failed at something and what you learned.",
    "How do you teach long division so it doesn't feel overwhelming?",
    "What do you do if you, the tutor, don't know the answer to a student's question?",
    "Explain ratios and proportions using a cooking recipe.",
    "How do you handle a student who is constantly interrupting you?",
    "How do you incorporate visual aids into a math lesson?",
    "Explain the concept of volume using a swimming pool or a box.",
    "How do you assess if a student actually understands a concept or is just guessing?",
    "A student is exhausted after a long school day. How do you adapt the session?",
    "How do you build confidence in a student who has 'math anxiety'?",
    "Explain the difference between a numerator and a denominator.",
    "How do you set goals with a new student on the first day?",
    "How do you end a tutoring session effectively?",
    "What do you do if a parent is sitting next to the student and answering for them?",
    "How do you make learning multiplication tables fun?",
    "How do you track a student's progress over time?",
    "How do you define success as a math tutor?",
    "How do you explain the concept of parallel lines?",
    "A student asks why they need to learn algebra. What is your response?",
    "What do you do if a student finishes all their work in the first 10 minutes?",
    "How do you handle a situation where a student is visibly frustrated with you?",
    "How do you help a student who constantly mixes up addition and multiplication?",
    "Tell me about a time you had to adapt your communication style.",
    "A parent complains that your teaching style is too slow. How do you respond?",
    "How would you teach the concept of odd and even numbers?",
    "What is your approach to teaching word problems?",
    "A student is extremely shy and only gives one-word answers. How do you engage them?",
    "How do you help a student who suffers from test anxiety?",
    "What do you do if a student tells you they hate math?",
    "A student's younger sibling keeps interrupting the online session. How do you handle it?",
    "What is your favorite math concept to teach and why?",
    "A student is making careless calculation errors despite knowing the concepts. How do you help?",
    "How do you ensure your instructions are clear for a non-native English speaker?",
    "What do you do if you notice a student using a calculator when they shouldn't be?",
    "Tell me about a teacher who inspired you and how you use their methods."
]

def initialize_prompt():
    selected_questions = random.sample(QUESTION_POOL, 8)
    questions_text = "\n".join([f"Question {i+1}: {q}" for i, q in enumerate(selected_questions)])

    return {
        "role": "system", 
        "content": (
            "You are Alex, a highly empathetic and conversational hiring manager at Cuemath. You are conducting a voice interview for a math tutor position. "
            "You are assessing communication clarity, patience, warmth, and ability to simplify concepts. "
            "You just asked the candidate: 'Hello! I'm Alex from the Cuemath hiring team, and I will be taking your interview today. How are you doing today?' "
            "Here is your strict conversational flow:\n\n"
            "PHASE 1: THE TRANSITION (CRITICAL)\n"
            "When the candidate replies to your greeting (e.g., 'I am doing well'), you MUST NOT immediately ask a technical question. Instead, warmly acknowledge their response, validate it, and naturally transition into the interview. "
            "Example transition: 'That's great to hear! Well, it's a pleasure to meet you. Let's go ahead and dive right into the interview, shall we? To start things off...' then ask Question 1.\n\n"
            "PHASE 2: THE CONVERSATION\n"
            "Listen to their answer, validate it briefly (e.g., 'That makes a lot of sense', 'I like that approach'), then ask the next question.\n\n"
            "PHASE 3: FOLLOW-UPS (MANDATORY FOR SCENARIOS)\n"
            "If you ask a scenario-based question (e.g., 'A student is crying...'), DO NOT just accept a generic answer and move on. If they say 'I would calm them down', you MUST ask a probing follow-up like, 'How exactly would you phrase that to them?' or 'Could you give me an example of what you might say?'. Only move to the next question from the list AFTER they elaborate.\n\n"
            "YOUR SELECTED QUESTIONS FOR THIS CANDIDATE:\n"
            f"{questions_text}\n\n"
            "CRITICAL RULES:\n"
            "1. ONLY ask ONE question at a time. Wait for their answer.\n"
            "2. NO REPEATS: You MUST track which questions you have already asked. NEVER ask the same question twice in the interview. Always cross-check the chat history and move to the next fresh question from your list.\n"
            "3. SPEECH PACING: Write your responses specifically to be read aloud by a text-to-speech engine. Use short, simple sentences. Speak like a human, not a robot.\n"
            "4. Keep your conversational responses short, natural, and under 3 sentences.\n"
            "5. Do not list the questions. Ask them naturally as part of a conversation.\n"
            "6. After the candidate answers the 8th and final question, you MUST end the interview. Respond with exactly this phrase and nothing else: '[INTERVIEW_COMPLETE] Thank you so much for your time today. We have everything we need, and your evaluation will be generated shortly.'\n"
            "7. CRITICAL OVERRIDE: If the candidate gives '[No response]' on the FINAL question of the interview, DO NOT issue a warning. Simply output your [INTERVIEW_COMPLETE] phrase and end the interview immediately."
        )
    }

async def generate_speech_base64(text: str) -> str:
    tts_temp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp3")
    tts_path = tts_temp.name
    tts_temp.close()

    communicate = edge_tts.Communicate(text, "en-US-GuyNeural")
    await communicate.save(tts_path)

    with open(tts_path, "rb") as audio_file:
        audio_base64 = base64.b64encode(audio_file.read()).decode('utf-8')
    
    os.remove(tts_path)
    return audio_base64

@app.get("/api/intro")
async def get_intro():
    intro_text = "Hello! I'm Alex from the Cuemath hiring team, and I will be taking your interview today. How are you doing today?"
    audio_base64 = await generate_speech_base64(intro_text)
    
    # CRITICAL FIX: Save Alex's intro message to the official transcript memory!
    session_data["history"].append({"role": "assistant", "content": intro_text})
    
    return JSONResponse({"text": intro_text, "audio": audio_base64})

@app.post("/api/chat")
async def chat(audio: Optional[UploadFile] = File(None), is_timeout: str = Form("false")):
    global session_data
    
    ghost_words_and_noise = [
        "", "svendk takk.", "svendk takk", "amen.", "amen", 
        "thank you.", "thank you", "kuch nahin ho raha.", "kuch nahin ho raha",
        "pakhā chal raha hai.", "pakhā chal raha hai", "fan noise.", "fan noise",
        "thanks for watching.", "thanks for watching"
    ]

    is_internal_timeout = False

    if is_timeout == "true":
        user_text = "[No response]"
        session_data["consecutive_timeouts"] += 1
    else:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
            shutil.copyfileobj(audio.file, temp_audio)
            temp_audio_path = temp_audio.name

        try:
            with open(temp_audio_path, "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    model="whisper-large-v3",
                    file=audio_file,
                    prompt="Umm, let me think... uhh, okay. I mean, like..."
                )
            raw_text = transcript.text.strip()
        finally:
            os.remove(temp_audio_path)
        
        if raw_text.lower() in ghost_words_and_noise or len(raw_text) <= 1:
            user_text = "[No response]"
            session_data["consecutive_timeouts"] += 1
            is_internal_timeout = True
        else:
            user_text = raw_text
            session_data["consecutive_timeouts"] = 0

    session_data["history"].append({"role": "user", "content": user_text})

    if session_data["consecutive_timeouts"] >= 2:
        ai_text = "[INTERVIEW_COMPLETE] It looks like we are having trouble connecting today. Let's conclude the interview here so you can check your technical setup. Thank you so much for your time, and your evaluation will be generated shortly."
        session_data["history"].append({"role": "assistant", "content": ai_text})
    else:
        messages_for_llm = session_data["history"].copy()
        
        if session_data["consecutive_timeouts"] == 0:
            messages_for_llm.append({
                "role": "system",
                "content": "CRITICAL RULE: Critically evaluate if the candidate's last message makes sense in the context of the interview. If it is random gibberish (e.g. 'Svendk Takk'), complete nonsense, or just random alphabet sounds, DO NOT accept it as an answer. React with polite confusion, state that you didn't quite catch that, and ask them to repeat or clarify."
            })
        elif session_data["consecutive_timeouts"] == 1:
            messages_for_llm.append({
                "role": "system",
                "content": "CRITICAL RULE: The candidate did not respond. Gently and briefly check if they are still there or having audio issues, reassure them it's okay, and ask the next question."
            })

        try:
            # Using the original, powerful 70B model
            completion = client.chat.completions.create(
                model="llama-3.1-8b-instant",#model="llama-3.3-70b-versatile", 
                messages=messages_for_llm
            )
            ai_text = completion.choices[0].message.content
        except Exception as e:
            print(f"API CRASH PROTECTED: {e}")
            ai_text = "[INTERVIEW_COMPLETE] I apologize, but our servers are currently experiencing high traffic limits. We will need to pause the interview here. Your evaluation will be generated based on what we have so far."
            
        session_data["history"].append({"role": "assistant", "content": ai_text})

    complete_pattern = r'\[INTERVIEW\s*_?COMPLET[ED]*\]'
    is_complete = bool(re.search(complete_pattern, ai_text, re.IGNORECASE))
    
    clean_ai_text = re.sub(complete_pattern, '', ai_text, flags=re.IGNORECASE).strip()

    if not clean_ai_text and is_complete:
        clean_ai_text = "Thank you so much for your time today. We have everything we need, and your evaluation will be generated shortly."

    audio_b64 = await generate_speech_base64(clean_ai_text)
    
    final_timeout_state = is_timeout == "true" or is_internal_timeout

    return JSONResponse({
        "user_text": user_text,
        "ai_text": clean_ai_text,
        "is_complete": is_complete,
        "is_timeout": final_timeout_state,
        "audio": audio_b64
    })

@app.post("/api/evaluate")
async def evaluate():
    evaluation_prompt = {
        "role": "system",
        "content": (
            "Based on the preceding interview transcript, generate a structured evaluation rubric. "
            "Assess the following dimensions: Clarity, Warmth, Simplicity, Patience, and Fluency. "
            "Provide a score out of 10 (0-10) for each dimension. "
            "CRITICAL GRADING RULES:\n"
            "1. Be a highly strict and objective grader. Do not be generous.\n"
            "2. If the interview was cut short due to technical issues or timeouts, or if the candidate spoke too little to assess a dimension, you MUST score that dimension a 0. Do NOT default to a 5/10 when data is missing.\n"
            "3. EVIDENCE MUST BE EXACT QUOTES: For the 'evidence' field, you MUST extract an EXACT, word-for-word quote from the user's dialogue in the transcript. Do NOT summarize or paraphrase. You MUST use their actual spoken words. If there are no words to support it, write 'None'.\n"
            "4. GRAMMAR, FLUENCY & FILLER WORD PENALTY: Strictly grade the 'Fluency' dimension. Pay close attention to filler words ('um', 'uh', 'like') in the transcript. If the candidate uses excessive filler words or broken grammar, heavily deduct points for lack of confidence and fluency. You MUST quote the exact grammatical mistake or filler words in the 'evidence' field and mention it in the 'feedback'.\n"
            "5. If the score is 0 due to lack of data, set the evidence to 'None' and the feedback to 'Insufficient data to evaluate.'\n"
            "Output the response strictly as a JSON object with this structure: "
            "{\"dimensions\": [{\"name\": \"Clarity\", \"score\": 8, \"evidence\": \"[EXACT QUOTE OR 'None']\", \"feedback\": \"...\", \"improvements\": \"...\"}], \"final_recommendation\": \"Pass/Fail\", \"overall_explanation\": \"Explanation here...\"}"
        )
    }
    
    eval_history = session_data["history"].copy()
    eval_history.append(evaluation_prompt)
    
    try:
        # Using the original, powerful 70B model
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            response_format={ "type": "json_object" },
            messages=eval_history
        )
        raw_content = completion.choices[0].message.content
        
        match = re.search(r'\{.*\}', raw_content, re.DOTALL)
        clean_content = match.group(0) if match else raw_content
        clean_content = clean_content.strip() 
        
        result = json.loads(clean_content)
        
        if "dimensions" not in result:
            result["dimensions"] = []
        if "final_recommendation" not in result:
            result["final_recommendation"] = "Pass (Defaulted)"
        if "overall_explanation" not in result:
            result["overall_explanation"] = "Evaluation complete."
            
    except Exception as e:
        print(f"EVALUATION CRASH PROTECTED: {e}")
        # Server Crash Protection! Now with all 5 dimensions so the UI always looks correct.
        result = {
            "final_recommendation": "API Limit Reached",
            "overall_explanation": "The Groq AI API rate limit was exhausted during evaluation. Please wait a moment or review the raw transcript manually.",
            "dimensions": [
                {"name": "Clarity", "score": 0, "evidence": "None", "feedback": "API Limit Reached", "improvements": "N/A"},
                {"name": "Warmth", "score": 0, "evidence": "None", "feedback": "API Limit Reached", "improvements": "N/A"},
                {"name": "Simplicity", "score": 0, "evidence": "None", "feedback": "API Limit Reached", "improvements": "N/A"},
                {"name": "Patience", "score": 0, "evidence": "None", "feedback": "API Limit Reached", "improvements": "N/A"},
                {"name": "Fluency", "score": 0, "evidence": "None", "feedback": "API Limit Reached", "improvements": "N/A"}
            ]
        }
    
    return JSONResponse({
        "evaluation": result,
        "transcript": session_data["history"]
    })

@app.post("/api/reset")
async def reset():
    session_data["history"] = [initialize_prompt()]
    session_data["consecutive_timeouts"] = 0
    return {"status": "reset"}