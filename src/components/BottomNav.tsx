"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function BottomNav() {
  const pathname = usePathname();

  // ONLY hide on the login screen now. It stays everywhere else.
  if (pathname === "/login") return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] pointer-events-none"
      style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
    >
      <div className="max-w-sm mx-auto bg-white/60 backdrop-blur-xl rounded-[2rem] p-1.5 flex justify-between items-center shadow-[0_8px_32px_rgba(0,0,0,0.05)] pointer-events-auto border-2 border-white mx-4">
        
        <Link 
          href="/" 
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-[1.5rem] transition-all duration-300 active:scale-90 ${pathname === '/' ? 'bg-pink-100/80 text-pink-500 shadow-sm' : 'text-slate-400 hover:text-pink-400'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </Link>

        <Link 
          href="/drill/word" 
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-[1.5rem] transition-all duration-300 active:scale-90 ${pathname.startsWith('/drill/word') ? 'bg-indigo-100/80 text-indigo-500 shadow-sm' : 'text-slate-400 hover:text-indigo-400'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3z"/><path d="M3 4h8s-.5-2-1-2H5a2 2 0 0 0-2 2z"/></svg>
        </Link>

        <Link 
          href="/drill/sentence" 
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-[1.5rem] transition-all duration-300 active:scale-90 ${pathname.startsWith('/drill/sentence') ? 'bg-emerald-100/80 text-emerald-500 shadow-sm' : 'text-slate-400 hover:text-emerald-400'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
        </Link>
        
        <Link 
          href="/manage" 
          className={`flex flex-col items-center justify-center w-14 h-14 rounded-[1.5rem] transition-all duration-300 active:scale-90 ${pathname === '/manage' ? 'bg-rose-100/80 text-rose-500 shadow-sm' : 'text-slate-400 hover:text-rose-400'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
        </Link>

      </div>
    </div>
  );
}