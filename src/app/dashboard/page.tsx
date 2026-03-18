"use client";

import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Mock data representing the user's Mastery Score over the last 7 days
const mockPerformanceData = [
  { name: 'Mon', mastery: 0.12, wordsReviewed: 20 },
  { name: 'Tue', mastery: 0.25, wordsReviewed: 45 },
  { name: 'Wed', mastery: 0.38, wordsReviewed: 60 },
  { name: 'Thu', mastery: 0.42, wordsReviewed: 35 },
  { name: 'Fri', mastery: 0.55, wordsReviewed: 50 },
  { name: 'Sat', mastery: 0.68, wordsReviewed: 80 },
  { name: 'Sun', mastery: 0.82, wordsReviewed: 90 },
];

const mockGrammarPerformance = [
  { item: "Nominative Case", score: 0.95 },
  { item: "Accusative Case", score: 0.80 },
  { item: "Present Tense", score: 0.70 },
  { item: "Optative Mood", score: 0.15 },
  { item: "Aorist Tense", score: 0.30 },
];

export default function Dashboard() {
  return (
    <main className="min-h-screen bg-[#0F172A] text-white p-6 pb-24 relative overflow-x-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-amber-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-5xl mx-auto z-10 relative">
        <header className="flex justify-between items-end mb-10">
          <div>
            <Link href="/" className="text-amber-400 hover:text-amber-300 text-sm font-medium transition-colors inline-flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              Back to Hub
            </Link>
            <h1 className="text-4xl font-black tracking-tight">Progress Dashboard</h1>
            <p className="text-white/50 mt-1">Visualize your language acquisition.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Top Level KPIs */}
          <div className="glassmorphism p-6 rounded-2xl border border-white/10 flex flex-col justify-center">
            <h3 className="text-sm uppercase tracking-widest text-white/50 mb-2 font-semibold">Total Words Learned</h3>
            <p className="text-5xl font-black text-white">889</p>
            <p className="text-sm text-emerald-400 mt-2 font-medium">↑ 124 this week</p>
          </div>
          
          <div className="glassmorphism p-6 rounded-2xl border border-white/10 flex flex-col justify-center">
            <h3 className="text-sm uppercase tracking-widest text-white/50 mb-2 font-semibold">Global Mastery Score</h3>
            <p className="text-5xl font-black text-amber-400">0.82</p>
            <p className="text-sm text-white/50 mt-2 font-medium">Target: 1.0</p>
          </div>
          
          <div className="glassmorphism p-6 rounded-2xl border border-white/10 flex flex-col justify-center">
            <h3 className="text-sm uppercase tracking-widest text-white/50 mb-2 font-semibold">Current Streak</h3>
            <p className="text-5xl font-black text-rose-400">14<span className="text-2xl text-white/50 ml-1">Days</span></p>
            <p className="text-sm text-rose-400/80 mt-2 font-medium">Keep it going!</p>
          </div>
        </div>

        {/* Chart Section */}
        <section className="glassmorphism p-6 rounded-2xl border border-white/10 mb-8">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" className="text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Mastery Trajectory
          </h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockPerformanceData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMastery" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#fbbf24" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff50" axisLine={false} tickLine={false} dy={10} />
                <YAxis stroke="#ffffff50" axisLine={false} tickLine={false} dx={-10} domain={[0, 1]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fbbf24' }} 
                />
                <Area type="monotone" dataKey="mastery" stroke="#fbbf24" strokeWidth={3} fillOpacity={1} fill="url(#colorMastery)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Grammar Weaknesses (SRS Prioritization) */}
        <section className="glassmorphism p-6 rounded-2xl border border-white/10">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" className="text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3z"/><path d="M3 4h8s-.5-2-1-2H5a2 2 0 0 0-2 2z"/></svg>
            Grammar Mastery (SRS Priorities)
          </h2>
          
          <div className="space-y-4">
            {mockGrammarPerformance.map((grammar, idx) => (
              <div key={idx} className="flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{grammar.item}</span>
                  <span className="text-white/50">{Math.round(grammar.score * 100)}% Mastery</span>
                </div>
                <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${
                      grammar.score < 0.4 ? 'bg-rose-500' : 
                      grammar.score < 0.8 ? 'bg-amber-500' : 
                      'bg-emerald-500'
                    }`} 
                    style={{ width: `${grammar.score * 100}%` }}
                  ></div>
                </div>
                {grammar.score < 0.5 && (
                  <p className="text-xs text-rose-400">High Priority in SRS Drills</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
