import OpenAI from 'openai';
import { config } from '../config';
import { HEALTH_SCREENING_SYSTEM_PROMPT, REPORT_GENERATION_PROMPT } from '../prompts/health-screening';
import { Session, HealthReport } from '../types';
import { withRetry, withTimeout, AppError } from '../utils/errors';

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ 
      apiKey: config.groqApiKey,
      baseURL: 'https://api.groq.com/openai/v1'
    });
  }
  return openaiClient;
}

/**
 * Generate the AI's next response in the health screening conversation.
 * Uses the full conversation history to maintain context.
 */
export async function generateResponse(
  conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  detectedLanguage?: string | null
): Promise<string> {
  const client = getClient();

  const lastUserMsg = [...conversationHistory].reverse().find(m => m.role === 'user')?.content?.trim() || '';
  const lowerMsg = lastUserMsg.toLowerCase();

  // Check language intent from latest user turn
  const explicitlyRequestsHindi = /\b(hindi|हिन्दी|हिंदी)\b/i.test(lowerMsg) && !/\b(english|अंग्रेजी)\b/i.test(lowerMsg);
  const explicitlyRequestsEnglish = /\b(english|अंग्रेजी|angrezi)\b/i.test(lowerMsg) && !/\b(hindi|हिन्दी|हिंदी)\b/i.test(lowerMsg);
  const hasDevanagari = /[\u0900-\u097F]/.test(lastUserMsg);

  let isHindi = false;
  if (explicitlyRequestsHindi || hasDevanagari || detectedLanguage === 'hi') {
    isHindi = true;
  }
  if (explicitlyRequestsEnglish) {
    isHindi = false;
  }

  // Ensure system prompt is the first message
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: HEALTH_SCREENING_SYSTEM_PROMPT },
    ...conversationHistory.filter(m => m.role !== 'system'),
  ];

  if (isHindi) {
    messages.push({
      role: 'system',
      content:
        '[DYNAMIC LANGUAGE SWITCH: The user is speaking in HINDI. You MUST respond 100% in proper Devanagari Hindi script (देवनागरी हिन्दी). If the user just selected their language or stated their preference, ask for their Name and Age. NEVER write English/Latin transliterations in parentheses or brackets. Output the Hindi sentence ONCE only.]',
    });
  } else {
    messages.push({
      role: 'system',
      content:
        '[DYNAMIC LANGUAGE SWITCH: The user is speaking in ENGLISH. You MUST respond 100% in clean, professional English. If the user just selected their language or stated their preference, ask for their Name and Age. Do NOT mix Hindi words or add brackets.]',
    });
  }

  const response = await withRetry(
    () =>
      withTimeout(
        client.chat.completions.create({
          model: 'llama-3.1-8b-instant',
          messages,
          temperature: 0.6,
          max_tokens: 250, // Allows helpful practical advice + follow-up question
          top_p: 0.9,
        }),
        10000,
        'LLM response timed out'
      ),
    1,
    1000
  );

  const content = response.choices[0]?.message?.content;

  if (!content || content.trim() === '') {
    throw new AppError('LLM returned empty response', 'LLM_EMPTY');
  }

  // Strip any accidental Romanized transliteration in parentheses at the end of the text
  const cleanContent = content
    .replace(/\s*\([A-Za-z0-9\s,?.!'-]+\)\s*$/g, '')
    .trim();

  return cleanContent || content.trim();
}

/**
 * Generate the initial greeting when the call starts.
 * Asks ONLY for the preferred language first.
 */
export async function generateGreeting(): Promise<string> {
  const client = getClient();

  const response = await withTimeout(
    client.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: HEALTH_SCREENING_SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            '[SYSTEM: The call has just started. Generate a short, welcoming greeting and ask ONLY which language they prefer: English or Hindi. Do NOT ask for name or symptoms yet. Example: "Hello! Welcome to your AI Health Assistant. Which language would you prefer to speak in — English or Hindi? आप हिंदी में भी बात कर सकते हैं।"]',
        },
      ],
      temperature: 0.6,
      max_tokens: 100,
    }),
    10000,
    'Greeting generation timed out'
  );

  const greeting = response.choices[0]?.message?.content?.trim();
  const cleanGreeting = greeting
    ? greeting.replace(/\s*\([A-Za-z0-9\s,?.!'-]+\)\s*$/g, '').trim()
    : '';

  return (
    cleanGreeting ||
    'Hello! Welcome to your AI Health Assistant. Which language would you prefer to speak in — English or Hindi? आप हिंदी में भी बात कर सकते हैं।'
  );
}

/**
 * Generate a structured health report from the conversation.
 */
export async function generateReport(session: Session): Promise<HealthReport> {
  const client = getClient();

  // Build transcript string for the LLM
  const transcriptText = session.transcript
    .map((entry) => `${entry.role === 'user' ? 'Patient' : 'Agent'}: ${entry.text}`)
    .join('\n');

  const callDuration = calculateDuration(session.startedAt, session.endedAt || new Date());

  const response = await withRetry(
    () =>
      withTimeout(
        client.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: REPORT_GENERATION_PROMPT },
            {
              role: 'user',
              content: `Generate a health screening report from this conversation:\n\n${transcriptText}\n\nNumber of exchanges: ${session.turnCount}\nCall duration: ${callDuration}\nDetected language: ${session.detectedLanguage || 'English'}`,
            },
          ],
          temperature: 0.3, // Lower temperature for structured output
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        }),
        30000,
        'Report generation timed out'
      ),
    1,
    2000
  );

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new AppError('Report generation returned empty response', 'REPORT_EMPTY');
  }

  let reportData: any;
  try {
    reportData = JSON.parse(content);
  } catch {
    throw new AppError('Report generation returned invalid JSON', 'REPORT_PARSE_ERROR');
  }

  // Build the complete report
  const report: HealthReport = {
    reportId: session.id,
    generatedAt: new Date().toISOString(),
    callDuration,
    language: session.detectedLanguage || 'en',
    patientInfo: {
      name: reportData.patientInfo?.name || null,
    },
    primaryConcern: {
      complaint: reportData.primaryConcern?.complaint || null,
      description: reportData.primaryConcern?.description || null,
    },
    symptoms: Array.isArray(reportData.symptoms) ? reportData.symptoms : [],
    overallSeverity: reportData.overallSeverity || null,
    relevantHistory: Array.isArray(reportData.relevantHistory)
      ? reportData.relevantHistory
      : [],
    followUpFlags: Array.isArray(reportData.followUpFlags) ? reportData.followUpFlags : [],
    missingInformation: Array.isArray(reportData.missingInformation)
      ? reportData.missingInformation
      : [],
    conversationSummary:
      reportData.conversationSummary ||
      'Insufficient conversation data to generate a meaningful summary.',
    transcript: session.transcript,
    disclaimer:
      'This is an AI-generated health screening summary and does NOT constitute a medical diagnosis, professional medical advice, or treatment recommendation. Please consult a qualified healthcare provider for proper medical evaluation.',
    completeness: reportData.completeness || determineCompleteness(session),
  };

  return report;
}

/**
 * Fallback completeness determination if LLM doesn't provide it.
 */
function determineCompleteness(session: Session): 'complete' | 'partial' | 'minimal' {
  if (session.turnCount <= 1) return 'minimal';
  if (session.turnCount <= 3) return 'partial';
  return 'complete';
}

/**
 * Calculate duration string from start and end times.
 */
function calculateDuration(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime();
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) return `${remainingSeconds} seconds`;
  return `${minutes} min ${remainingSeconds} sec`;
}
