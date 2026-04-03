'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { toPng } from 'html-to-image';

export type RecorderState = 'idle' | 'preparing' | 'countdown' | 'recording' | 'paused' | 'stopped';

interface UseSlideRecorderOptions {
  slideContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasWidth?: number;
  canvasHeight?: number;
}

interface UseSlideRecorderReturn {
  recorderState: RecorderState;
  recordingDuration: number;
  recordedBlob: Blob | null;
  errorMessage: string | null;
  countdownValue: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  cancelRecording: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  snapshotSlide: () => Promise<void>;
}

export function useSlideRecorder({
  slideContainerRef,
  canvasWidth = 1280,
  canvasHeight = 720,
}: UseSlideRecorderOptions): UseSlideRecorderReturn {
  const [recorderState, setRecorderState] = useState<RecorderState>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdownValue, setCountdownValue] = useState(3);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideImageRef = useRef<HTMLImageElement | null>(null);
  const isRecordingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  function cleanup() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    isRecordingRef.current = false;
  }

  // Snapshot the slide DOM to a cached Image
  const snapshotSlide = useCallback(async () => {
    const el = slideContainerRef.current;
    if (!el) return;

    const width = el.clientWidth;
    const height = el.clientHeight;
    if (!width || !height) return;

    try {
      const dataUrl = await toPng(el, {
        width,
        height,
        canvasWidth,
        canvasHeight,
        pixelRatio: 1,
        backgroundColor: '#ffffff',
        cacheBust: true,
        // Skip cross-origin images that can't be captured
        filter: (node: HTMLElement) => {
          if (node.tagName === 'IMG') {
            const src = (node as HTMLImageElement).src;
            if (src && !src.startsWith(window.location.origin) && !src.startsWith('data:')) {
              return false;
            }
          }
          return true;
        },
      });

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          slideImageRef.current = img;
          resolve();
        };
        img.onerror = () => reject(new Error('Failed to load captured slide image'));
        img.src = dataUrl;
      });
    } catch {
      // Snapshot failed — keep the last cached image
    }
  }, [slideContainerRef, canvasWidth, canvasHeight]);

  // Canvas compositing loop
  function drawFrame() {
    if (!isRecordingRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) {
      animFrameRef.current = requestAnimationFrame(drawFrame);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      animFrameRef.current = requestAnimationFrame(drawFrame);
      return;
    }

    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw cached slide image, scaled to fill canvas
    if (slideImageRef.current) {
      const img = slideImageRef.current;
      // Scale to fill 1280x720 while maintaining aspect ratio
      const scale = Math.max(canvasWidth / img.width, canvasHeight / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (canvasWidth - w) / 2;
      const y = (canvasHeight - h) / 2;
      ctx.drawImage(img, x, y, w, h);
    }

    animFrameRef.current = requestAnimationFrame(drawFrame);
  }

  // Find supported MIME type
  function getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return types.find((mt) => MediaRecorder.isTypeSupported(mt)) || 'video/webm';
  }

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    setRecordedBlob(null);
    setRecordingDuration(0);

    // Check browser support
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Your browser does not support microphone access.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setErrorMessage('Your browser does not support MediaRecorder. Please use Chrome or Edge.');
      return;
    }

    setRecorderState('preparing');

    try {
      // Request microphone only (no webcam)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
      micStreamRef.current = stream;

      // Wait for fonts to load
      await document.fonts.ready;

      // Take initial slide snapshot
      await snapshotSlide();
      // Brief delay to ensure layout settles before countdown starts.
      await new Promise((r) => setTimeout(r, 120));

      // Countdown 3-2-1
      setRecorderState('countdown');
      for (let i = 3; i >= 1; i--) {
        setCountdownValue(i);
        await new Promise((r) => setTimeout(r, 1000));
      }

      // Start canvas compositing
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Canvas not available');

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      isRecordingRef.current = true;
      animFrameRef.current = requestAnimationFrame(drawFrame);

      // Combine canvas video stream + mic audio
      const canvasStream = canvas.captureStream(30);
      const audioTracks = stream.getAudioTracks();
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioTracks,
      ]);

      // Create MediaRecorder
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 2_500_000,
      });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        setRecorderState('stopped');
        // Stop compositing loop
        isRecordingRef.current = false;
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // 1s chunks

      // Duration timer
      const startTime = Date.now();
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 500);

      setRecorderState('recording');
    } catch (err) {
      cleanup();
      setRecorderState('idle');
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setErrorMessage('Microphone permission was denied. Please allow access and try again.');
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to start recording');
      }
    }
  }, [snapshotSlide, canvasWidth, canvasHeight]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    // Stop mic
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setRecorderState('paused');
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setRecorderState('recording');
      const resumeOffset = recordingDuration;
      const resumeTime = Date.now();
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(resumeOffset + Math.floor((Date.now() - resumeTime) / 1000));
      }, 500);
    }
  }, [recordingDuration]);

  const cancelRecording = useCallback(() => {
    cleanup();
    setRecorderState('idle');
    setRecordedBlob(null);
    setRecordingDuration(0);
    chunksRef.current = [];
  }, []);

  return {
    recorderState,
    recordingDuration,
    recordedBlob,
    errorMessage,
    countdownValue,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    canvasRef,
    snapshotSlide,
  };
}
