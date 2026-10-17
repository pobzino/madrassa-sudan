"use client";

import { useEffect, useRef, useState } from "react";
import { BossCharacter } from "@/components/characters/BossCharacter";
import { OwlCharacter } from "@/components/characters/OwlCharacter";
import { ArenaBackdrop, type ArenaOrientation } from "@/components/characters/arenas";
import { BOSS_FOOT, OWL_FOOT } from "@/components/characters";
import { BOSSES } from "@/components/characters/bosses";
import {
  BOSS_ACTIONS,
  BOSS_KEYS,
  OWL_ACTIONS,
  OWL_POSES,
  POSES,
  type BossAction,
  type BossHandle,
  type BossKey,
  type CharacterCue,
  type OwlAction,
  type OwlHandle,
  type OwlPose,
  type Pose,
} from "@/components/characters/types";

declare global {
  interface Window {
    /** Playwright hook: run an action and get back how long it took. */
    __chars?: {
      play: (id: string, action: string, durationMs?: number, hitstopMs?: number) => Promise<number>;
      handle: (id: string) => BossHandle | OwlHandle | null;
      ids: () => string[];
    };
  }
}

// Refs, not handles: some characters mount after this effect (inside the arena).
const registry = new Map<string, React.RefObject<BossHandle | OwlHandle | null>>();

function useRegister(id: string, handle: React.RefObject<BossHandle | OwlHandle | null>) {
  useEffect(() => {
    registry.set(id, handle);
    return () => {
      registry.delete(id);
    };
  }, [id, handle]);
}

function Buttons<T extends string>({ items, onPick, active, tone }: { items: readonly T[]; onPick: (v: T) => void; active?: T; tone: "pose" | "action" }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onPick(item)}
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            border: 0,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            background: active === item ? "#007229" : tone === "pose" ? "#E2E8F0" : "#FEF3C7",
            color: active === item ? "#FFFFFF" : "#0F172A",
          }}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function BossCard({ bossKey }: { bossKey: BossKey }) {
  const ref = useRef<BossHandle>(null);
  const [pose, setPose] = useState<Pose>("idle");
  const [log, setLog] = useState("");
  useRegister(bossKey, ref);
  const play = async (action: BossAction) => {
    const t = performance.now();
    await ref.current?.play(action, { durationMs: 1800 });
    setLog(`${action}: ${Math.round(performance.now() - t)} ms`);
  };
  return (
    <section style={card}>
      <h2 style={h2}>
        {BOSSES[bossKey].name} <small style={{ color: "#64748B", fontWeight: 500 }}>{bossKey}</small>
      </h2>
      <div style={{ display: "grid", placeItems: "end center", height: 250, background: "linear-gradient(#0B4A26,#136B38)", borderRadius: 16 }}>
        <BossCharacter bossKey={bossKey} pose={pose} size={210} ref={ref} />
      </div>
      <p style={label}>Pose</p>
      <Buttons items={POSES} active={pose} onPick={setPose} tone="pose" />
      <p style={label}>Play</p>
      <Buttons items={BOSS_ACTIONS} onPick={play} tone="action" />
      <p style={label}>Game feel</p>
      <Buttons items={["flash", "flash red", "hitstop 300ms", "hit + hitstop"] as const} onPick={(v) => (v === "flash" ? ref.current?.flash() : v === "flash red" ? ref.current?.flash("#FF5A6E") : v === "hitstop 300ms" ? ref.current?.hitstop(300) : ref.current?.play("hit", { hitstopMs: 80 }))} tone="action" />
      <p style={{ ...label, minHeight: 18 }}>{log}</p>
    </section>
  );
}

function OwlCard() {
  const ref = useRef<OwlHandle>(null);
  const [pose, setPose] = useState<OwlPose>("idle");
  const [log, setLog] = useState("");
  useRegister("owl", ref);
  const play = async (action: OwlAction) => {
    const t = performance.now();
    await ref.current?.play(action, { durationMs: 1800 });
    setLog(`${action}: ${Math.round(performance.now() - t)} ms`);
  };
  return (
    <section style={card}>
      <h2 style={h2}>Amowl</h2>
      <div style={{ display: "grid", placeItems: "end center", height: 250, background: "linear-gradient(#F3E3BF,#E9D3A5)", borderRadius: 16 }}>
        <OwlCharacter pose={pose} size={200} ref={ref} />
      </div>
      <p style={label}>Pose</p>
      <Buttons items={OWL_POSES} active={pose} onPick={setPose} tone="pose" />
      <p style={label}>Play</p>
      <Buttons items={OWL_ACTIONS} onPick={play} tone="action" />
      <p style={label}>Game feel</p>
      <Buttons items={["flash", "hitstop 300ms"] as const} onPick={(v) => (v === "flash" ? ref.current?.flash() : ref.current?.hitstop(300))} tone="action" />
      <p style={{ ...label, minHeight: 18 }}>{log}</p>
    </section>
  );
}

/**
 * Character sizes in arena units. Portrait: about 190 px boss and 162 px owl
 * on a 375 px phone. Landscape: about 300 px boss and 250 px owl at 1440 × 900.
 * Multiply by the anchor's `scale` to follow the screen size.
 */
const CAST_UNITS: Record<ArenaOrientation, { boss: number; owl: number }> = {
  portrait: { boss: 181, owl: 154 },
  landscape: { boss: 278, owl: 232 },
};

/** An arena with the cast placed on its anchors. */
function ArenaFrame({
  bossKey,
  width = 375,
  height = 812,
  bossPose = "idle",
  owlPose = "idle",
  glow = true,
  orientation = "portrait",
}: {
  bossKey: BossKey;
  width?: number | string;
  height?: number | string;
  bossPose?: Pose;
  owlPose?: OwlPose;
  glow?: boolean;
  orientation?: ArenaOrientation;
}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const boss = useRef<BossHandle>(null);
  const owl = useRef<OwlHandle>(null);
  const [cue, setCue] = useState<CharacterCue | null>(null);
  useRegister(`${orientation === "landscape" ? "arenaL" : "arena"}:${bossKey}:boss`, boss);
  useRegister(`${orientation === "landscape" ? "arenaL" : "arena"}:${bossKey}:owl`, owl);
  return (
    <div
      onPointerMove={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        setTilt({ x: (e.clientX - box.left) / box.width - 0.5, y: (e.clientY - box.top) / box.height - 0.5 });
      }}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      style={{ position: "relative", width, height, overflow: "hidden", borderRadius: typeof width === "number" ? 20 : 0, flexShrink: 0 }}
      data-cue={cue ?? ""}
    >
      <ArenaBackdrop bossKey={bossKey} parallax={tilt} orientation={orientation}>
        {(anchors) => {
          const BOSS = Math.round(CAST_UNITS[orientation].boss * anchors.boss.scale);
          const OWL = Math.round(CAST_UNITS[orientation].owl * anchors.owl.scale);
          return (
          <>
            <div style={{ position: "absolute", left: anchors.boss.x - BOSS * BOSS_FOOT.x, top: anchors.boss.y - BOSS * BOSS_FOOT.y }}>
              <BossCharacter bossKey={bossKey} pose={bossPose} size={BOSS} ref={boss} onCue={setCue} />
            </div>
            <div style={{ position: "absolute", left: anchors.owl.x - OWL * OWL_FOOT.x, top: anchors.owl.y - OWL * OWL_FOOT.y }}>
              <OwlCharacter pose={owlPose} size={OWL} ref={owl} glow={glow} />
            </div>
          </>
          );
        }}
      </ArenaBackdrop>
    </div>
  );
}

export default function CharacterGallery({ shot, bossKey, pose, orient }: { shot?: string; bossKey?: string; pose?: string; orient?: string }) {
  useEffect(() => {
    window.__chars = {
      ids: () => Array.from(registry.keys()),
      handle: (id) => registry.get(id)?.current ?? null,
      play: async (id, action, durationMs, hitstopMs) => {
        const handle = registry.get(id)?.current;
        if (!handle) throw new Error(`no character ${id}`);
        const t = performance.now();
        await (handle as BossHandle).play(action as BossAction, { durationMs, hitstopMs });
        return Math.round(performance.now() - t);
      },
    };
  }, []);

  const key = (BOSS_KEYS as readonly string[]).includes(bossKey ?? "") ? (bossKey as BossKey) : "number_giant";

  if (shot === "boss") {
    return (
      <main style={{ ...shotStage, background: "linear-gradient(#0B4A26,#136B38)" }}>
        <SingleBoss bossKey={key} pose={(POSES as readonly string[]).includes(pose ?? "") ? (pose as Pose) : "idle"} />
      </main>
    );
  }
  if (shot === "owl") {
    return (
      <main style={{ ...shotStage, background: "linear-gradient(#F3E3BF,#E9D3A5)" }}>
        <SingleOwl pose={(OWL_POSES as readonly string[]).includes(pose ?? "") ? (pose as OwlPose) : "idle"} />
      </main>
    );
  }
  if (shot === "arena") {
    const bossPose = (POSES as readonly string[]).includes(pose ?? "") ? (pose as Pose) : "idle";
    return (
      <main style={{ margin: 0 }}>
        {orient === "landscape" ? (
          <ArenaFrame bossKey={key} bossPose={bossPose} orientation="landscape" width="100vw" height="100vh" />
        ) : (
          <ArenaFrame bossKey={key} bossPose={bossPose} />
        )}
      </main>
    );
  }

  return (
    <main style={{ padding: 20, fontFamily: "var(--font-fredoka), system-ui, sans-serif", background: "#F8FAFC", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: "0 0 4px" }}>Big Challenge characters</h1>
      <p style={{ color: "#64748B", margin: "0 0 20px" }}>Poses hold; actions play once and settle back into the pose. Move the pointer over an arena to parallax it.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        <OwlCard />
        {BOSS_KEYS.map((k) => (
          <BossCard key={k} bossKey={k} />
        ))}
      </div>
      <h2 style={{ ...h2, marginTop: 32 }}>Arenas</h2>
      <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 16 }}>
        {BOSS_KEYS.map((k) => (
          <ArenaFrame key={k} bossKey={k} />
        ))}
      </div>
      <h2 style={{ ...h2, marginTop: 32 }}>Landscape arenas (desktop)</h2>
      <p style={{ color: "#64748B", margin: "0 0 12px" }}>Shown at 1024 × 640. Open ?shot=arena&amp;orient=landscape&amp;key=… for full screen.</p>
      <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 16 }}>
        {BOSS_KEYS.map((k) => (
          <ArenaFrame key={`l-${k}`} bossKey={k} orientation="landscape" width={1024} height={640} />
        ))}
      </div>
    </main>
  );
}

function SingleBoss({ bossKey, pose }: { bossKey: BossKey; pose: Pose }) {
  const ref = useRef<BossHandle>(null);
  useRegister("single", ref);
  return <BossCharacter bossKey={bossKey} pose={pose} size={300} ref={ref} />;
}

function SingleOwl({ pose }: { pose: OwlPose }) {
  const ref = useRef<OwlHandle>(null);
  useRegister("single", ref);
  return <OwlCharacter pose={pose} size={300} ref={ref} />;
}

const shotStage: React.CSSProperties = { margin: 0, width: 400, height: 400, display: "grid", placeItems: "center" };
const card: React.CSSProperties = { background: "#FFFFFF", borderRadius: 20, padding: 14, boxShadow: "0 1px 3px rgba(15,23,42,.08)" };
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700, margin: "0 0 10px" };
const label: React.CSSProperties = { fontSize: 12, color: "#64748B", margin: "10px 0 6px", fontWeight: 600 };
