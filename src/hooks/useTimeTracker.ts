import { useEffect, useRef } from "react";
import { supabase, isDemoMode } from "@/lib/supabaseClient";

export function useTimeTracker(activityType: string) {
  const startTimeRef = useRef<number>(Date.now());
  const hasLoggedRef = useRef<boolean>(false);

  useEffect(() => {
    // Reset the stopwatch on mount
    startTimeRef.current = Date.now();
    hasLoggedRef.current = false;

    const logTime = async () => {
      // Prevent duplicate logging and ignore Ghost Mode guests
      if (hasLoggedRef.current || isDemoMode) return;

      const elapsedSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);

      // Only save to database if you spent more than 15 seconds (filters out accidental clicks)
      if (elapsedSeconds > 15) {
        hasLoggedRef.current = true;
        try {
          await supabase.from('activity_logs').insert([
            { activity_type: activityType, duration_seconds: elapsedSeconds }
          ]);
        } catch (err) {
          console.error("Failed to log time:", err);
        }
      }
    };

    // Trigger log when the user closes the tab or refreshes
    window.addEventListener('beforeunload', logTime);

    // Trigger log when the component unmounts (e.g., clicking back to the Dashboard)
    return () => {
      window.removeEventListener('beforeunload', logTime);
      logTime();
    };
  }, [activityType]);
}