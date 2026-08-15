import { useState, useCallback, useEffect } from 'react';
import type { CallStatus, TranscriptEntry, HealthReport, ServerEvent } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { TranscriptPanel } from './TranscriptPanel';
import './CallView.css';

const API_URL = import.meta.env.VITE_API_URL || '';

interface CallViewProps {
  onReportReady: (report: HealthReport) => void;
}

export function CallView({ onReportReady }: CallViewProps) {
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const { isRecording, startRecording, stopRecording, initMicrophone, cleanup, error: recorderError } = useAudioRecorder();
  const { isPlaying, playAudio, stopAudio } = useAudioPlayer();
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const handleMessage = useCallback(
    (event: ServerEvent) => {
      switch (event.type) {
        case 'session:started':
          setCallStatus('greeting');
          break;

        case 'transcript:user':
          if (event.isFinal) {
            setTranscript((prev) => [
              ...prev,
              { role: 'user', text: event.text, timestamp: new Date().toISOString() },
            ]);
          }
          break;

        case 'ai:thinking':
          setIsThinking(true);
          setCallStatus('processing');
          break;

        case 'ai:text':
          setIsThinking(false);
          setTranscript((prev) => [
            ...prev,
            { role: 'ai', text: event.text, timestamp: new Date().toISOString() },
          ]);
          break;

        case 'ai:audio':
          setCallStatus('ai-speaking');
          playAudio(event.audio).catch(console.error);
          break;

        case 'ai:audio:done':
          setTimeout(() => {
            setCallStatus((current) => {
              if (current === 'ai-speaking' || current === 'processing' || current === 'greeting') {
                return 'ready';
              }
              return current;
            });
          }, 300);
          break;

        case 'session:ended':
          setCallStatus('ended');
          break;

        case 'report:ready':
          onReportReady(event.report);
          break;

        case 'error':
          console.error('[CallView] Server error:', event.message, event.code);
          setErrorMessage(event.message);
          if (event.code !== 'BUSY') {
            setCallStatus((current) => {
              if (current === 'processing' || current === 'recording') {
                return 'ready';
              }
              return current;
            });
            setIsThinking(false);
          }
          setTimeout(() => setErrorMessage(null), 5000);
          break;
      }
    },
    [onReportReady, playAudio]
  );

  const { send, connect } = useWebSocket(handleMessage);

  useEffect(() => {
    if (!isPlaying && callStatus === 'ai-speaking') {
      setCallStatus('ready');
    }
  }, [isPlaying, callStatus]);

  useEffect(() => {
    if (recorderError) {
      setErrorMessage(recorderError);
      setTimeout(() => setErrorMessage(null), 7000);
    }
  }, [recorderError]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanup();
      stopAudio();
    };
  }, [cleanup, stopAudio]);

  // Track recording duration & safety auto-stop after 60s
  useEffect(() => {
    let interval: number;
    if (isRecording) {
      setRecordingSeconds(0);
      interval = window.setInterval(() => {
        setRecordingSeconds((s) => {
          if (s >= 60) {
            handleStopRecording();
            return 0;
          }
          return s + 1;
        });
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleStartCall = async () => {
    setCallStatus('connecting');
    setTranscript([]);
    setErrorMessage(null);

    // Warm up microphone in parallel
    initMicrophone().catch(console.error);

    try {
      const response = await fetch(`${API_URL}/api/session`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to create session');
      const { sessionId: newSessionId } = await response.json();
      setSessionId(newSessionId);

      connect();

      setTimeout(() => {
        send({ type: 'session:start', sessionId: newSessionId });
      }, 300);
    } catch (err: any) {
      setCallStatus('error');
      setErrorMessage(`Failed to start call: ${err.message}`);
    }
  };

  const handleEndCall = () => {
    cleanup();
    stopAudio();
    if (sessionId) {
      send({ type: 'session:end', sessionId });
    }
    setCallStatus('ended');
  };

  const handleStartListening = async () => {
    if (callStatus === 'ended' || callStatus === 'connecting' || callStatus === 'processing') return;
    stopAudio(); // Allow instant interruption if AI was speaking
    setCallStatus('recording');
    await startRecording();
  };

  const handleStopRecording = async () => {
    if (!isRecording) return;
    setCallStatus('processing');
    const audioBase64 = await stopRecording();
    if (audioBase64 && sessionId) {
      send({ type: 'audio:user', sessionId, audio: audioBase64 });
    } else {
      setCallStatus('ready');
    }
  };

  // Toggle speaking for tap/click
  const handleMicClick = () => {
    if (isRecording) {
      handleStopRecording();
    } else if (callStatus === 'ready' || callStatus === 'ai-speaking' || callStatus === 'greeting') {
      handleStartListening();
    }
  };

  const isCallActive = !['idle', 'error'].includes(callStatus);
  const canInteract = callStatus === 'ready' || callStatus === 'ai-speaking' || callStatus === 'greeting' || isRecording;

  // Determine status text and colors
  let statusText = 'Ready';
  let statusColorClass = 'status-idle';
  
  if (callStatus === 'connecting') {
    statusText = 'Connecting...';
    statusColorClass = 'status-loading';
  } else if (callStatus === 'greeting' || callStatus === 'ai-speaking') {
    statusText = 'AI is speaking';
    statusColorClass = 'status-speaking';
  } else if (callStatus === 'recording') {
    statusText = `Listening (${recordingSeconds}s)...`;
    statusColorClass = 'status-recording';
  } else if (callStatus === 'processing') {
    statusText = 'Processing...';
    statusColorClass = 'status-processing';
  } else if (callStatus === 'ready') {
    statusText = 'Ready when you are';
    statusColorClass = 'status-ready';
  } else if (callStatus === 'ended') {
    statusText = 'Generating report...';
    statusColorClass = 'status-ended';
  }

  return (
    <div className="glass-dashboard">
      
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="logo-icon">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          <h1>AI Health Assistant</h1>
        </div>
        <div className={`status-badge ${statusColorClass}`}>
          <div className="status-indicator"></div>
          {statusText}
        </div>
      </header>

      {/* Error Toast */}
      {errorMessage && (
        <div className="error-toast" onClick={() => setErrorMessage(null)}>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Glass Card */}
      <main className="glass-card">
        
        {/* Left Pane: Voice Interaction */}
        <section className="voice-pane">
          <div className="voice-content">
            {callStatus === 'idle' ? (
              <div className="idle-state">
                <h2>Start your screening</h2>
                <p>The AI will ask you a series of questions to generate a structured medical report.</p>
                <button className="btn-primary" onClick={handleStartCall}>
                  Start Call
                </button>
              </div>
            ) : (
              <div className="active-state">
                <div className="mic-wrapper">
                  <div className={`mic-ring ${callStatus}`}></div>
                  <button 
                    className={`mic-button ${callStatus} ${!canInteract && callStatus !== 'ended' ? 'disabled' : ''}`}
                    onClick={handleMicClick}
                    title={isRecording ? 'Click to stop & send' : 'Click to speak'}
                    disabled={!canInteract || !isCallActive}
                  >
                    <svg className="mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>
                </div>
                
                <h3 className="mic-hint">
                  {callStatus === 'recording' ? `Listening... Click mic when done (${recordingSeconds}s)` : 
                   callStatus === 'ready' ? 'Click microphone to speak' :
                   callStatus === 'processing' ? 'Processing your response...' :
                   callStatus === 'ai-speaking' || callStatus === 'greeting' ? 'AI is speaking (Click mic to interrupt)' : ''}
                </h3>
                
                {isCallActive && callStatus !== 'ended' && (
                  <button className="btn-end" onClick={handleEndCall}>
                    End Call
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right Pane: Live Transcript */}
        <section className="transcript-pane">
          {transcript.length === 0 && callStatus !== 'ended' ? (
            <div className="empty-chat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="empty-icon">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <p>Your conversation will appear here</p>
            </div>
          ) : (
            <TranscriptPanel entries={transcript} isThinking={isThinking} />
          )}
        </section>

      </main>
    </div>
  );
}
