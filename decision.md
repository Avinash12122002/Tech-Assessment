# Decision Log

This file logs the meaningful architectural and technical decisions made during the development of the AI Health Screening application.

## Core Stack Decisions

### 1. React & Vite for Frontend
- **Reason:** Vite provides incredibly fast scaffolding and HMR, which is ideal for a 48-hour take-home assessment. React is an industry standard and explicitly requested in the prompt.
- **Trade-off accepted:** Using a pure SPA (Single Page Application) means no server-side rendering (SSR). For a highly interactive, authenticated voice app, SEO/SSR is not a priority, so the simplicity of Vite over Next.js was preferred.

### 2. Node.js & Express for Backend
- **Reason:** Explicitly requested in the prompt. Express is lightweight and easy to mount a WebSocket server onto without complex routing frameworks.

## Architecture & Transport Decisions

### 3. Native WebSockets (`ws`) over WebRTC or Socket.io
- **Reason:** WebRTC is excellent for sub-millisecond, continuous full-duplex audio, but it is notoriously complex to set up (requires STUN/TURN servers, complex handshakes). Since the prompt explicitly permitted a "push-to-talk" turn-based architecture, standard WebSockets were chosen. Socket.io was avoided to prevent unnecessary overhead and polling fallbacks; native `ws` is faster for binary data (audio buffers).
- **Trade-off accepted:** We do not have continuous, full-duplex streaming (no barge-in). The conversation is strictly turn-based.

### 4. Push-to-Talk vs. Continuous Listening
- **Reason:** Continuous listening in a browser introduces massive complexities with acoustic echo cancellation (the AI's voice being picked up by the microphone and sent back to the STT). Push-to-talk completely sidesteps this issue, ensuring clean audio is sent to the STT model and providing deterministic turn-taking state management.
- **Trade-off accepted:** Slightly less natural conversation flow compared to a standard phone call, but highly reliable.

### 5. In-Memory Session Management
- **Reason:** To keep the project easily runnable for an evaluator (just `npm install` and `npm run dev`), external database dependencies (like Redis or PostgreSQL) were avoided.
- **Trade-off accepted:** If the Node.js server restarts, all active sessions and past reports are permanently lost. For a production app, this would be moved to Redis.

## AI Service Decisions

### 6. Deepgram Nova-3 for Speech-to-Text (STT)
- **Reason:** Deepgram currently leads the industry in speed and conversational accuracy. Crucially, Nova-3 supports robust `detect_language` features out of the box, allowing us to hit the "Hindi or English" requirement effortlessly without forcing the user to select a language toggle beforehand.

### 7. OpenAI GPT-4o-mini for LLM
- **Reason:** GPT-4o-mini is exceptionally fast (critical for voice latency) and highly capable of adhering to system prompts (like "only ask one question at a time"). More importantly, it natively supports `response_format: { type: "json_object" }`, making the generation of a strictly typed JSON health report highly reliable.
- **Trade-off accepted:** Slightly less "reasoning" capability than GPT-4o, but for basic health screening and summarization, speed is much more important than deep reasoning.

### 8. OpenAI TTS-1 for Text-to-Speech
- **Reason:** Since we were already using the OpenAI SDK for the LLM, using their TTS endpoint minimized the number of distinct API dependencies and API keys required. It supports streaming and handles Hindi text passably.
- **Trade-off accepted:** While OpenAI TTS sounds great in English, its Indian-accented Hindi is passable but not native-quality. A specialized API like Sarvam AI would sound much more natural for Indian users, but sticking to OpenAI reduced project complexity.

## Implementation Details

### 9. Web Audio API vs. Standard HTML `<audio>` Element
- **Reason:** The AI's responses are received over WebSocket as base64-encoded MP3 chunks. Playing dynamically generated binary audio buffers is much smoother and more reliable using the `AudioContext` API (`useAudioPlayer` hook) than trying to bind base64 data URIs to an `<audio>` DOM element.

### 10. Report Generation Fallback
- **Reason:** LLMs can occasionally fail or time out. If the report generation fails at the end of a call, instead of crashing the UI, the backend catches the error and generates a "minimal" fallback report using the local session state. This ensures the user still gets a graceful end-of-call experience.
