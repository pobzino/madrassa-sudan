"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useOnlineStatus } from "@/components/offline/useOnlineStatus";
import posthog from "posthog-js";
import { getOpaqueLearnerAnalyticsId } from "@/lib/analytics-identity";
import { createClient } from "@/lib/supabase/client";

type PostHogInitializerProps = {
  host?: string;
  projectToken?: string;
};

let initializedFor: string | undefined;
let identifiedAccountId: string | undefined;

function canRecordSession(pathname: string) {
  return ["/", "/parents", "/sample-lesson", "/privacy", "/terms", "/tutor"].includes(pathname);
}

export default function PostHogInitializer({ host, projectToken }: PostHogInitializerProps) {
  const pathname = usePathname();
  const configurationKey = projectToken && host ? `${projectToken}:${host}` : undefined;
  const shouldRecordSession = canRecordSession(pathname);
  const online = useOnlineStatus();

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

    if (!canRecordSession(pathname) && posthog.__loaded) {
      posthog.stopSessionRecording();
    }

    // Offline, leave the auth client alone: creating it starts a refresh of an
    // expired session that retries for ~25 s, and getUser can't answer anyway.
    // The identity is set up when the connection returns (`online` changes).
    if (!online || !navigator.onLine) return;

    const supabase = createClient();
    let cancelled = false;

    const clearIdentity = () => {
      if (!identifiedAccountId) return;
      posthog.reset();
      identifiedAccountId = undefined;
    };

    const identifyAuthenticatedAccount = async (accountId: string) => {
      if (identifiedAccountId === accountId) return;
      const distinctId = await getOpaqueLearnerAnalyticsId(accountId);
      if (cancelled || !posthog.__loaded) return;
      posthog.identify(distinctId);
      identifiedAccountId = accountId;
    };

    // Only an explicit sign-out clears the identity: a check that fails
    // (lie-fi, a timeout, an expired token being refreshed) says nothing
    // about who is signed in.
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (data.user) return identifyAuthenticatedAccount(data.user.id);
      })
      .catch(() => undefined);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearIdentity();
        return;
      }
      if (session?.user) void identifyAuthenticatedAccount(session.user.id);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [configurationKey, host, online, pathname, projectToken, shouldRecordSession]);

  return null;
}
