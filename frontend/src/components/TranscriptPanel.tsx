import { useRef, useEffect } from 'react';
import type { TranscriptEntry } from '../types';
import './TranscriptPanel.css';

interface TranscriptPanelProps {
  entries: TranscriptEntry[];
  isThinking: boolean;
}

export function TranscriptPanel({ entries, isThinking }: TranscriptPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries appear
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, isThinking]);

  if (entries.length === 0 && !isThinking) {
    return (
      <div className="transcript-panel">
        <div className="transcript-empty">
          <span className="transcript-empty-icon">💬</span>
          <p>Conversation will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="transcript-panel">
      <div className="transcript-header">
        <span className="transcript-title">Conversation</span>
        <span className="transcript-count">{entries.length} messages</span>
      </div>
      <div className="transcript-messages">
        {entries.map((entry, index) => (
          <div
            key={index}
            className={`transcript-message ${entry.role === 'user' ? 'message-user' : 'message-ai'}`}
          >
            <div className="message-avatar">
              {entry.role === 'user' ? '🗣️' : '🤖'}
            </div>
            <div className="message-content">
              <span className="message-role">
                {entry.role === 'user' ? 'You' : 'AI Agent'}
              </span>
              <p className="message-text">{entry.text}</p>
            </div>
          </div>
        ))}
        {isThinking && (
          <div className="transcript-message message-ai">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <span className="message-role">AI Agent</span>
              <div className="thinking-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
