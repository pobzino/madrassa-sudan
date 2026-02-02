"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser, getCachedProfile } from "@/lib/supabase/auth-cache";
import type { Profile } from "@/lib/database.types";

export function useTeacherGuard() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function checkRole() {
      const user = await getCachedUser(supabase);
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const profileData = await getCachedProfile(supabase, user.id);
      if (!profileData || (profileData.role !== "teacher" && profileData.role !== "admin")) {
        router.push("/dashboard");
        return;
      }

      setProfile(profileData);
      setLoading(false);
    }

    checkRole();
  }, [router]);

  return { profile, loading };
}
