"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackAnalyticsEvent } from "@/lib/analytics";
import type { AnalyticsEventName, AnalyticsProperties } from "@/lib/analytics.shared";

export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    trackAnalyticsEvent("page_view");
  }, [pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>("[data-analytics]");
      if (!target) return;

      const eventName = target.dataset.analytics as AnalyticsEventName | undefined;
      if (!eventName) return;

      const properties: AnalyticsProperties = {};
      if (target.dataset.analyticsSource) properties.source = target.dataset.analyticsSource;
      if (target.dataset.analyticsRole) properties.role = target.dataset.analyticsRole;
      trackAnalyticsEvent(eventName, properties);
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
