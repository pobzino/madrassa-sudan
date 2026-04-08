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
          background: "#007229",
          borderRadius: "6px",
        }}
      >
        {/* Simplified owl face — readable at 32x32 */}
        <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
          {/* Head */}
          <circle cx="20" cy="22" r="16" fill="#D21034" />
          {/* Facial disc */}
          <ellipse cx="20" cy="20" rx="13" ry="10" fill="#E8334F" />
          {/* Eyes */}
          <ellipse cx="14" cy="19" rx="5.5" ry="6" fill="white" />
          <ellipse cx="26" cy="19" rx="5.5" ry="6" fill="white" />
          <circle cx="15.5" cy="19" r="3.5" fill="#000" />
          <circle cx="17" cy="17.5" r="1.5" fill="white" />
          <circle cx="24.5" cy="19" r="3.5" fill="#000" />
          <circle cx="26" cy="17.5" r="1.5" fill="white" />
          {/* Beak */}
          <ellipse cx="20" cy="27" rx="3" ry="2" fill="#F59E0B" />
          {/* Cap */}
          <path d="M6 10l14-5 14 5-14 6-14-6z" fill="#007229" stroke="white" strokeWidth="0.5" />
          <rect x="8" y="10" width="24" height="3" rx="1" fill="#1a1a1a" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
