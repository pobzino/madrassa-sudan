"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCachedUser, getCachedProfile, getLastAuthStatus } from "@/lib/supabase/auth-cache";
import type { Profile } from "@/lib/database.types";

export function useTeacherGuard() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const teacherDevBypass = process.env.NEXT_PUBLIC_DEV_ALLOW_TEACHER_VIEW === "1";

  useEffect(() => {
    const supabase = createClient();

    async function checkRole() {
      const user = await getCachedUser(supabase);
      if (!user) {
        // Offline or lie-fi (no answer) isn't signed out; DashboardLayout
        // sends that case to the saved-lessons hub.
        if (getLastAuthStatus() === "signed_out") router.push("/auth/login");
        return;
      }

      const profileData = await getCachedProfile(supabase, user.id);
      const isTeacher = profileData?.role === "teacher" || profileData?.role === "admin";
      if (!isTeacher && !teacherDevBypass) {
        router.push("/dashboard");
        return;
      }

      setProfile(profileData);
      setLoading(false);
    }

    checkRole();
  }, [router, teacherDevBypass]);

  return { profile, loading };
}
