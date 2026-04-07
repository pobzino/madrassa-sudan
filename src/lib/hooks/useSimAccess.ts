"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser, getCachedProfile } from "@/lib/supabase/auth-cache";

export function useSimAccess() {
  const [canAccessSims, setCanAccessSims] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function check() {
      const user = await getCachedUser(supabase);
      if (!user) {
        setLoading(false);
        return;
      }
      const profile = await getCachedProfile(supabase, user.id);
      const isDev = process.env.NODE_ENV === "development";
      setCanAccessSims(profile?.can_access_sims ?? isDev);
      setLoading(false);
    }

    check();
  }, []);

  return { canAccessSims, loading };
}
