'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import fixWebmDuration from 'fix-webm-duration';
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
  snapshotSlide: () => void;
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
  const combinedStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const snapshotIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const finalizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideImageRef = useRef<HTMLImageElement | null>(null);
  const isRecordingRef = useRef(false);
  const isSnappingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const recordingStartedAtRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  function cleanup() {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    if (snapshotIntervalRef.current) {
      clearInterval(snapshotIntervalRef.current);
      snapshotIntervalRef.current = null;
    }
    if (finalizeTimeoutRef.current) {
      clearTimeout(finalizeTimeoutRef.current);
      finalizeTimeoutRef.current = null;
    }
    if (combinedStreamRef.current) {
      combinedStreamRef.current.getTracks().forEach((t) => t.stop());
      combinedStreamRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    isRecordingRef.current = false;
    isSnappingRef.current = false;
    stopRequestedRef.current = false;
    recordingStartedAtRef.current = null;
  }

  function stopCompositingLoop() {
    isRecordingRef.current = false;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    if (snapshotIntervalRef.current) {
      clearInterval(snapshotIntervalRef.current);
      snapshotIntervalRef.current = null;
    }
  }

  function stopInputStreams() {
    if (combinedStreamRef.current) {
      combinedStreamRef.current.getTracks().forEach((t) => t.stop());
      combinedStreamRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }

  // Snapshot the slide DOM to a cached Image
  const snapshotSlide = useCallback(() => {
    const el = slideContainerRef.current;
    if (!el || isSnappingRef.current) return;

    isSnappingRef.current = true;

    // Capture at high enough resolution so the canvas doesn't upscale
    const elW = el.offsetWidth || canvasWidth;
    const elH = el.offsetHeight || canvasHeight;
    const pixelRatio = Math.max(canvasWidth / elW, canvasHeight / elH, 1);

    const opts = {
      width: elW,
      height: elH,
      pixelRatio,
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
    };

    toPng(el, opts)
      .then((dataUrl) => {
        const img = new Image();
        img.onload = () => {
          slideImageRef.current = img;
          isSnappingRef.current = false;
        };
        img.onerror = () => { isSnappingRef.current = false; };
        img.src = dataUrl;
      })
      .catch(() => {
        isSnappingRef.current = false;
        // Retry once after a short delay (DOM may not have fully painted)
        setTimeout(() => {
          if (!slideContainerRef.current) return;
          isSnappingRef.current = true;
          toPng(slideContainerRef.current, opts)
            .then((dataUrl) => {
              const img = new Image();
              img.onload = () => {
                slideImageRef.current = img;
                isSnappingRef.current = false;
              };
              img.onerror = () => { isSnappingRef.current = false; };
              img.src = dataUrl;
            })
            .catch(() => { isSnappingRef.current = false; });
        }, 200);
      });
  }, [slideContainerRef, canvasWidth, canvasHeight]);

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Clear canvas
    ctx.fillStyle = '#000000';
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
  }, [canvasHeight, canvasWidth]);

  // Canvas compositing loop
  const drawFrame = useCallback(() => {
    if (!isRecordingRef.current) return;
    renderFrame();

    animFrameRef.current = requestAnimationFrame(drawFrame);
  }, [renderFrame]);

  // Find supported MIME type
  function getSupportedMimeType(): string | null {
    const types = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm',
    ];
    return types.find((mt) => MediaRecorder.isTypeSupported(mt)) || null;
  }

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    setRecordedBlob(null);
    setRecordingDuration(0);
    stopRequestedRef.current = false;

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
      snapshotSlide();
      // Allow time for snapshot
      await new Promise((r) => setTimeout(r, 200));

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
      renderFrame();

      // Combine canvas video stream + mic audio
      const canvasStream = canvas.captureStream(30);
      const audioTracks = stream.getAudioTracks();
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioTracks,
      ]);
      combinedStreamRef.current = combinedStream;
      animFrameRef.current = requestAnimationFrame(drawFrame);

      // Create MediaRecorder
      const preferredMimeType = getSupportedMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = preferredMimeType
          ? new MediaRecorder(combinedStream, {
              mimeType: preferredMimeType,
              videoBitsPerSecond: 5_000_000,
            })
          : new MediaRecorder(combinedStream, {
              videoBitsPerSecond: 5_000_000,
            });
      } catch {
        recorder = new MediaRecorder(combinedStream);
      }
      const outputMimeType = recorder.mimeType || preferredMimeType || 'video/webm';

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = () => {
        if (finalizeTimeoutRef.current) {
          clearTimeout(finalizeTimeoutRef.current);
          finalizeTimeoutRef.current = null;
        }
        stopInputStreams();
        stopCompositingLoop();
        mediaRecorderRef.current = null;
        stopRequestedRef.current = false;
        recordingStartedAtRef.current = null;
        setRecorderState('idle');
        setRecordedBlob(null);
        setErrorMessage('Recording failed in the browser. Please try again.');
      };
      recorder.onstop = () => {
        const finalizeBlob = (allowRetry: boolean) => {
          if (finalizeTimeoutRef.current) {
            clearTimeout(finalizeTimeoutRef.current);
          }

          // Some browsers dispatch the final dataavailable event slightly after stop.
          finalizeTimeoutRef.current = setTimeout(() => {
            void (async () => {
              finalizeTimeoutRef.current = null;
              const typedBlob = new Blob(chunksRef.current, { type: outputMimeType });
              let blob = typedBlob.size > 0 ? typedBlob : new Blob(chunksRef.current);

              if (blob.size === 0) {
                if (allowRetry) {
                  finalizeBlob(false);
                  return;
                }
                setRecordedBlob(null);
                setRecorderState('idle');
                setErrorMessage('Recording failed to save video data. Please record again.');
              } else {
                const recordingDurationMs = Math.max(
                  1000,
                  recordingStartedAtRef.current ? Date.now() - recordingStartedAtRef.current : 1000
                );

                if ((blob.type || outputMimeType).includes('webm')) {
                  try {
                    blob = await fixWebmDuration(blob, recordingDurationMs, { logger: false });
                  } catch (error) {
                    console.warn('Failed to patch WebM duration metadata before upload.', error);
                  }
                }

                setRecordedBlob(blob);
                setRecorderState('stopped');
              }

              stopInputStreams();
              stopCompositingLoop();
              mediaRecorderRef.current = null;
              stopRequestedRef.current = false;
              recordingStartedAtRef.current = null;
            })();
          }, allowRetry ? 350 : 1000);
        };

        finalizeBlob(true);
      };

      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      recorder.start(250);

      // Periodic re-snapshot: safety net so slide changes are always captured
      snapshotIntervalRef.current = setInterval(() => {
        if (isRecordingRef.current) snapshotSlide();
      }, 400);

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
  }, [snapshotSlide, canvasWidth, canvasHeight, drawFrame, renderFrame]);

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive' || stopRequestedRef.current) {
      return;
    }

    const recorder = mediaRecorderRef.current;
    stopRequestedRef.current = true;

    try { recorder.requestData(); } catch { /* ignore */ }

    setTimeout(() => {
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        stopRequestedRef.current = false;
      }
    }, 160);
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
