"use client";

import {
  OwlCelebrating,
  OwlCorrect,
  OwlSad,
  OwlThinking,
} from "@/components/illustrations";

export type OwlMood = "idle" | "happy" | "sad" | "cheer";

interface PracticeOwlProps {
  mood: OwlMood;
  /** Bump to replay the current answer reaction. */
  pulse?: number;
  speaking?: boolean;
  className?: string;
}

export default function PracticeOwl({
  mood,
  pulse = 0,
  speaking = false,
  className = "",
}: PracticeOwlProps) {
  const animClass =
    mood === "happy"
      ? "owl-anim-happy"
      : mood === "sad"
        ? "owl-anim-sad"
        : mood === "cheer"
          ? "owl-anim-cheer"
          : "owl-anim-idle";

  return (
    <div
      key={`${mood}-${pulse}`}
      className={`${animClass} ${speaking ? "owl-anim-speaking" : ""} ${className}`}
      aria-hidden="true"
    >
      {mood === "happy" ? (
        <OwlCorrect className="h-full w-full" />
      ) : mood === "sad" ? (
        <OwlSad className="h-full w-full" />
      ) : mood === "cheer" ? (
        <OwlCelebrating className="h-full w-full" />
      ) : (
        <OwlThinking className="h-full w-full" />
      )}
    </div>
  );
}
