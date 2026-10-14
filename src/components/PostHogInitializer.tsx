"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";

type PostHogInitializerProps = {
  host?: string;
  projectToken?: string;
};

let initializedFor: string | undefined;

function canRecordSession(pathname: string) {
  return ["/", "/parents", "/sample-lesson", "/privacy", "/terms", "/tutor"].includes(pathname);
}

export default function PostHogInitializer({ host, projectToken }: PostHogInitializerProps) {
  const pathname = usePathname();
  const configurationKey = projectToken && host ? `${projectToken}:${host}` : undefined;
  const shouldRecordSession = canRecordSession(pathname);

  useEffect(() => {
    if (!projectToken || !host || !configurationKey) return;

    if (initializedFor !== configurationKey) {
      posthog.init(projectToken, {
        api_host: host,
        autocapture: true,
        mask_all_element_attributes: true,
        mask_all_text: true,
        disable_capture_url_hashes: true,
        rageclick: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_exceptions: false,
        disable_session_recording: !shouldRecordSession,
        session_recording: {
          maskAllInputs: true,
          maskAllElementAttributes: true,
          maskTextSelector: "body",
          blockSelector: "input[type='hidden'], input[type='file']",
        },
        disable_external_dependency_loading: false,
        disable_persistence: true,
        person_profiles: "never",
        save_campaign_params: false,
        save_referrer: false,
        disableDeviceModel: true,
        debug: process.env.NODE_ENV === "development",
      });
      initializedFor = configurationKey;
    }

    if (canRecordSession(pathname) || !posthog.__loaded) return;

    posthog.stopSessionRecording();
  }, [configurationKey, host, pathname, projectToken, shouldRecordSession]);

  return null;
}
