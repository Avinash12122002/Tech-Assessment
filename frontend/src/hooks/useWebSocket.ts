import { useRef, useCallback, useEffect, useState } from 'react';
import type { ServerEvent } from '../types';

const DEFAULT_RENDER_BACKEND = 'tech-assessment-rwtd.onrender.com';

function getWebSocketUrl(): string {
  let rawUrl = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  if (rawUrl) {
    // Correct accidental double protocols or http(s) prefixes
    if (rawUrl.startsWith('ws://https://') || rawUrl.startsWith('wss://https://')) {
      return rawUrl.replace(/^ws(s)?:\/\/https:\/\//, 'wss://');
    }
    if (rawUrl.startsWith('ws://http://')) {
      return rawUrl.replace('ws://http://', 'ws://');
    }
    if (rawUrl.startsWith('https://')) {
      return rawUrl.replace('https://', 'wss://');
    }
    if (rawUrl.startsWith('http://')) {
      return rawUrl.replace('http://', 'ws://');
    }
    return rawUrl;
  }

  if (import.meta.env.VITE_API_URL) {
    const apiUrl = (import.meta.env.VITE_API_URL as string).trim();
    const wsProto = apiUrl.startsWith('https:') ? 'wss:' : 'ws:';
    const host = apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `${wsProto}//${host}/ws`;
  }

  // If running locally
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'ws://localhost:3001/ws';
  }

  // Production fallback directly to Render backend
  return `wss://${DEFAULT_RENDER_BACKEND}/ws`;
}

const WS_URL = getWebSocketUrl();
const RECONNECT_DELAY = 2000;
const MAX_RECONNECT_ATTEMPTS = 3;

interface UseWebSocketReturn {
  isConnected: boolean;
  send: (data: object) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket(
  onMessage: (event: ServerEvent) => void
): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const onMessageRef = useRef(onMessage);
  const [isConnected, setIsConnected] = useState(false);

  // Keep the callback ref updated
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    // Don't reconnect if already connected
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        setIsConnected(true);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ServerEvent;
          onMessageRef.current(data);
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };

      ws.onclose = (event) => {
        console.log('[WS] Disconnected', event.code, event.reason);
        setIsConnected(false);
        wsRef.current = null;

        // Auto-reconnect if disconnected unexpectedly
        if (!event.wasClean && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts.current++;
          console.log(
            `[WS] Reconnecting (attempt ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})...`
          );
          setTimeout(connect, RECONNECT_DELAY * reconnectAttempts.current);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };
    } catch (err) {
      console.error('[WS] Failed to connect:', err);
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    reconnectAttempts.current = MAX_RECONNECT_ATTEMPTS; // Prevent auto-reconnect
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect');
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const send = useCallback((data: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn('[WS] Cannot send — not connected');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmount');
      }
    };
  }, []);

  return { isConnected, send, connect, disconnect };
}
