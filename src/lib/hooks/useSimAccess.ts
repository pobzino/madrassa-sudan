"use client";

import { useState } from "react";

// Sim recording is now available to all teachers. The `useState` call is
// preserved so Fast Refresh keeps a consistent hook signature with previous
// versions that tracked loading state.
export function useSimAccess() {
  const [canAccessSims] = useState(true);
  return { canAccessSims, loading: false };
}
