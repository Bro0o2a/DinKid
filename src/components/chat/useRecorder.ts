"use client";

import { useEffect, useRef, useState } from "react";

// Records a voice message with the phone's microphone.
// iPhones record "audio/mp4"; most others "audio/webm".
const TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/aac"];

export type Recording = { blob: Blob; url: string; type: string; extension: string; seconds: number };

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const started = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => () => {
    clearInterval(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
    const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.current = r;
    (r as MediaRecorder & { chunks?: Blob[] }).chunks = chunks;
    r.start();
    started.current = Date.now();
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 250);
  }

  function stop(): Promise<Recording | null> {
    const r = recorder.current;
    clearInterval(timer.current);
    setRecording(false);
    if (!r) return Promise.resolve(null);
    return new Promise((resolve) => {
      r.onstop = () => {
        r.stream.getTracks().forEach((t) => t.stop());
        const type = (r.mimeType || "audio/webm").split(";")[0];
        const blob = new Blob((r as MediaRecorder & { chunks?: Blob[] }).chunks ?? [], { type });
        const secs = (Date.now() - started.current) / 1000;
        recorder.current = null;
        if (secs < 0.7 || blob.size === 0) return resolve(null);
        resolve({ blob, url: URL.createObjectURL(blob), type, extension: type.includes("mp4") || type.includes("aac") ? "m4a" : "webm", seconds: secs });
      };
      r.stop();
    });
  }

  return { recording, seconds, start, stop };
}
