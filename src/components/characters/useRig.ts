"use client";

import { useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import { Rig, type RigSpec } from "./rig";
import type { CharacterCue, CharacterHandle } from "./types";

/**
 * Binds a Rig to an SVG: builds it before first paint, follows the `pose`
 * prop, exposes `play()` on the ref and tears every timeline down on unmount.
 */
export function useRig<A extends string>(
  spec: RigSpec,
  pose: string,
  ref: Ref<CharacterHandle<A>> | undefined,
  onCue: ((cue: CharacterCue) => void) | undefined,
  enter: boolean,
  glow = false,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const rigRef = useRef<Rig | null>(null);
  const poseRef = useRef(pose);
  const cueRef = useRef(onCue);
  const enterRef = useRef(enter);
  const uid = `c${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  useEffect(() => {
    poseRef.current = pose;
    cueRef.current = onCue;
  });

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rig = new Rig(svg, spec, poseRef.current, { onCue: (cue) => cueRef.current?.(cue) });
    rigRef.current = rig;
    if (enterRef.current) void rig.play("land");
    return () => {
      rig.destroy();
      if (rigRef.current === rig) rigRef.current = null;
    };
  }, [spec]);

  useEffect(() => {
    rigRef.current?.setPose(pose);
  }, [pose]);

  useEffect(() => {
    rigRef.current?.setGlow(glow);
  }, [glow, spec]);

  useImperativeHandle(
    ref,
    () => ({
      play: (action: A, options) => rigRef.current?.play(action, options) ?? Promise.resolve(),
    }),
    [],
  );

  return { svgRef, uid, rigRef };
}
