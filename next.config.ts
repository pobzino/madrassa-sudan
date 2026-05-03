import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

function hostnameFromUrl(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    return new URL(value).hostname;
  } catch {
    return fallback;
  }
}

const supabaseStorageHostnames = Array.from(
  new Set([
    hostnameFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, "iibreuwewlaepbfonaov.supabase.co"),
    "iibreuwewlaepbfonaov.supabase.co",
  ])
);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      ...supabaseStorageHostnames.map((hostname) => ({
        protocol: "https" as const,
        hostname,
        pathname: "/storage/v1/object/public/**",
      })),
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "54321",
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: "vz-2c7416b3-176.b-cdn.net",
        pathname: "/**",
      },
    ],
  },
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
