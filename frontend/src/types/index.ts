// ===== WebSocket Event Types (mirrors backend types) =====

export interface TranscriptEntry {
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export interface SymptomDetail {
  name: string;
  severity: string | null;
  duration: string | null;
  frequency: string | null;
  notes: string | null;
}

export interface FollowUpFlag {
  flag: string;
  reason: string;
  urgency: 'routine' | 'soon' | 'urgent';
}

export interface HealthReport {
  reportId: string;
  generatedAt: string;
  callDuration: string;
  language: string;
  patientInfo: { name: string | null };
  primaryConcern: { complaint: string | null; description: string | null };
  symptoms: SymptomDetail[];
  overallSeverity: string | null;
  relevantHistory: string[];
  followUpFlags: FollowUpFlag[];
  missingInformation: string[];
  conversationSummary: string;
  transcript: TranscriptEntry[];
  disclaimer: string;
  completeness: 'complete' | 'partial' | 'minimal';
}

export type CallStatus =
  | 'idle'
  | 'connecting'
  | 'greeting'
  | 'ready'
  | 'recording'
  | 'processing'
  | 'ai-speaking'
  | 'ended'
  | 'error';

export type AppView = 'call' | 'report';

export type ServerEvent =
  | { type: 'session:started'; sessionId: string }
  | { type: 'transcript:user'; text: string; isFinal: boolean }
  | { type: 'ai:thinking' }
  | { type: 'ai:text'; text: string }
  | { type: 'ai:audio'; audio: string }
  | { type: 'ai:audio:done' }
  | { type: 'session:ended'; sessionId: string }
  | { type: 'report:ready'; report: HealthReport }
  | { type: 'error'; message: string; code: string };
