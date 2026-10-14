import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (projectToken && host) {
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
}
