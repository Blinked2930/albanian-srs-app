"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      
      {/* THIS IS THE SAFE WAY TO ADD CUSTOM ANIMATIONS IN NEXT.JS */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes floatBreathe {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-10px) scale(1.03); }
        }
        .animate-float-breathe {
          animation: floatBreathe 5s ease-in-out infinite;
        }
      `}} />

      {/* Soft background glow to match the pastel theme */}
      <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] bg-gradient-to-br from-pink-100/40 via-purple-50/20 to-indigo-100/40 z-0 pointer-events-none"></div>

      {/* Greeting Header */}
      <div className="text-center z-10 mb-12 flex flex-col items-center">
        
        {/* NEW FLASHCARD ICON */}
        <div className="animate-float-breathe inline-flex items-center justify-center w-24 h-24 bg-white/60 backdrop-blur-xl rounded-[2rem] shadow-[0_8px_32px_rgba(255,182,193,0.3)] mb-6 text-pink-500 border-2 border-white">
          <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {/* Back card (faded) */}
            <path d="M9 7h9a2 2 0 0 1 2 2v9" strokeOpacity="0.4" />
            {/* Front card */}
            <rect x="4" y="11" width="13" height="9" rx="2" ry="2" />
            {/* Checkmark */}
            <path d="M7 15.5l2.5 2.5L14 13" />
          </svg>
        </div>

        <h1 className="text-4xl font-black mb-3 text-slate-700 tracking-tight">
          Albanian SRS
        </h1>
        <p className="text-slate-500 font-bold px-6 py-2 bg-white/60 backdrop-blur-md rounded-full inline-block border border-white/80 shadow-sm">
          Let's learn today! ✨
        </p>
      </div>

      {/* Grid of Main Nav Actions */}
      <div className="grid grid-cols-2 gap-5 w-full max-w-sm z-10">
        <Link href="/drill/word" className="bg-white/60 backdrop-blur-xl px-4 py-8 rounded-[2.5rem] flex flex-col items-center gap-4 transition-all active:scale-95 shadow-sm hover:shadow-[0_8px_24px_rgba(99,102,241,0.2)] border-2 border-white group">
          <div className="w-16 h-16 bg-indigo-100 rounded-[1.5rem] flex items-center justify-center text-indigo-500 group-hover:-translate-y-1 transition-transform shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3z"/><path d="M3 4h8s-.5-2-1-2H5a2 2 0 0 0-2 2z"/></svg>
          </div>
          <span className="font-bold text-slate-700 text-lg">Words</span>
        </Link>
        
        <Link href="/drill/sentence" className="bg-white/60 backdrop-blur-xl px-4 py-8 rounded-[2.5rem] flex flex-col items-center gap-4 transition-all active:scale-95 shadow-sm hover:shadow-[0_8px_24px_rgba(16,185,129,0.2)] border-2 border-white group">
          <div className="w-16 h-16 bg-emerald-100 rounded-[1.5rem] flex items-center justify-center text-emerald-500 group-hover:-translate-y-1 transition-transform shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
          </div>
          <span className="font-bold text-slate-700 text-lg">Sentences</span>
        </Link>

        <Link href="/dashboard" className="bg-white/60 backdrop-blur-xl px-4 py-8 rounded-[2.5rem] flex flex-col items-center gap-4 transition-all active:scale-95 shadow-sm hover:shadow-[0_8px_24px_rgba(245,158,11,0.2)] border-2 border-white group">
          <div className="w-16 h-16 bg-amber-100 rounded-[1.5rem] flex items-center justify-center text-amber-500 group-hover:-translate-y-1 transition-transform shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          </div>
          <span className="font-bold text-slate-700 text-lg">Progress</span>
        </Link>

        <Link href="/manage" className="bg-white/60 backdrop-blur-xl px-4 py-8 rounded-[2.5rem] flex flex-col items-center gap-4 transition-all active:scale-95 shadow-sm hover:shadow-[0_8px_24px_rgba(244,63,94,0.2)] border-2 border-white group">
          <div className="w-16 h-16 bg-rose-100 rounded-[1.5rem] flex items-center justify-center text-rose-500 group-hover:-translate-y-1 transition-transform shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
          </div>
          <span className="font-bold text-slate-700 text-lg">Manage</span>
        </Link>
      </div>

    </main>
  );
}