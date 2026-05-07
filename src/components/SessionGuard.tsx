"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase, isDemoMode } from "@/lib/supabaseClient";
import InstallScreen from "@/components/InstallScreen";

export default function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isPWA, setIsPWA] = useState(true);
  const [hasBypassedInstall, setHasBypassedInstall] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 1. Check for PWA Installation on mount
  useEffect(() => {
    setMounted(true);
    
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    // @ts-ignore - iOS specific check
    const isIOSStandalone = window.navigator.standalone === true;
    
    // Only enforce the install screen on mobile devices
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
        setIsPWA(isStandalone || isIOSStandalone);
    } else {
        setIsPWA(true); // Don't block desktop browser users
    }
  }, []);

  // 2. Check for Supabase Session
  useEffect(() => {
    if (isDemoMode) {
      setIsCheckingSession(false);
      return;
    }

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session && pathname !== '/login') {
        router.replace('/login');
      } else {
        setIsCheckingSession(false);
      }
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && pathname !== '/login') {
        router.replace('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  // Prevent a white flash before React hydration finishes
  if (!mounted) return <div className="min-h-[100dvh] bg-[#fafafa]" />;

  // UNIVERSAL GATEKEEPER 1: Enforce PWA Installation (Catches Demo & Paid users)
  if (!isPWA && !hasBypassedInstall) {
    return <InstallScreen onBypass={() => setHasBypassedInstall(true)} />;
  }

  // UNIVERSAL GATEKEEPER 2: Wait for auth check to finish
  if (isCheckingSession && pathname !== '/login') {
    return <div className="min-h-[100dvh] bg-[#fafafa]" />;
  }

  // If both checks pass, render the app!
  return <>{children}</>;
}