import type { CallStatus } from '../types';
import './StatusIndicator.css';

interface StatusIndicatorProps {
  status: CallStatus;
  duration: number; // seconds
}

export function StatusIndicator({ status, duration }: StatusIndicatorProps) {
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = (): string => {
    switch (status) {
      case 'idle':
        return 'Ready to start';
      case 'connecting':
        return 'Connecting...';
      case 'greeting':
        return 'AI is greeting you...';
      case 'ready':
        return 'Hold the button to speak';
      case 'recording':
        return 'Listening...';
      case 'processing':
        return 'Processing...';
      case 'ai-speaking':
        return 'AI is speaking...';
      case 'ended':
        return 'Call ended';
      case 'error':
        return 'An error occurred';
      default:
        return '';
    }
  };

  const getStatusClass = (): string => {
    switch (status) {
      case 'recording':
        return 'status-recording';
      case 'processing':
      case 'greeting':
        return 'status-processing';
      case 'ai-speaking':
        return 'status-speaking';
      case 'error':
        return 'status-error';
      default:
        return '';
    }
  };

  const isCallActive = !['idle', 'ended', 'error'].includes(status);

  return (
    <div className={`status-indicator ${getStatusClass()}`}>
      <div className="status-dot-container">
        <span className={`status-dot ${isCallActive ? 'active' : ''}`} />
      </div>
      <span className="status-text">{getStatusText()}</span>
      {isCallActive && (
        <span className="status-duration">{formatDuration(duration)}</span>
      )}
    </div>
  );
}
