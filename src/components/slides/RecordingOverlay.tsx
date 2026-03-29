'use client';

import type { RecorderState } from '@/hooks/useSlideRecorder';

interface RecordingOverlayProps {
  recorderState: RecorderState;
  countdownValue: number;
  recordingDuration: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  webcamVideoRef?: React.RefObject<HTMLVideoElement | null>;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function RecordingOverlay({
  recorderState,
  countdownValue,
  recordingDuration,
  canvasRef,
  onPause,
  onResume,
  onStop,
}: RecordingOverlayProps) {
  // Countdown overlay
  if (recorderState === 'countdown') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="text-white text-[120px] font-bold animate-pulse drop-shadow-2xl">
          {countdownValue}
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  // Recording / Paused state
  if (recorderState === 'recording' || recorderState === 'paused') {
    return (
      <>
        {/* REC indicator — top left */}
        <div className="fixed top-4 left-4 z-[60] flex items-center gap-2 bg-black/70 backdrop-blur-sm rounded-full px-4 py-2">
          <span
            className={`w-3 h-3 rounded-full ${
              recorderState === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-yellow-500'
            }`}
          />
          <span className="text-white text-sm font-medium">
            {recorderState === 'paused' ? 'PAUSED' : 'REC'}
          </span>
          <span className="text-white/70 text-sm font-mono">
            {formatDuration(recordingDuration)}
          </span>
        </div>

        {/* Hidden canvas for compositing */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Recording controls — integrated into bottom bar */}
        <div className="fixed bottom-6 right-6 z-[60] flex items-center gap-2">
          {recorderState === 'recording' ? (
            <button
              onClick={onPause}
              className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white rounded-full px-4 py-2 text-sm font-medium hover:bg-white/30 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              Pause
            </button>
          ) : (
            <button
              onClick={onResume}
              className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white rounded-full px-4 py-2 text-sm font-medium hover:bg-white/30 transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Resume
            </button>
          )}
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 bg-red-600 text-white rounded-full px-4 py-2 text-sm font-medium hover:bg-red-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Stop
          </button>
        </div>
      </>
    );
  }

  // Preparing state
  if (recorderState === 'preparing') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white" />
          <span className="text-white text-sm font-medium">Preparing microphone...</span>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    );
  }

  // Idle / stopped — just render hidden canvas for ref
  return <canvas ref={canvasRef} className="hidden" />;
}
