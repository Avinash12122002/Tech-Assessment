# 🏥 AI Health Screening Voice Agent

A web application that enables **live voice conversations** with an AI agent for basic health screening. The user speaks to the AI, which asks health-related questions adaptively, and upon call completion generates a **structured health report**.

Built as a submission for the Technical Assessment, adhering strictly to the required JS/TS stack (React + Node.js).

![Tech Stack](https://img.shields.io/badge/React-TypeScript-blue) ![Backend](https://img.shields.io/badge/Node.js-Express-green) ![Transport](https://img.shields.io/badge/Transport-WebSocket-purple)

---

## 🎯 What It Does

1. **Start a call** → AI greets the user and begins a health screening conversation.
2. **Voice conversation** → Push-to-talk interface, AI asks adaptive health questions one by one.
3. **Real-time pipeline** → Audio → Speech-to-Text → LLM → Text-to-Speech → Audio over WebSockets.
4. **End call** → AI generates a structured health report summarizing the conversation gracefully, even if ended early.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React)                       │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐             │
│  │MediaRec- │  │WebSocket │  │  Audio    │             │
│  │order API │  │  Client  │  │  Player   │             │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘             │
│       │              │              │                    │
└───────┼──────────────┼──────────────┼────────────────────┘
        │              │              │
        │    ┌─────────┴─────────┐    │
        │    │   WebSocket (ws)  │    │
        │    └─────────┬─────────┘    │
        │              │              │
┌───────┼──────────────┼──────────────┼────────────────────┐
│       │         Node.js Backend     │                    │
│       ▼              │              ▲                    │
│  ┌─────────┐   ┌─────┴─────┐  ┌────┴─────┐             │
│  │ Deepgram│   │   Groq    │  │ElevenLabs│             │
│  │  STT    │──▶│ Llama-3.1 │─▶│   TTS    │             │
│  │ Nova-3  │   │ 8B-instant│  │  Rachel  │             │
│  └─────────┘   └───────────┘  └──────────┘             │
│                                                          │
│  Session State (in-memory) ─── Report Generator          │
└──────────────────────────────────────────────────────────┘
```

### Pipeline Flow (per turn)

1. **User holds talk button** → Browser records audio via `MediaRecorder`.
2. **User releases** → Audio blob (base64) sent to server via WebSocket.
3. **STT** → Deepgram Nova-3 transcribes audio, auto-detects language (Hindi/English).
4. **LLM** → Groq (Llama-3.1-8b) generates adaptive response using full conversation history.
5. **TTS** → ElevenLabs converts response text to highly realistic speech audio (MP3).
6. **Response** → Audio sent back via WebSocket, browser plays it.
7. **Report** → On call end, Groq generates structured JSON report from the transcript.

## 🛠️ Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | React + TypeScript + Vite | Assessment requirement; modern Glassmorphism UI |
| **Backend** | Node.js + TypeScript + Express | Assessment requirement; single server for REST + WebSocket |
| **Transport** | WebSocket (`ws` library) | Real-time, bidirectional; perfect for push-to-talk turn-based conversation |
| **STT** | Deepgram Nova-3 | Best streaming accuracy, auto language detection (Hindi + English) |
| **LLM** | Groq (Llama-3.1-8b) | Blazing fast inference (near-zero latency), free tier |
| **TTS** | ElevenLabs | Industry-leading voice realism, multilingual support |

## 🚀 Quick Start & Setup Instructions

### Prerequisites

You will need free API keys for the three services powering the pipeline. None of these require a credit card.

1. **Node.js** 18 or higher
2. **Deepgram API Key** — [Sign up free](https://console.deepgram.com)
3. **Groq API Key** — [Get free key](https://console.groq.com/keys)
4. **ElevenLabs API Key** — [Sign up free](https://elevenlabs.io/)

### Setup

```bash
# 1. Clone the repository
git clone <YOUR_REPO_URL>
cd health-screening-ai

# 2. Set up backend
cd backend
cp .env.example .env
# IMPORTANT: Edit backend/.env and add your 3 API keys!
npm install

# 3. Set up frontend
cd ../frontend
npm install

# 4. Start both servers (two terminal windows)

# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Then open **http://localhost:5173** in your browser.

### Environment Variables (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `DEEPGRAM_API_KEY` | ✅ | Deepgram API key for speech-to-text |
| `GROQ_API_KEY` | ✅ | Groq API key for LLM conversation logic |
| `ELEVENLABS_API_KEY`| ✅ | ElevenLabs API key for text-to-speech |
| `PORT` | ❌ | Backend server port (default: `3001`) |
| `FRONTEND_URL` | ❌ | Frontend URL for CORS (default: `http://localhost:5173`) |

## 📋 Assessment Functionality Checklist

### 1. The Call (Must-Have)
- ✅ **Start/End Call buttons** — Full UI integration.
- ✅ **AI greeting & questions** — AI initiates and strictly asks ONE question at a time adaptively.
- ✅ **Conversation state** — AI tracks previous answers and avoids repeating questions.
- ✅ **Language support** — Deepgram auto-detects Hindi/English, and ElevenLabs' multilingual model responds accurately.
- ✅ **Real-time transport** — Built on persistent WebSockets, processing turns instantly. Push-to-talk flow as permitted.

### 2. The Pipeline (Must-Have)
- ✅ **STT → LLM → TTS** — Deepgram → Groq → ElevenLabs.
- ✅ **Turn-taking logic** — Gracefully handles state, prevents overlapping generation.

### 3. The Report (Must-Have)
- ✅ **Structured generation** — Groq synthesizes the conversation into strict JSON.
- ✅ **Clinical summary** — Includes patient info, main concern, duration, severity, and medical follow-up flags.
- ✅ **Graceful incomplete calls** — Generates partial reports automatically if the user hangs up early.

### 🌟 Nice-to-Have (Included!)
- ✅ **Auto language detection** — Seamlessly switches based on user speech.
- ✅ **Silence & Error handling** — Fallbacks for when STT fails or APIs time out.

## 🔧 How the Conversation Works

The LLM is driven by a strict system prompt (`health-screening.ts`) that enforces:
1. **One question at a time** — Never overwhelm the patient.
2. **Acknowledge before asking** — E.g., "I see, that sounds uncomfortable. How long has this been going on?"
3. **Be adaptive** — If the user says "I've had headaches for 3 days", it skips the duration question.
4. **Never diagnose** — Acts strictly as an intake screener.

## 🔮 What I would improve with more time
1. **VAD (Voice Activity Detection)** — Auto-detect when the user stops speaking to remove the need for a push-to-talk button.
2. **Barge-in support** — Allow the user to interrupt the AI mid-sentence (requires VAD and aborting the TTS stream).
3. **Database persistence** — Currently, sessions and reports are stored in-memory and lost on server restart.

## 📄 License
MIT
