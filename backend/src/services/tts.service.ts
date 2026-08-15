import { config } from '../config';
import { withRetry, withTimeout, AppError } from '../utils/errors';

/**
 * Convert text to speech using ElevenLabs API.
 * Returns the audio as a Buffer (mp3 format).
 */
export async function synthesizeSpeech(
  text: string,
  language?: string | null
): Promise<Buffer> {
  // Use a default free voice (Bella) with low-latency streaming optimization
  const voiceId = 'EXAVITQu4vr4xnSDxMaL'; 
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?optimize_streaming_latency=3&output_format=mp3_22050_32`;

  const response = await withRetry(
    () =>
      withTimeout(
        fetch(url, {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': config.elevenlabsApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_flash_v2_5',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }),
        10000,
        'Text-to-speech request timed out'
      ),
    1,
    800
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new AppError(`ElevenLabs API error: ${response.status} ${errorText}`, 'TTS_ERROR');
  }

  // Convert the response to a Buffer
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
