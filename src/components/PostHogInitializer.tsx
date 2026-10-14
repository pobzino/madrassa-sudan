"use client";

import posthog from "posthog-js";

type PostHogInitializerProps = {
  host?: string;
  projectToken?: string;
};

let initializedFor: string | undefined;

export default function PostHogInitializer({ host, projectToken }: PostHogInitializerProps) {
  const configurationKey = projectToken && host ? `${projectToken}:${host}` : undefined;

  if (projectToken && host && configurationKey && initializedFor !== configurationKey) {
    posthog.init(projectToken, {
      api_host: host,
      autocapture: false,
      rageclick: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_exceptions: false,
      disable_session_recording: true,
      disable_external_dependency_loading: true,
      disable_persistence: true,
      person_profiles: "never",
      save_campaign_params: false,
      save_referrer: false,
      disableDeviceModel: true,
      debug: process.env.NODE_ENV === "development",
    });
    initializedFor = configurationKey;
  }

  return null;
}
