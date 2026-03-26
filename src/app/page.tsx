"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center p-6 pt-12 relative overflow-hidden">
      {/* Greeting Header */}
      <div className="text-center z-10 mb-12 flex flex-col items-center">
        <div className="inline-flex items-center justify-center w-24 h-24 bg-white/60 backdrop-blur-xl rounded-[2rem] shadow-[0_8px_32px_rgba(255,182,193,0.4)] mb-6 text-pink-500 animate-[bounce_3s_infinite]">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <h1 className="text-4xl font-black mb-3 text-slate-700 tracking-tight">
          Albanian SRS
        </h1>
        <p className="text-slate-500 font-bold px-6 py-2 bg-white/40 rounded-full inline-block">
          Let's learn today! ✨
        </p>
      </div>

      {/* Grid of Main Nav Actions */}
      <div className="grid grid-cols-2 gap-5 w-full max-w-sm z-10">
        <Link href="/drill/word" className="cutesy-glass px-4 py-8 rounded-[2rem] flex flex-col items-center gap-4 transition-all active:scale-95 shadow-sm hover:shadow-[0_8px_24px_rgba(99,102,241,0.2)] border-2 border-white/80 group">
          <div className="w-16 h-16 bg-indigo-100 rounded-[1.5rem] flex items-center justify-center text-indigo-500 group-hover:-translate-y-1 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3z"/><path d="M3 4h8s-.5-2-1-2H5a2 2 0 0 0-2 2z"/></svg>
          </div>
          <span className="font-bold text-slate-700 text-lg">Words</span>
        </Link>
        
        <Link href="/drill/sentence" className="cutesy-glass px-4 py-8 rounded-[2rem] flex flex-col items-center gap-4 transition-all active:scale-95 shadow-sm hover:shadow-[0_8px_24px_rgba(16,185,129,0.2)] border-2 border-white/80 group">
          <div className="w-16 h-16 bg-emerald-100 rounded-[1.5rem] flex items-center justify-center text-emerald-500 group-hover:-translate-y-1 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
          </div>
          <span className="font-bold text-slate-700 text-lg">Sentences</span>
        </Link>

        <Link href="/dashboard" className="cutesy-glass px-4 py-8 rounded-[2rem] flex flex-col items-center gap-4 transition-all active:scale-95 shadow-sm hover:shadow-[0_8px_24px_rgba(245,158,11,0.2)] border-2 border-white/80 group">
          <div className="w-16 h-16 bg-amber-100 rounded-[1.5rem] flex items-center justify-center text-amber-500 group-hover:-translate-y-1 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          </div>
          <span className="font-bold text-slate-700 text-lg">Progress</span>
        </Link>

        <Link href="/manage" className="cutesy-glass px-4 py-8 rounded-[2rem] flex flex-col items-center gap-4 transition-all active:scale-95 shadow-sm hover:shadow-[0_8px_24px_rgba(244,63,94,0.2)] border-2 border-white/80 group">
          <div className="w-16 h-16 bg-rose-100 rounded-[1.5rem] flex items-center justify-center text-rose-500 group-hover:-translate-y-1 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
          </div>
          <span className="font-bold text-slate-700 text-lg">Manage</span>
        </Link>
      </div>
    </main>
  );
}
