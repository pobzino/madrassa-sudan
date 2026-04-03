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
  canvasWidth = 1920,
  canvasHeight = 1080,
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
  const snapshotDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slideImageRef = useRef<HTMLImageElement | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const snapshotPromiseRef = useRef<Promise<void> | null>(null);
  const pendingSnapshotRef = useRef(false);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const displayVideoRef = useRef<HTMLVideoElement | null>(null);
  const cropRectRef = useRef<{ sx: number; sy: number; sw: number; sh: number } | null>(null);
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
    if (snapshotDebounceRef.current) {
      clearTimeout(snapshotDebounceRef.current);
      snapshotDebounceRef.current = null;
    }
    snapshotPromiseRef.current = null;
    pendingSnapshotRef.current = false;
    if (finalizeTimeoutRef.current) {
      clearTimeout(finalizeTimeoutRef.current);
      finalizeTimeoutRef.current = null;
    }
    if (mutationObserverRef.current) {
      mutationObserverRef.current.disconnect();
      mutationObserverRef.current = null;
    }
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    if (displayVideoRef.current) {
      displayVideoRef.current.pause();
      displayVideoRef.current.srcObject = null;
      displayVideoRef.current = null;
    }
    cropRectRef.current = null;
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
    if (snapshotDebounceRef.current) {
      clearTimeout(snapshotDebounceRef.current);
      snapshotDebounceRef.current = null;
    }
    snapshotPromiseRef.current = null;
    pendingSnapshotRef.current = false;
    if (mutationObserverRef.current) {
      mutationObserverRef.current.disconnect();
      mutationObserverRef.current = null;
    }
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
  }

  function stopInputStreams() {
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    if (displayVideoRef.current) {
      displayVideoRef.current.pause();
      displayVideoRef.current.srcObject = null;
      displayVideoRef.current = null;
    }
    cropRectRef.current = null;
    if (combinedStreamRef.current) {
      combinedStreamRef.current.getTracks().forEach((t) => t.stop());
      combinedStreamRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }

  const updateCropRect = useCallback(() => {
    const el = slideContainerRef.current;
    const displayVideo = displayVideoRef.current;

    if (!el || !displayVideo || !displayVideo.videoWidth || !displayVideo.videoHeight) {
      return;
    }

    const rect = el.getBoundingClientRect();
    const viewportWidth = window.innerWidth || rect.width || 1;
    const viewportHeight = window.innerHeight || rect.height || 1;
    const scaleX = displayVideo.videoWidth / viewportWidth;
    const scaleY = displayVideo.videoHeight / viewportHeight;

    cropRectRef.current = {
      sx: Math.max(0, rect.left * scaleX),
      sy: Math.max(0, rect.top * scaleY),
      sw: Math.max(1, rect.width * scaleX),
      sh: Math.max(1, rect.height * scaleY),
    };
  }, [slideContainerRef]);

  // Snapshot the slide DOM to a cached Image
  const snapshotSlide = useCallback(async function captureSlide() {
    if (displayVideoRef.current) {
      updateCropRect();
      return;
    }

    const el = slideContainerRef.current;
    if (!el) return;

    if (isSnappingRef.current) {
      pendingSnapshotRef.current = true;
      return snapshotPromiseRef.current ?? Promise.resolve();
    }

    isSnappingRef.current = true;
    pendingSnapshotRef.current = false;

    // Capture at high enough resolution so the canvas doesn't upscale
    const elW = el.offsetWidth || canvasWidth;
    const elH = el.offsetHeight || canvasHeight;
    const pixelRatio = Math.max(window.devicePixelRatio || 1, canvasWidth / elW, canvasHeight / elH, 1);

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

    const loadImage = (dataUrl: string) =>
      new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          slideImageRef.current = img;
          resolve();
        };
        img.onerror = () => reject(new Error('Failed to load captured slide image.'));
        img.src = dataUrl;
      });

    snapshotPromiseRef.current = (async () => {
      try {
        let dataUrl: string;

        try {
          dataUrl = await toPng(el, opts);
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 200));
          const retryEl = slideContainerRef.current;
          if (!retryEl) {
            return;
          }
          dataUrl = await toPng(retryEl, opts);
        }

        await loadImage(dataUrl);
      } catch {
        // Keep the previous cached frame if recapture fails.
      } finally {
        isSnappingRef.current = false;
        snapshotPromiseRef.current = null;

        if (pendingSnapshotRef.current) {
          pendingSnapshotRef.current = false;
          void captureSlide();
        }
      }
    })();

    return snapshotPromiseRef.current;
  }, [slideContainerRef, canvasWidth, canvasHeight, updateCropRect]);

  const scheduleSnapshot = useCallback((delay = 90) => {
    if (!slideContainerRef.current) return;
    if (snapshotDebounceRef.current) {
      clearTimeout(snapshotDebounceRef.current);
    }
    snapshotDebounceRef.current = setTimeout(() => {
      snapshotDebounceRef.current = null;
      snapshotSlide();
    }, delay);
  }, [slideContainerRef, snapshotSlide]);

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
    if (displayVideoRef.current && cropRectRef.current) {
      const video = displayVideoRef.current;
      const { sx, sy, sw, sh } = cropRectRef.current;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);
    } else if (slideImageRef.current) {
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
      let displayStream: MediaStream | null = null;

      if (navigator.mediaDevices.getDisplayMedia) {
        displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: 30,
            width: { ideal: canvasWidth },
            height: { ideal: canvasHeight },
          },
          audio: false,
          preferCurrentTab: true,
        } as DisplayMediaStreamOptions & { preferCurrentTab?: boolean });

        const displayTrack = displayStream.getVideoTracks()[0];
        const displaySurface = displayTrack?.getSettings().displaySurface;
        if (displaySurface && displaySurface !== 'browser') {
          displayStream.getTracks().forEach((track) => track.stop());
          throw new Error('Please choose this browser tab when prompted to share your screen.');
        }

        displayStreamRef.current = displayStream;

        const displayVideo = document.createElement('video');
        displayVideo.muted = true;
        displayVideo.playsInline = true;
        displayVideo.srcObject = displayStream;
        await new Promise<void>((resolve, reject) => {
          displayVideo.onloadedmetadata = () => resolve();
          displayVideo.onerror = () => reject(new Error('Failed to start tab capture.'));
        });
        await displayVideo.play();
        displayVideoRef.current = displayVideo;
      }

      // Request microphone only (no webcam)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
      micStreamRef.current = stream;

      // Wait for fonts to load
      await document.fonts.ready;

      // Take initial slide snapshot or crop
      await snapshotSlide();

      // Countdown 3-2-1
      setRecorderState('countdown');
      for (let i = 3; i >= 1; i--) {
        setCountdownValue(i);
        await new Promise((r) => setTimeout(r, 1000));
      }

      await snapshotSlide();

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

      const observedSlide = slideContainerRef.current;
      if (observedSlide) {
        mutationObserverRef.current = new MutationObserver(() => {
          if (isRecordingRef.current) {
            scheduleSnapshot(90);
          }
        });
        mutationObserverRef.current.observe(observedSlide, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
        });

        resizeObserverRef.current = new ResizeObserver(() => {
          if (isRecordingRef.current) {
            scheduleSnapshot(90);
          }
        });
        resizeObserverRef.current.observe(observedSlide);
      }

      // Create MediaRecorder
      const preferredMimeType = getSupportedMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = preferredMimeType
          ? new MediaRecorder(combinedStream, {
              mimeType: preferredMimeType,
              videoBitsPerSecond: 12_000_000,
            })
          : new MediaRecorder(combinedStream, {
              videoBitsPerSecond: 12_000_000,
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
      }, 250);

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
  }, [snapshotSlide, canvasWidth, canvasHeight, drawFrame, renderFrame, scheduleSnapshot, slideContainerRef]);

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
