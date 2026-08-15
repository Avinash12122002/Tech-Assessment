import { createClient, DeepgramClient } from '@deepgram/sdk';
import { config } from '../config';
import { withTimeout, withRetry, AppError } from '../utils/errors';

let deepgramClient: DeepgramClient | null = null;

function getClient(): DeepgramClient {
  if (!deepgramClient) {
    deepgramClient = createClient(config.deepgramApiKey);
  }
  return deepgramClient;
}

export interface STTResult {
  transcript: string;
  confidence: number;
  detectedLanguage: string | null;
}

/**
 * Transcribe audio buffer using Deepgram Nova.
 * Uses robust model selection and fallback handling for English, Hindi, and auto-detection.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  preferredLanguage?: string | null,
  mimeType: string = 'audio/webm'
): Promise<STTResult> {
  const client = getClient();

  const primaryOptions: any = {
    smart_format: true,
    punctuate: true,
    mimetype: mimeType,
  };

  if (preferredLanguage === 'hi') {
    primaryOptions.model = 'nova-2';
    primaryOptions.language = 'hi';
  } else if (preferredLanguage === 'en') {
    primaryOptions.model = 'nova-3';
    primaryOptions.language = 'en';
  } else {
    primaryOptions.model = 'nova-2';
    primaryOptions.detect_language = true;
  }

  // Attempt transcription with primary options
  let response = await runTranscription(client, audioBuffer, primaryOptions);

  // If failed with detect_language or specific model, attempt fallback to nova-2
  if (response.error) {
    console.warn('[STT] Primary transcription failed, trying fallback...', response.error);
    const fallbackOptions: any = {
      model: 'nova-2',
      smart_format: true,
      punctuate: true,
      mimetype: mimeType,
      language: preferredLanguage === 'hi' ? 'hi' : 'en',
    };
    response = await runTranscription(client, audioBuffer, fallbackOptions);
  }

  if (response.error) {
    console.error('[Deepgram Error]:', response.error);
    throw new AppError(
      `STT API error: ${response.error.message || JSON.stringify(response.error)}`,
      'STT_ERROR'
    );
  }

  const result = response.result;
  const channel = result?.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];

  if (!alternative || !alternative.transcript || alternative.transcript.trim() === '') {
    throw new AppError(
      'No speech detected in audio. Please try speaking more clearly.',
      'NO_SPEECH'
    );
  }

  return {
    transcript: alternative.transcript.trim(),
    confidence: alternative.confidence || 0,
    detectedLanguage: channel?.detected_language || preferredLanguage || null,
  };
}

async function runTranscription(
  client: DeepgramClient,
  audioBuffer: Buffer,
  options: any
): Promise<{ result: any; error: any }> {
  return withRetry(
    () =>
      withTimeout(
        client.listen.prerecorded.transcribeFile(audioBuffer, options),
        15000,
        'Speech-to-text request timed out'
      ),
    1,
    1000
  );
}
