"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSignedUrl } from "@/lib/chatFiles";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function AudioPlayer({ path, src, mine }: { path?: string; src?: string; mine: boolean }) {
  const signed = useSignedUrl(path ?? "");
  const url = src ?? (path ? signed : null);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onTime = () => setTime(a.currentTime);
    // Recordings from some phones only know their length after playing once.
    const onMeta = () => Number.isFinite(a.duration) && setDuration(a.duration);
    const onEnd = () => {
      setPlaying(false);
      setTime(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, [url]);

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play();
    setPlaying(!playing);
  }

  const progress = duration ? (time / duration) * 100 : 0;
  return (
    <div className="flex items-center gap-2.5 w-56 py-1" dir="ltr">
      {url && <audio ref={audio} src={url} preload="metadata" />}
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        className={`size-9 shrink-0 rounded-full flex items-center justify-center ${mine ? "bg-white/20" : "bg-brand text-white"}`}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className={`h-1 rounded-full ${mine ? "bg-white/25" : "bg-border"}`}>
          <div className={`h-1 rounded-full ${mine ? "bg-white" : "bg-brand"}`} style={{ width: `${progress}%` }} />
        </div>
        <p className={`text-[11px] mt-1 ${mine ? "text-white/75" : "text-muted"}`}>{clock(playing || time ? time : duration)}</p>
      </div>
    </div>
  );
}
