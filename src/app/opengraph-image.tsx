import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "Amal School — مدرسة أمل | Quality education for every Sudanese child";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #007229 0%, #00913D 40%, #006B25 100%)",
          fontFamily: "system-ui, sans-serif",
          padding: "60px 80px",
          gap: "60px",
        }}
      >
        {/* Decorative elements */}
        <div
          style={{
            position: "absolute",
            top: "-80px",
            right: "-60px",
            width: "360px",
            height: "360px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.07)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-120px",
            left: "-80px",
            width: "420px",
            height: "420px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.05)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "40px",
            left: "60px",
            width: "120px",
            height: "120px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.04)",
          }}
        />

        {/* Owl mascot */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="220" height="220" viewBox="0 0 64 64" fill="none">
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
            <path d="M28 42 Q32 48 36 42" fill="#E08A05" />
            {/* Graduation cap */}
            <path d="M12 16c0-2 9-4 20-4s20 2 20 4v3c0 1-9 2-20 2s-20-1-20-2v-3z" fill="#1a1a1a" />
            <path d="M8 12l24-6 24 6-24 8-24-8z" fill="#007229" />
            <path d="M8 12l24 8 24-8" stroke="#005C22" strokeWidth="1" fill="none" />
            <circle cx="32" cy="10" r="2.5" fill="#1a1a1a" />
            {/* Tassel */}
            <path d="M32 10 Q40 14 44 22" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <ellipse cx="45" cy="24" rx="3" ry="4" fill="#F59E0B" />
            {/* Feet */}
            <ellipse cx="24" cy="60" rx="4" ry="2.5" fill="#F59E0B" />
            <ellipse cx="40" cy="60" rx="4" ry="2.5" fill="#F59E0B" />
          </svg>
        </div>

        {/* Text content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "12px",
            flex: 1,
          }}
        >
          {/* Brand name */}
          <div
            style={{
              fontSize: "80px",
              fontWeight: "800",
              color: "white",
              letterSpacing: "-3px",
              lineHeight: 1,
            }}
          >
            Amal School
          </div>

          {/* Arabic brand */}
          <div
            style={{
              fontSize: "52px",
              fontWeight: "700",
              color: "rgba(255,255,255,0.9)",
              lineHeight: 1,
            }}
          >
            مدرسة أمل
          </div>

          {/* Divider */}
          <div
            style={{
              width: "80px",
              height: "4px",
              background: "rgba(255,255,255,0.4)",
              borderRadius: "2px",
              marginTop: "8px",
              marginBottom: "8px",
            }}
          />

          {/* Tagline */}
          <div
            style={{
              fontSize: "26px",
              color: "rgba(255,255,255,0.85)",
              lineHeight: 1.5,
              maxWidth: "520px",
            }}
          >
            Quality education for every Sudanese child, anywhere in the world.
          </div>

          {/* Feature pills */}
          <div
            style={{
              display: "flex",
              gap: "12px",
              marginTop: "16px",
            }}
          >
            {["Interactive Lessons", "AI Tutor", "Free Forever"].map((label) => (
              <div
                key={label}
                style={{
                  padding: "8px 20px",
                  background: "rgba(255,255,255,0.15)",
                  borderRadius: "50px",
                  fontSize: "16px",
                  color: "rgba(255,255,255,0.9)",
                  fontWeight: "600",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
