import { useEffect, useRef } from 'react';
import { supabase, isDemoMode } from '@/lib/supabaseClient';

export function useTimeTracker(activityType: string) {
  const startTimeRef = useRef<number>(Date.now());
  const accumulatedTimeRef = useRef<number>(0);
  const isActiveRef = useRef<boolean>(true);

  useEffect(() => {
    // If it's a guest, don't bother tracking time to the database
    if (isDemoMode) return;

    // Pauses the timer if you switch tabs or lock your phone
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!isActiveRef.current) {
          startTimeRef.current = Date.now();
          isActiveRef.current = true;
        }
      } else {
        if (isActiveRef.current) {
          accumulatedTimeRef.current += Date.now() - startTimeRef.current;
          isActiveRef.current = false;
        }
      }
    };

    // Pauses the timer if you click to another window on a desktop
    const handleBlur = () => {
      if (isActiveRef.current) {
        accumulatedTimeRef.current += Date.now() - startTimeRef.current;
        isActiveRef.current = false;
      }
    };

    // Resumes the timer when you click back into the window
    const handleFocus = () => {
      if (!isActiveRef.current) {
        startTimeRef.current = Date.now();
        isActiveRef.current = true;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);

      // Tally up the final time when you leave the drill page
      let totalTime = accumulatedTimeRef.current;
      if (isActiveRef.current) {
        totalTime += Date.now() - startTimeRef.current;
      }

      const durationSeconds = Math.floor(totalTime / 1000);
      
      // Only log it to the database if you were there for more than 10 seconds
      if (durationSeconds > 10) {
        supabase.from('activity_logs').insert({
          activity_type: activityType,
          duration_seconds: durationSeconds,
          created_at: new Date().toISOString()
        }).then(({ error }) => {
          if (error) console.error("Error logging time:", error);
        });
      }
    };
  }, [activityType]);
}