"use client";

import { Suspense, useEffect, useState, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevRef = useRef(pathname + searchParams.toString());

  useEffect(() => {
    const current = pathname + searchParams.toString();
    if (current === prevRef.current) return;
    prevRef.current = current;

    // Navigation completed — jump to 100% then hide
    setProgress(100);
    setVisible(true);

    const hide = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 200);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => clearTimeout(hide);
  }, [pathname, searchParams]);

  // Listen for clicks on internal links to start the bar immediately
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:")) return;
      if (anchor.target === "_blank") return;

      // Same page — don't show progress
      const current = pathname + searchParams.toString();
      const url = new URL(href, window.location.origin);
      if (url.pathname + url.search === current) return;

      // Start progress bar
      setProgress(15);
      setVisible(true);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            if (timerRef.current) clearInterval(timerRef.current);
            return prev;
          }
          // Slow down as it gets higher
          const increment = prev < 50 ? 8 : prev < 70 ? 4 : 2;
          return Math.min(prev + increment, 90);
        });
      }, 150);
    }

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pathname, searchParams]);

  if (!visible && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[3px]">
      <div
        className="h-full bg-[#007229] shadow-sm shadow-[#007229]/50"
        style={{
          width: `${progress}%`,
          transition: progress === 100
            ? "width 150ms ease-out"
            : progress === 0
              ? "none"
              : "width 300ms ease-out",
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}

export default function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
