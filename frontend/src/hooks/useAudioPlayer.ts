import { useRef, useCallback, useState } from 'react';

interface UseAudioPlayerReturn {
  isPlaying: boolean;
  playAudio: (base64Audio: string) => Promise<void>;
  stopAudio: () => void;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const getAudioContext = useCallback((): AudioContext => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new AudioContext();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playAudio = useCallback(async (base64Audio: string): Promise<void> => {
    // Stop any currently playing audio
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // Ignore if already stopped
      }
    }

    try {
      const ctx = getAudioContext();

      // Decode base64 to ArrayBuffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode the audio data
      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

      // Create and play the source
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      source.onended = () => {
        setIsPlaying(false);
        sourceRef.current = null;
      };

      sourceRef.current = source;
      setIsPlaying(true);
      source.start();
    } catch (error) {
      console.error('[AudioPlayer] Playback error:', error);
      setIsPlaying(false);
    }
  }, [getAudioContext]);

  const stopAudio = useCallback(() => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // Ignore
      }
      sourceRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  return { isPlaying, playAudio, stopAudio };
}
