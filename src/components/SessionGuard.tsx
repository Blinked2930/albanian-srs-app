"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase, isDemoMode } from "@/lib/supabaseClient";

export default function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  
  // Start in a "checking" state so we don't flash the wrong screen
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (isDemoMode) {
      setIsChecking(false);
      return;
    }

    const checkSession = async () => {
      // The crucial await: Forces the PWA to wait for local storage to load
      const { data: { session }, error } = await supabase.auth.getSession();

      if (!session && pathname !== '/login') {
        router.replace('/login');
      } else {
        setIsChecking(false);
      }
    };

    checkSession();

    // Background listener to keep the token fresh or catch logouts
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && pathname !== '/login') {
        router.replace('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  // While checking storage, render a blank background to prevent layout flashing
  if (isChecking && pathname !== '/login') {
    return <div className="min-h-[100dvh] bg-[#fafafa]" />;
  }

  return <>{children}</>;
}