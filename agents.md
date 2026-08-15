# Architecture, Workflow & Coding Standards

This document outlines the architectural decisions, development workflow, and coding standards for the AI Health Screening application.

## 🏗️ Architecture

The application is built using a decoupled client-server architecture to ensure clear separation of concerns.

### 1. Frontend (React + TypeScript + Vite)
- **UI Layer**: Composed of modular React components (`CallView`, `ReportView`, `StatusIndicator`, `TranscriptPanel`). 
- **Logic Separation**: Complex browser APIs are abstracted into custom hooks:
  - `useWebSocket.ts`: Manages connection lifecycle, auto-reconnection, and message parsing.
  - `useAudioRecorder.ts`: Wraps the `MediaRecorder` API to capture microphone input cleanly.
  - `useAudioPlayer.ts`: Wraps the `AudioContext` (Web Audio API) to play base64-encoded MP3 audio from the AI.
- **State Management**: Local component state (React `useState`) is sufficient for this scope. No Redux or Context API overhead was introduced.

### 2. Backend (Node.js + Express + WebSocket)
- **Transport Layer**: Express handles REST endpoints (like creating a session), while the `ws` library handles the persistent WebSocket connection for low-latency, bidirectional audio/text transmission.
- **Handlers Layer**:
  - `websocket.handler.ts`: The core orchestrator. Maps incoming WS events to the STT → LLM → TTS pipeline.
  - `session.handler.ts`: Manages the in-memory state of active calls, keeping track of conversation history and metadata.
- **Services Layer**: Wrappers around 3rd-party APIs.
  - `stt.service.ts`: Deepgram Nova-3 integration.
  - `llm.service.ts`: OpenAI GPT-4o-mini integration for conversation and report generation.
  - `tts.service.ts`: OpenAI TTS-1 integration.

---

## 🔄 Development Workflow

1. **Environment Setup**: 
   - Both `frontend` and `backend` require their own `npm install`.
   - Backend requires a `.env` file with `OPENAI_API_KEY` and `DEEPGRAM_API_KEY`.
2. **Local Development**:
   - Run backend: `cd backend && npm run dev` (Starts on port 3001).
   - Run frontend: `cd frontend && npm run dev` (Starts on port 5173).
   - The Vite dev server is configured to proxy `/api` and `/ws` requests to `localhost:3001` to avoid CORS/port issues during development.
3. **Type Synchronization**: 
   - Shared interfaces (like `ServerEvent` and `HealthReport`) exist in both `frontend/src/types/index.ts` and `backend/src/types/index.ts`. When modifying the event protocol, both must be updated manually.

---

## 📐 Coding Standards

### TypeScript
- **Strict Mode**: Enabled in `tsconfig.json` for both projects.
- **Type-only Imports**: Enforced `verbatimModuleSyntax`. Imports of types must use `import type { ... }`.
- **Explicit Returns**: Service functions and hooks should have explicit return types.
- **No `any`**: The use of `any` is strictly minimized, primarily reserved only for catch blocks where `error: any` is used before message extraction.

### Error Handling
- **Custom AppError**: Backend uses a custom `AppError` class with specific error codes (e.g., `NO_SPEECH`, `STT_ERROR`) to allow the WebSocket handler to make routing decisions based on the failure reason.
- **Resilience**: External API calls are wrapped in `withRetry` and `withTimeout` utilities to prevent hanging promises and survive momentary network blips.
- **Graceful Degradation**: 
  - If STT fails to hear speech, the UI informs the user rather than crashing.
  - If TTS fails, the text response is still sent to the transcript so the conversation can continue.
  - If the call ends prematurely, the report generator catches it and flags the report as `minimal` or `partial`.

### Formatting & CSS
- **CSS Modules/Vanilla CSS**: Standard vanilla CSS is used for styling. CSS is scoped by component file names (e.g., `CallView.css`).
- **Modern CSS**: Utilize CSS grid, flexbox, and CSS variables. Avoid absolute positioning where flexbox suffices.
