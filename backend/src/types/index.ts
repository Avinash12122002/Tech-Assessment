// ===== Session Types =====

export interface TranscriptEntry {
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export interface CollectedData {
  patientName: string | null;
  primaryConcern: string | null;
  symptoms: string[];
  duration: string | null;
  severity: string | null;
  relatedSymptoms: string[];
  additionalNotes: string[];
}

export interface Session {
  id: string;
  status: 'idle' | 'active' | 'ended';
  detectedLanguage: string | null;
  conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  collectedData: CollectedData;
  turnCount: number;
  startedAt: Date;
  endedAt: Date | null;
  transcript: TranscriptEntry[];
  errors: string[];
}

// ===== WebSocket Event Types =====

export type ClientEvent =
  | { type: 'session:start'; sessionId: string }
  | { type: 'audio:user'; sessionId: string; audio: string } // base64 encoded
  | { type: 'session:end'; sessionId: string };

export type ServerEvent =
  | { type: 'session:started'; sessionId: string }
  | { type: 'transcript:user'; text: string; isFinal: boolean }
  | { type: 'ai:thinking' }
  | { type: 'ai:text'; text: string }
  | { type: 'ai:audio'; audio: string } // base64 encoded
  | { type: 'ai:audio:done' }
  | { type: 'session:ended'; sessionId: string }
  | { type: 'report:ready'; report: HealthReport }
  | { type: 'error'; message: string; code: string };

// ===== Report Types =====

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

  patientInfo: {
    name: string | null;
  };

  primaryConcern: {
    complaint: string | null;
    description: string | null;
  };

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
