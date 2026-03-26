"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
  const pathname = usePathname();

  // Hide the bottom nav on the login page since it's full-screen auth
  if (pathname === "/login") return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 pb-6 z-50 pointer-events-none">
      <div className="max-w-md mx-auto cutesy-glass rounded-[2rem] p-2 flex justify-between items-center shadow-[0_8px_32px_rgba(255,182,193,0.3)] pointer-events-auto border-4 border-white">
        
        <Link 
          href="/" 
          className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-300 active:scale-90 ${pathname === '/' ? 'bg-pink-100/80 text-pink-500 shadow-inner' : 'text-slate-400 hover:text-pink-400'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </Link>

        <Link 
          href="/drill/word" 
          className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-300 active:scale-90 ${pathname.startsWith('/drill') ? 'bg-indigo-100/80 text-indigo-500 shadow-inner' : 'text-slate-400 hover:text-indigo-400'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
        </Link>

        <Link 
          href="/dashboard" 
          className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-300 active:scale-90 ${pathname === '/dashboard' ? 'bg-amber-100/80 text-amber-500 shadow-inner' : 'text-slate-400 hover:text-amber-400'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        </Link>
        
        <Link 
          href="/manage" 
          className={`flex flex-col items-center justify-center w-16 h-16 rounded-2xl transition-all duration-300 active:scale-90 ${pathname === '/manage' ? 'bg-emerald-100/80 text-emerald-500 shadow-inner' : 'text-slate-400 hover:text-emerald-400'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </Link>

      </div>
    </div>
  );
}
