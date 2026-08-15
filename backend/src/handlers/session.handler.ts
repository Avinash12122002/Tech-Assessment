import { v4 as uuidv4 } from 'uuid';
import { Session } from '../types';

/**
 * In-memory session store.
 * For a 48-hour assessment, this is sufficient.
 * Sessions are cleaned up after 1 hour of inactivity.
 */
const sessions = new Map<string, Session>();

// Cleanup interval: remove sessions older than 1 hour
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    const lastActivity = session.endedAt || session.startedAt;
    if (now - lastActivity.getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
      console.log(`[Session] Cleaned up expired session: ${id}`);
    }
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Create a new session.
 */
export function createSession(): Session {
  const session: Session = {
    id: uuidv4(),
    status: 'idle',
    detectedLanguage: null,
    conversationHistory: [],
    collectedData: {
      patientName: null,
      primaryConcern: null,
      symptoms: [],
      duration: null,
      severity: null,
      relatedSymptoms: [],
      additionalNotes: [],
    },
    turnCount: 0,
    startedAt: new Date(),
    endedAt: null,
    transcript: [],
    errors: [],
  };

  sessions.set(session.id, session);
  console.log(`[Session] Created session: ${session.id}`);
  return session;
}

/**
 * Get a session by ID.
 */
export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

/**
 * Update a session.
 */
export function updateSession(id: string, updates: Partial<Session>): Session | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;

  Object.assign(session, updates);
  return session;
}

/**
 * Start a session (mark as active).
 */
export function startSession(id: string): Session | undefined {
  return updateSession(id, { status: 'active', startedAt: new Date() });
}

/**
 * End a session.
 */
export function endSession(id: string): Session | undefined {
  return updateSession(id, { status: 'ended', endedAt: new Date() });
}

/**
 * Add a conversation turn to the session.
 */
export function addTurn(
  id: string,
  userText: string,
  aiText: string,
  detectedLanguage?: string | null
): Session | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;

  // Add to conversation history (for LLM context)
  session.conversationHistory.push(
    { role: 'user', content: userText },
    { role: 'assistant', content: aiText }
  );

  // Add to transcript (for report)
  const now = new Date().toISOString();
  session.transcript.push(
    { role: 'user', text: userText, timestamp: now },
    { role: 'ai', text: aiText, timestamp: now }
  );

  session.turnCount++;

  // Update detected language if available
  if (detectedLanguage && !session.detectedLanguage) {
    session.detectedLanguage = detectedLanguage;
  }

  return session;
}

/**
 * Add an AI greeting to the session transcript and history.
 */
export function addGreeting(id: string, greetingText: string): Session | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;

  session.conversationHistory.push({ role: 'assistant', content: greetingText });
  session.transcript.push({
    role: 'ai',
    text: greetingText,
    timestamp: new Date().toISOString(),
  });

  return session;
}

/**
 * Record an error in the session.
 */
export function addError(id: string, error: string): void {
  const session = sessions.get(id);
  if (session) {
    session.errors.push(error);
  }
}
