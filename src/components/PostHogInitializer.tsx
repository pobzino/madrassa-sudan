"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
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

    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        clearIdentity();
        return;
      }
      return identifyAuthenticatedAccount(data.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        clearIdentity();
        return;
      }
      void identifyAuthenticatedAccount(session.user.id);
    });

    if (!canRecordSession(pathname) && posthog.__loaded) {
      posthog.stopSessionRecording();
    }

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [configurationKey, host, pathname, projectToken, shouldRecordSession]);

  return null;
}
