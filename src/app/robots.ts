import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/auth/",
        "/cohorts/",
        "/dashboard/",
        "/dev/",
        "/diagnostic/",
        "/downloads/",
        "/exploration-lab/",
        "/homework/",
        "/lessons/",
        "/offline/",
        "/owls/",
        "/practice/",
        "/progress/",
        "/settings/",
        "/sim-lab/",
        "/teacher/",
        "/tutor/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
