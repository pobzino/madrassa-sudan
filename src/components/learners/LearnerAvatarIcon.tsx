import type { LearnerAvatar } from "@/lib/learners/types";

type LearnerAvatarIconProps = {
  avatar: LearnerAvatar;
  className?: string;
};

function Eyes({ y = 31, left = 23, right = 41 }: { y?: number; left?: number; right?: number }) {
  return (
    <>
      {[left, right].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy={y} rx="6.5" ry="8" fill="#FFFFFF" />
          <circle cx={x + 1} cy={y + 1} r="3.7" fill="#172033" />
          <circle cx={x + 2} cy={y - 1} r="1.25" fill="#FFFFFF" />
        </g>
      ))}
    </>
  );
}

/** Small, original animal heads drawn in the same bold, flat style as the Amal owl. */
export default function LearnerAvatarIcon({ avatar, className = "" }: LearnerAvatarIconProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      {avatar === "cat" && <>
        <path d="M9 27 12 9q1-5 5-2l11 11h8L47 7q4-3 5 2l3 18q4 5 4 12c0 14-11 22-27 22S5 51 5 39q0-7 4-12Z" fill="#D97706" />
        <path d="m14 12 10 9-9 3Zm36 0-1 12-9-3Z" fill="#FCA5A5" />
        <path d="M13 43q7 7 15 2m8 0q8 5 15-2" fill="none" stroke="#FDE68A" strokeWidth="2" strokeLinecap="round" />
        <Eyes y={31} />
        <path d="m29 41 3-2 3 2-3 3Z" fill="#D21034" />
        <path d="m32 44-2 2m2-2 2 2" fill="none" stroke="#7C2D12" strokeWidth="1.5" strokeLinecap="round" />
      </>}
      {avatar === "dog" && <>
        <path d="M12 17Q5 8 7 25l4 14q2 7 8 5l5-10h16l5 10q6 2 8-5l4-14q2-17-5-8l-7 7H19Z" fill="#9A4F2D" />
        <ellipse cx="32" cy="35" rx="21" ry="22" fill="#C9824B" />
        <ellipse cx="32" cy="44" rx="12" ry="9" fill="#F6D7B4" />
        <Eyes y={30} />
        <ellipse cx="32" cy="40" rx="4" ry="3" fill="#172033" />
        <path d="M32 43v3m0 0q-3 3-6 0m6 0q3 3 6 0" fill="none" stroke="#7C3524" strokeWidth="1.5" strokeLinecap="round" />
      </>}
      {avatar === "lion" && <>
        <path d="m32 3 6 6 9-3 3 9 9 4-3 9 6 7-7 7 1 10-10 1-5 8-9-4-9 4-5-8-10-1 1-10-7-7 6-7-3-9 9-4 3-9 9 3Z" fill="#D97706" />
        <ellipse cx="32" cy="34" rx="19" ry="21" fill="#FBBF64" />
        <ellipse cx="32" cy="44" rx="10" ry="7" fill="#FFF1D6" />
        <Eyes y={30} />
        <path d="m29 42 3-2 3 2-3 3Z" fill="#7C3524" />
        <path d="M32 45v2m0 0q-3 3-5 0m5 0q3 3 5 0" fill="none" stroke="#7C3524" strokeWidth="1.5" strokeLinecap="round" />
      </>}
      {avatar === "elephant" && <>
        <path d="M20 29Q9 8 4 20 0 35 10 46q6 6 14 0Zm24 0Q55 8 60 20q4 15-6 26-6 6-14 0Z" fill="#78989E" />
        <path d="M17 30Q8 15 6 23 5 34 14 41l7 1Zm30 0q9-15 11-7 1 11-8 18l-7-1Z" fill="#D4E2E2" />
        <ellipse cx="32" cy="31" rx="17" ry="21" fill="#A9C3C5" />
        <Eyes y={28} left={23} right={41} />
        <path d="M32 35q-1 7-2 13-1 7 5 8 5 0 6-5 1-4-3-6" fill="none" stroke="#78989E" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </>}
      {avatar === "camel" && <>
        <path d="M14 25q0-12 9-12 7 0 9 9 2-9 9-9 9 0 9 12l-3 7H17Z" fill="#C9824B" />
        <path d="M18 25q4-6 9-3l3 6 3-6q5-3 9 3l-2 9H20Z" fill="#F0C58E" />
        <path d="M18 29q-7 2-6 10 1 15 20 18 19-3 20-18 1-8-6-10-6-5-14-5t-14 5Z" fill="#D99B61" />
        <Eyes y={34} left={24} right={40} />
        <path d="M28 43q4 3 8 0" fill="none" stroke="#8B542E" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="19" cy="43" r="2" fill="#F4D2A5" />
        <circle cx="45" cy="43" r="2" fill="#F4D2A5" />
      </>}
      {avatar === "rabbit" && <>
        <ellipse cx="23" cy="17" rx="8" ry="17" transform="rotate(-12 23 17)" fill="#D9C7B8" />
        <ellipse cx="41" cy="17" rx="8" ry="17" transform="rotate(12 41 17)" fill="#D9C7B8" />
        <ellipse cx="23" cy="17" rx="3.5" ry="11" transform="rotate(-12 23 17)" fill="#EFA8A8" />
        <ellipse cx="41" cy="17" rx="3.5" ry="11" transform="rotate(12 41 17)" fill="#EFA8A8" />
        <ellipse cx="32" cy="39" rx="23" ry="21" fill="#F1E5D9" />
        <Eyes y={34} />
        <ellipse cx="32" cy="44" rx="3" ry="2.4" fill="#D98791" />
        <path d="M32 46q-3 4-6 1m6-1q3 4 6 1" fill="none" stroke="#8D665F" strokeWidth="1.4" strokeLinecap="round" />
      </>}
      {avatar === "turtle" && <>
        <path d="M8 40q0-27 24-31 24 4 24 31l-8 12H16Z" fill="#007229" />
        <path d="M13 38q1-21 19-24 18 3 19 24l-7 9H20Z" fill="#52A861" />
        <path d="M32 15v13m-14-6 9 8m19-8-9 8m-19 4 10 2m17-2-10 2" fill="none" stroke="#A5D57B" strokeWidth="2.2" strokeLinecap="round" />
        <ellipse cx="32" cy="40" rx="20" ry="17" fill="#91C96C" />
        <path d="M16 48q-5 4-3 9l10-2m25-7q5 4 3 9l-10-2" fill="#559C58" />
        <Eyes y={35} left={23} right={41} />
        <circle cx="28" cy="44" r="1.2" fill="#397348" />
        <circle cx="36" cy="44" r="1.2" fill="#397348" />
        <path d="M25 49q7 6 14 0" fill="none" stroke="#397348" strokeWidth="1.7" strokeLinecap="round" />
      </>}
      {avatar === "fish" && <>
        <path d="M10 32 2 19q-2-3 2-2l16 6q9-9 23-5 13 4 16 14-3 10-16 14-14 4-23-5L4 47q-4 1-2-2Z" fill="#4A9FC2" />
        <path d="m29 20 6-9q2-2 4 0l6 9m-16 23 6 9q2 2 4 0l6-9" fill="#75C0D5" />
        <ellipse cx="42" cy="32" rx="13" ry="12" fill="#6BB8CF" />
        <ellipse cx="45" cy="29" rx="5" ry="6" fill="#FFFFFF" />
        <circle cx="46" cy="30" r="3" fill="#172033" />
        <circle cx="47" cy="29" r="1" fill="#FFFFFF" />
        <path d="M36 37q5 4 10 0m-9-11q-2 6 0 12" fill="none" stroke="#277A9A" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="24" cy="29" r="2" fill="#BCE4E8" />
        <circle cx="29" cy="36" r="2" fill="#BCE4E8" />
      </>}
      {avatar === "bird" && <>
        <path d="M21 20q-1-9 5-13l6 9 6-11q7 7 5 16 13 7 13 23 0 18-24 18T8 44q0-17 13-24Z" fill="#F2BD48" />
        <path d="M21 17q0-8 6-11l5 9 6-10q7 7 5 15-10-5-22-3Z" fill="#D21034" />
        <ellipse cx="32" cy="39" rx="18" ry="17" fill="#FFF0C5" />
        <Eyes y={30} left={23} right={41} />
        <path d="M27 38q5-4 10 0l-5 7Z" fill="#D97706" />
        <circle cx="16" cy="42" r="2" fill="#E89B68" />
        <circle cx="48" cy="42" r="2" fill="#E89B68" />
      </>}
      {avatar === "monkey" && <>
        <circle cx="13" cy="34" r="11" fill="#A86739" />
        <circle cx="51" cy="34" r="11" fill="#A86739" />
        <circle cx="13" cy="34" r="5" fill="#E8B894" />
        <circle cx="51" cy="34" r="5" fill="#E8B894" />
        <ellipse cx="32" cy="34" rx="22" ry="25" fill="#A86739" />
        <path d="M14 38q0-15 18-16 18 1 18 16-1 17-18 18-17-1-18-18Z" fill="#F0CBA9" />
        <Eyes y={31} />
        <ellipse cx="32" cy="41" rx="4" ry="3" fill="#563424" />
        <path d="M27 47q5 4 10 0" fill="none" stroke="#7C4A30" strokeWidth="1.5" strokeLinecap="round" />
      </>}
      {avatar === "bear" && <>
        <circle cx="16" cy="17" r="11" fill="#835036" />
        <circle cx="48" cy="17" r="11" fill="#835036" />
        <circle cx="16" cy="17" r="5" fill="#C28A5C" />
        <circle cx="48" cy="17" r="5" fill="#C28A5C" />
        <circle cx="32" cy="35" r="25" fill="#9B6847" />
        <ellipse cx="32" cy="43" rx="13" ry="10" fill="#E7C6A2" />
        <Eyes y={31} />
        <ellipse cx="32" cy="41" rx="4" ry="3" fill="#3C2A25" />
        <path d="M32 44v2m0 0q-3 3-5 0m5 0q3 3 5 0" fill="none" stroke="#68442F" strokeWidth="1.5" strokeLinecap="round" />
      </>}
      {avatar === "frog" && <>
        <path d="M8 34q0-19 24-20 24 1 24 20v9q-1 15-24 16Q9 58 8 43Z" fill="#69A84F" />
        <circle cx="20" cy="21" r="11" fill="#83BE62" />
        <circle cx="44" cy="21" r="11" fill="#83BE62" />
        <ellipse cx="20" cy="21" rx="6" ry="7" fill="#FFFFFF" />
        <ellipse cx="44" cy="21" rx="6" ry="7" fill="#FFFFFF" />
        <circle cx="21" cy="22" r="3.5" fill="#172033" />
        <circle cx="45" cy="22" r="3.5" fill="#172033" />
        <circle cx="22" cy="20" r="1.2" fill="#FFFFFF" />
        <circle cx="46" cy="20" r="1.2" fill="#FFFFFF" />
        <path d="M19 41q13 13 26 0" fill="none" stroke="#245E34" strokeWidth="2" strokeLinecap="round" />
        <circle cx="14" cy="39" r="2" fill="#F49B9B" opacity=".7" />
        <circle cx="50" cy="39" r="2" fill="#F49B9B" opacity=".7" />
      </>}
    </svg>
  );
}
