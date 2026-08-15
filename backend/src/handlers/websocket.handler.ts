import WebSocket from 'ws';
import { ClientEvent, ServerEvent } from '../types';
import { transcribeAudio } from '../services/stt.service';
import { generateResponse, generateGreeting, generateReport } from '../services/llm.service';
import { synthesizeSpeech } from '../services/tts.service';
import {
  getSession,
  startSession,
  endSession,
  addTurn,
  addGreeting,
  addError,
} from './session.handler';

/**
 * Send a typed event to the WebSocket client.
 */
function send(ws: WebSocket, event: ServerEvent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

/**
 * Send an error event to the client.
 */
function sendError(ws: WebSocket, message: string, code: string): void {
  send(ws, { type: 'error', message, code });
}

/**
 * Handle a new WebSocket connection.
 */
export function handleWebSocketConnection(ws: WebSocket): void {
  console.log('[WebSocket] New client connected');

  // Track if this connection is currently processing a turn
  let isProcessing = false;

  ws.on('message', async (data: Buffer) => {
    let event: ClientEvent;

    try {
      event = JSON.parse(data.toString()) as ClientEvent;
    } catch {
      sendError(ws, 'Invalid message format', 'INVALID_FORMAT');
      return;
    }

    try {
      switch (event.type) {
        case 'session:start':
          await handleSessionStart(ws, event.sessionId);
          break;

        case 'audio:user':
          if (isProcessing) {
            sendError(ws, 'Still processing previous turn. Please wait.', 'BUSY');
            return;
          }
          isProcessing = true;
          try {
            await handleUserAudio(ws, event.sessionId, event.audio);
          } finally {
            isProcessing = false;
          }
          break;

        case 'session:end':
          await handleSessionEnd(ws, event.sessionId);
          break;

        default:
          sendError(ws, 'Unknown event type', 'UNKNOWN_EVENT');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred';
      console.error('[WebSocket] Error handling event:', message);
      sendError(ws, message, 'INTERNAL_ERROR');
    }
  });

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('[WebSocket] Connection error:', error.message);
  });
}

/**
 * Handle call start: generate and send AI greeting.
 */
async function handleSessionStart(ws: WebSocket, sessionId: string): Promise<void> {
  const session = getSession(sessionId);
  if (!session) {
    sendError(ws, 'Session not found. Please create a new session.', 'SESSION_NOT_FOUND');
    return;
  }

  startSession(sessionId);
  send(ws, { type: 'session:started', sessionId });

  console.log(`[Session ${sessionId}] Call started`);

  // Generate and send greeting
  try {
    send(ws, { type: 'ai:thinking' });

    const greetingText = await generateGreeting();
    addGreeting(sessionId, greetingText);

    send(ws, { type: 'ai:text', text: greetingText });

    // Generate greeting audio
    const audioBuffer = await synthesizeSpeech(greetingText, null);
    const audioBase64 = audioBuffer.toString('base64');
    send(ws, { type: 'ai:audio', audio: audioBase64 });
    send(ws, { type: 'ai:audio:done' });

    console.log(`[Session ${sessionId}] Greeting sent`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate greeting';
    console.error(`[Session ${sessionId}] Greeting error:`, message);
    addError(sessionId, message);

    // Send a fallback text greeting without audio
    const fallback = 'Hello! Welcome to the health screening. How can I help you today?';
    addGreeting(sessionId, fallback);
    send(ws, { type: 'ai:text', text: fallback });
    send(ws, { type: 'ai:audio:done' });
  }
}

/**
 * Handle user audio: STT → LLM → TTS pipeline.
 */
async function handleUserAudio(ws: WebSocket, sessionId: string, audioBase64: string): Promise<void> {
  const session = getSession(sessionId);
  if (!session) {
    sendError(ws, 'Session not found.', 'SESSION_NOT_FOUND');
    return;
  }

  if (session.status !== 'active') {
    sendError(ws, 'Session is not active.', 'SESSION_NOT_ACTIVE');
    return;
  }

  // 1. Decode audio
  const audioBuffer = Buffer.from(audioBase64, 'base64');

  if (audioBuffer.length < 200) {
    // Very small audio — empty or silent click
    sendError(ws, 'Audio was too short or silent. Please try speaking again.', 'AUDIO_TOO_SHORT');
    return;
  }

  // 2. Speech-to-Text
  let userText: string;
  let detectedLanguage: string | null = null;

  try {
    const sttResult = await transcribeAudio(audioBuffer, session.detectedLanguage);
    userText = sttResult.transcript;
    detectedLanguage = sttResult.detectedLanguage;

    send(ws, { type: 'transcript:user', text: userText, isFinal: true });
    console.log(`[Session ${sessionId}] STT: "${userText}" (lang: ${detectedLanguage}, conf: ${sttResult.confidence})`);
  } catch (error: any) {
    if (error.code === 'NO_SPEECH') {
      sendError(ws, "I didn't catch that. Could you please try speaking again?", 'NO_SPEECH');
    } else {
      sendError(
        ws,
        'Sorry, I had trouble understanding the audio. Please try again.',
        'STT_ERROR'
      );
    }
    addError(sessionId, `STT Error: ${error.message}`);
    return;
  }

  // 3. LLM Response
  send(ws, { type: 'ai:thinking' });

  let aiText: string;
  try {
    // Build conversation with the new user message
    const history = [
      ...session.conversationHistory,
      { role: 'user' as const, content: userText },
    ];

    aiText = await generateResponse(history, detectedLanguage);

    send(ws, { type: 'ai:text', text: aiText });
    console.log(`[Session ${sessionId}] LLM: "${aiText}"`);
  } catch (error: any) {
    const fallbackText = "I'm sorry, I'm having a moment of difficulty. Could you please repeat what you said?";
    send(ws, { type: 'ai:text', text: fallbackText });
    aiText = fallbackText;
    addError(sessionId, `LLM Error: ${error.message}`);
    console.error(`[Session ${sessionId}] LLM error:`, error.message);
  }

  // 4. Text-to-Speech
  try {
    const ttsBuffer = await synthesizeSpeech(aiText, detectedLanguage);
    const ttsBase64 = ttsBuffer.toString('base64');
    send(ws, { type: 'ai:audio', audio: ttsBase64 });
    send(ws, { type: 'ai:audio:done' });
  } catch (error: any) {
    // TTS failed — user still gets the text response
    console.error(`[Session ${sessionId}] TTS error:`, error.message);
    send(ws, { type: 'ai:audio:done' });
    addError(sessionId, `TTS Error: ${error.message}`);
  }

  // 5. Update session state
  addTurn(sessionId, userText, aiText, detectedLanguage);
}

/**
 * Handle call end: generate report.
 */
async function handleSessionEnd(ws: WebSocket, sessionId: string): Promise<void> {
  const session = getSession(sessionId);
  if (!session) {
    sendError(ws, 'Session not found.', 'SESSION_NOT_FOUND');
    return;
  }

  endSession(sessionId);
  send(ws, { type: 'session:ended', sessionId });
  console.log(`[Session ${sessionId}] Call ended after ${session.turnCount} turns`);

  // Generate report
  try {
    const updatedSession = getSession(sessionId);
    if (!updatedSession) {
      sendError(ws, 'Session lost during report generation.', 'SESSION_LOST');
      return;
    }

    const report = await generateReport(updatedSession);
    send(ws, { type: 'report:ready', report });
    console.log(`[Session ${sessionId}] Report generated (${report.completeness})`);
  } catch (error: any) {
    console.error(`[Session ${sessionId}] Report generation error:`, error.message);
    // Send a minimal report rather than failing completely
    const updatedSession = getSession(sessionId);
    send(ws, {
      type: 'report:ready',
      report: {
        reportId: sessionId,
        generatedAt: new Date().toISOString(),
        callDuration: '0 seconds',
        language: updatedSession?.detectedLanguage || 'en',
        patientInfo: { name: null },
        primaryConcern: { complaint: null, description: null },
        symptoms: [],
        overallSeverity: null,
        relevantHistory: [],
        followUpFlags: [],
        missingInformation: [
          'Patient name',
          'Primary concern',
          'Symptoms',
          'Duration',
          'Severity',
        ],
        conversationSummary:
          'The health screening call was ended before sufficient information could be gathered. A complete screening was not performed.',
        transcript: updatedSession?.transcript || [],
        disclaimer:
          'This is an AI-generated health screening summary and does NOT constitute a medical diagnosis, professional medical advice, or treatment recommendation. Please consult a qualified healthcare provider for proper medical evaluation.',
        completeness: 'minimal',
      },
    });
  }
}
