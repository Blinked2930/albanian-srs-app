"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0F172A] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-600/20 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-rose-600/20 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="max-w-2xl w-full text-center z-10">
        <h1 className="text-5xl md:text-6xl font-black mb-4 tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-white to-white/60">
          Albanian Language Lab
        </h1>
        <p className="text-lg text-white/70 mb-12 max-w-lg mx-auto">
          High-friction, focused language acquisition through spaced repetition and dynamic grammar drills.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link href="/drill/word" className="group glassmorphism p-6 rounded-2xl border border-white/5 hover:border-indigo-500/50 hover:bg-white/5 transition-all text-left relative overflow-hidden flex flex-col items-start gap-4">
            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="bg-indigo-500/20 p-3 rounded-xl border border-indigo-500/20 text-indigo-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3z"/><path d="M3 4h8s-.5-2-1-2H5a2 2 0 0 0-2 2z"/></svg>
            </div>
            <div>
              <h2 className="text-xl font-bold mb-1 group-hover:text-indigo-400 transition-colors">Word Drills</h2>
              <p className="text-sm text-white/50">Practice vocabulary with random grammar constraints like tense, mood, and case.</p>
            </div>
          </Link>

          <Link href="/drill/sentence" className="group glassmorphism p-6 rounded-2xl border border-white/5 hover:border-emerald-500/50 hover:bg-white/5 transition-all text-left relative overflow-hidden flex flex-col items-start gap-4">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="bg-emerald-500/20 p-3 rounded-xl border border-emerald-500/20 text-emerald-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
            </div>
            <div>
              <h2 className="text-xl font-bold mb-1 group-hover:text-emerald-400 transition-colors">Sentence Drills</h2>
              <p className="text-sm text-white/50">Translate full contextual sentences dynamically generated to target your weaknesses.</p>
            </div>
          </Link>

          <Link href="/dashboard" className="group glassmorphism p-6 rounded-2xl border border-white/5 hover:border-amber-500/50 hover:bg-white/5 transition-all text-left relative overflow-hidden flex flex-col items-start gap-4">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="bg-amber-500/20 p-3 rounded-xl border border-amber-500/20 text-amber-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
            </div>
            <div>
              <h2 className="text-xl font-bold mb-1 group-hover:text-amber-400 transition-colors">Progress Dashboard</h2>
              <p className="text-sm text-white/50">Visualize your mastery of words and grammar metrics over time.</p>
            </div>
          </Link>

          <Link href="/manage" className="group glassmorphism p-6 rounded-2xl border border-white/5 hover:border-rose-500/50 hover:bg-white/5 transition-all text-left relative overflow-hidden flex flex-col items-start gap-4">
            <div className="absolute top-0 left-0 w-1 h-full bg-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="bg-rose-500/20 p-3 rounded-xl border border-rose-500/20 text-rose-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
            </div>
            <div>
              <h2 className="text-xl font-bold mb-1 group-hover:text-rose-400 transition-colors">Manage Vocab</h2>
              <p className="text-sm text-white/50">Add new words, review your dictionary, and export data back to Google Sheets.</p>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
