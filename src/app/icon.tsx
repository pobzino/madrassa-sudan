import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
        }}
      >
        {/* Owl favicon - full size */}
        <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
          {/* Ear tufts */}
          <ellipse cx="14" cy="18" rx="5" ry="7" fill="#a01028" />
          <ellipse cx="50" cy="18" rx="5" ry="7" fill="#a01028" />

          {/* Main body */}
          <ellipse cx="32" cy="38" rx="24" ry="24" fill="#D21034" />

          {/* Facial disc */}
          <ellipse cx="32" cy="34" rx="18" ry="14" fill="#E8334F" />

          {/* Belly */}
          <ellipse cx="32" cy="52" rx="12" ry="8" fill="#FFF5F5" />

          {/* Eyes */}
          <ellipse cx="23" cy="32" rx="8" ry="9" fill="white" />
          <ellipse cx="41" cy="32" rx="8" ry="9" fill="white" />
          <circle cx="25" cy="32" r="5" fill="#000000" />
          <circle cx="27" cy="30" r="2" fill="white" />
          <circle cx="39" cy="32" r="5" fill="#000000" />
          <circle cx="41" cy="30" r="2" fill="white" />

          {/* Beak */}
          <ellipse cx="32" cy="42" rx="4" ry="3" fill="#F59E0B" />

          {/* Graduation cap */}
          <path d="M12 16c0-2 9-4 20-4s20 2 20 4v3c0 1-9 2-20 2s-20-1-20-2v-3z" fill="#1a1a1a" />
          <path d="M8 12l24-6 24 6-24 8-24-8z" fill="#007229" />
          <circle cx="32" cy="10" r="2.5" fill="#1a1a1a" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
