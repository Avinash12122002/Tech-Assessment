# Execution Flow

This document maps exactly how data and execution travel through the application during a typical user session.

## 1. Startup Flow

1. **Backend**: `server.ts` executes.
   - Express app is instantiated.
   - REST endpoints (`/api/health`, `/api/session`) are registered.
   - `WebSocketServer` is attached to the HTTP server at `/ws`.
   - `handleWebSocketConnection` is bound to the `connection` event.
2. **Frontend**: `main.tsx` mounts `App.tsx`.
   - `App.tsx` initializes with `currentView = 'call'`.
   - `CallView` component is rendered, which initializes `useWebSocket`, `useAudioRecorder`, and `useAudioPlayer` hooks.

## 2. Call Initialization Flow

When the user clicks **"Start Health Screening"** in `CallView.tsx`:

1. `CallView.handleStartCall()` fires.
2. **REST Request**: Client sends `POST /api/session` to backend.
3. **Backend Session Creation**: `server.ts` calls `createSession()` (in `session.handler.ts`), which returns a new UUID `sessionId`.
4. **WebSocket Connect**: Frontend `useWebSocket.connect()` establishes connection to `/ws`.
5. **WebSocket Start Event**: Frontend sends `{ type: 'session:start', sessionId }` over WS.
6. **Backend WS Handler**: `websocket.handler.ts` receives event and routes to `handleSessionStart()`.
7. **AI Greeting Generation**: 
   - Backend calls `generateGreeting()` (in `llm.service.ts`).
   - Generates greeting text using OpenAI.
   - Backend calls `synthesizeSpeech()` (in `tts.service.ts`).
   - Converts text to MP3 Buffer.
8. **Greeting Sent to Client**: Backend sends WS events: `ai:thinking` → `ai:text` → `ai:audio` → `ai:audio:done`.
9. **Client Plays Greeting**: `CallView` handles `ai:audio`, passing base64 string to `playAudio()` (in `useAudioPlayer.ts`). State changes to `ready` when audio completes.

## 3. Speaking Turn Flow (Push-to-Talk)

When the user holds the **Mic Button**:

1. **Recording Starts**: `CallView.handleTalkStart()` calls `startRecording()` in `useAudioRecorder.ts`. `MediaRecorder` begins capturing mic input as `audio/webm`.
2. **Recording Ends**: User releases button. `handleTalkEnd()` calls `stopRecording()`, converting the Blob to a Base64 string.
3. **Send Audio**: Client sends `{ type: 'audio:user', sessionId, audio }` via WebSocket.
4. **Backend Processing** (`handleUserAudio` in `websocket.handler.ts`):
   - **Decode**: Base64 converted back to Node `Buffer`.
   - **STT**: `transcribeAudio(buffer)` (in `stt.service.ts`) sends buffer to Deepgram. Returns `{ transcript, detectedLanguage }`.
   - **STT Event**: Sends `transcript:user` to frontend to display what the user said.
   - **LLM**: `generateResponse(history)` (in `llm.service.ts`) sends the conversation history (managed via `session.handler.ts`) to GPT-4o-mini. Returns the AI's text response.
   - **LLM Event**: Sends `ai:text` to frontend to display AI's text.
   - **TTS**: `synthesizeSpeech(text, language)` (in `tts.service.ts`) sends text to OpenAI TTS. Returns MP3 Buffer.
   - **Audio Event**: Buffer converted to Base64 and sent to frontend via `ai:audio`.
   - **State Update**: `addTurn()` appends the user's input and AI's output to the in-memory session array.
5. **Client Playback**: `CallView` receives `ai:audio` and plays it via Web Audio API.

## 4. Report Generation Flow

When the user clicks **"End Call"**:

1. **Client End Event**: `CallView.handleEndCall()` sends `{ type: 'session:end', sessionId }` via WebSocket.
2. **Backend End Handler**: `websocket.handler.ts` receives event, routes to `handleSessionEnd()`.
3. **End State**: Calls `endSession()` to mark session as complete. Sends `session:ended` back to client so UI can show a loading spinner.
4. **LLM Summarization**: Calls `generateReport(session)` (in `llm.service.ts`).
   - Constructs a massive prompt string containing the entire conversation transcript.
   - Sends to GPT-4o-mini with `response_format: { type: 'json_object' }`.
   - Parses the returned JSON string into the `HealthReport` TypeScript interface.
5. **Report Event**: Sends `{ type: 'report:ready', report }` back to frontend.
6. **Client View Switch**: `CallView` receives report, triggers `onReportReady(report)` prop.
7. **Render Report**: `App.tsx` updates state, unmounts `CallView`, and mounts `ReportView.tsx`, passing the report data as props to be displayed visually.
