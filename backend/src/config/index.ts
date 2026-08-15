import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  deepgramApiKey: process.env.DEEPGRAM_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  elevenlabsApiKey: process.env.ELEVENLABS_API_KEY || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};

// Validate required environment variables
export function validateConfig(): void {
  const missing: string[] = [];

  if (!config.deepgramApiKey) {
    missing.push('DEEPGRAM_API_KEY');
  }
  if (!config.groqApiKey) {
    missing.push('GROQ_API_KEY');
  }
  if (!config.elevenlabsApiKey) {
    missing.push('ELEVENLABS_API_KEY');
  }

  if (missing.length > 0) {
    console.error(`\n❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error('   Copy .env.example to .env and fill in your API keys.\n');
    process.exit(1);
  }
}
