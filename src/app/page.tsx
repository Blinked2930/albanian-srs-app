"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
};

interface ChartData {
  name: string;
  avgScore: number;
  wordsReviewed: number;
}

interface GrammarMetric {
  dimension_type: string;
  dimension_value: string;
  mastery_score: number;
}

interface KPIState {
  totalWords: number;
  globalMastery: number;
  activeStreak: number; 
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIState>({ totalWords: 0, globalMastery: 0, activeStreak: 0 });
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [grammarPerformance, setGrammarPerformance] = useState<GrammarMetric[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      // 1. Fetch Vocab for Top-Level KPIs
      const { data: vocabData } = await supabase.from('vocab').select('id, mastery_score, streak');
      
      let totalWords = 0;
      let globalMastery = 0;
      let maxStreak = 0;

      if (vocabData && vocabData.length > 0) {
        totalWords = vocabData.length;
        const totalMastery = vocabData.reduce((sum, v) => sum + (v.mastery_score || 0), 0);
        globalMastery = totalMastery / totalWords;
        maxStreak = Math.max(...vocabData.map(v => v.streak || 0)); 
      }

      setKpis({
        totalWords,
        globalMastery: Number(globalMastery.toFixed(2)),
        activeStreak: maxStreak
      });

      // 2. Fetch Grammar Metrics
      const { data: grammarData } = await supabase
        .from('grammar_metrics')
        .select('dimension_type, dimension_value, mastery_score')
        .order('mastery_score', { ascending: true })
        .limit(5);

      if (grammarData) {
        setGrammarPerformance(grammarData as GrammarMetric[]);
      }

      // 3. Fetch Review Logs for the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { data: logData } = await supabase
        .from('review_logs')
        .select('score, created_at')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const aggregatedChart: Record<string, { count: number; totalScore: number }> = {};
      
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayName = days[d.getDay()];
        aggregatedChart[dayName] = { count: 0, totalScore: 0 };
      }

      if (logData) {
        logData.forEach(log => {
          const d = new Date(log.created_at);
          const dayName = days[d.getDay()];
          if (aggregatedChart[dayName]) {
            aggregatedChart[dayName].count += 1;
            aggregatedChart[dayName].totalScore += log.score;
          }
        });
      }

      const finalChartData: ChartData[] = Object.keys(aggregatedChart).map(key => ({
        name: key,
        wordsReviewed: aggregatedChart[key].count,
        avgScore: aggregatedChart[key].count > 0 
          ? Number((aggregatedChart[key].totalScore / aggregatedChart[key].count).toFixed(2)) 
          : 0
      }));

      setChartData(finalChartData);

    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fafafa] flex flex-col items-center p-4 sm:p-8 relative overflow-x-hidden">
      
      {/* Background Glow & Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes floatBreathe {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-10px) scale(1.03); }
        }
        .animate-float-breathe {
          animation: floatBreathe 5s ease-in-out infinite;
        }
      `}} />
      <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] bg-gradient-to-br from-pink-100/40 via-purple-50/20 to-indigo-100/40 z-0 pointer-events-none"></div>

      {/* Expanded to max-w-5xl for desktop spreading */}
      <div className="max-w-5xl w-full z-10 relative pt-4 sm:pt-8">
        
        {/* Header */}
        <div className="text-center z-10 mb-8 sm:mb-12 flex flex-col items-center">
          <div className="animate-float-breathe inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 bg-white/80 backdrop-blur-xl rounded-[1.5rem] sm:rounded-[2rem] shadow-[0_8px_32px_rgba(255,182,193,0.3)] mb-4 text-pink-500 border-2 border-white transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:scale-110">
              <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
            </svg>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black mb-2 sm:mb-4 text-slate-700 tracking-tight transition-all">
            Dashboard
          </h1>
          <p className="text-slate-500 font-bold px-5 py-1.5 sm:px-6 sm:py-2 bg-white/60 backdrop-blur-md rounded-full inline-block border border-white/80 shadow-sm text-sm sm:text-base">
            Track your progress.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 sm:h-64 bg-white/60 backdrop-blur-xl rounded-[2.5rem] border-2 border-white shadow-sm mt-8">
             <div className="w-8 h-8 border-4 border-slate-200 border-t-pink-400 rounded-full animate-spin mb-4"></div>
             <p className="text-slate-400 font-bold">Compiling analytics...</p>
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8">
            
            {/* Top Row: KPIs and Actions (Grid based for Desktop, Stacked for Mobile) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              {/* KPI Section - Takes 7 columns on desktop, compact 3-column grid on mobile */}
              <div className="md:col-span-7 grid grid-cols-3 gap-3 sm:gap-5">
                <div className="bg-white/80 backdrop-blur-xl p-3 sm:p-6 rounded-2xl sm:rounded-[2rem] border-2 border-white shadow-sm flex flex-col items-center sm:items-start text-center sm:text-left justify-center transition-transform hover:scale-[1.02]">
                  <h3 className="text-[9px] sm:text-xs uppercase tracking-widest text-indigo-400 mb-1 sm:mb-2 font-black">Words</h3>
                  <p className="text-2xl sm:text-5xl font-black text-indigo-500">{kpis.totalWords}</p>
                </div>
                
                <div className="bg-white/80 backdrop-blur-xl p-3 sm:p-6 rounded-2xl sm:rounded-[2rem] border-2 border-white shadow-sm flex flex-col items-center sm:items-start text-center sm:text-left justify-center transition-transform hover:scale-[1.02]">
                  <h3 className="text-[9px] sm:text-xs uppercase tracking-widest text-amber-400 mb-1 sm:mb-2 font-black">Mastery</h3>
                  <p className="text-2xl sm:text-5xl font-black text-amber-500">{kpis.globalMastery}</p>
                </div>
                
                <div className="bg-white/80 backdrop-blur-xl p-3 sm:p-6 rounded-2xl sm:rounded-[2rem] border-2 border-white shadow-sm flex flex-col items-center sm:items-start text-center sm:text-left justify-center transition-transform hover:scale-[1.02]">
                  <h3 className="text-[9px] sm:text-xs uppercase tracking-widest text-rose-400 mb-1 sm:mb-2 font-black">Streak</h3>
                  <p className="text-2xl sm:text-5xl font-black text-rose-500">{kpis.activeStreak}</p>
                </div>
              </div>

              {/* Quick Actions Section - Takes 5 columns on desktop */}
              <div className="md:col-span-5 grid grid-cols-2 gap-3 sm:gap-5">
                <Link href="/drill/word" className="bg-indigo-500 hover:bg-indigo-400 text-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] flex flex-col items-center justify-center gap-2 sm:gap-3 transition-all active:scale-95 shadow-[0_8px_20px_rgba(99,102,241,0.3)]">
                   <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:w-10 sm:h-10"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3z"/><path d="M3 4h8s-.5-2-1-2H5a2 2 0 0 0-2 2z"/></svg>
                  <span className="font-black text-sm sm:text-lg">Word Drill</span>
                </Link>
                
                <Link href="/drill/sentence" className="bg-emerald-500 hover:bg-emerald-400 text-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] flex flex-col items-center justify-center gap-2 sm:gap-3 transition-all active:scale-95 shadow-[0_8px_20px_rgba(16,185,129,0.3)]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:w-10 sm:h-10"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
                  <span className="font-black text-sm sm:text-lg">Sentences</span>
                </Link>
              </div>
            </div>

            {/* Bottom Row: Chart and Grammar (Side by side on Desktop, Stacked on Mobile) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              
              {/* Chart Section */}
              <section className="bg-white/80 backdrop-blur-xl p-6 sm:p-8 rounded-[2.5rem] border-2 border-white shadow-sm flex flex-col">
                <h2 className="text-xl sm:text-2xl font-black flex items-center gap-3 text-slate-700 mb-6">
                  <div className="bg-amber-100 p-2 sm:p-3 rounded-xl text-amber-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-6 sm:h-6"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  </div>
                  Accuracy Trend
                </h2>
                <div className="h-[200px] sm:h-[250px] w-full mt-auto">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorMastery" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} tick={{fontWeight: 'bold', fontSize: 10}} />
                      <YAxis stroke="#94a3b8" axisLine={false} tickLine={false} domain={[0, 1]} tick={{fontWeight: 'bold', fontSize: 10}} />
                      <Tooltip 
                        formatter={(value: unknown) => {
                          const num = typeof value === "number" ? value : 0;
                          return [`${num.toFixed(2)}`, "Avg score"];
                        }}
                        contentStyle={{ backgroundColor: '#ffffff', border: '2px solid #f1f5f9', borderRadius: '16px', color: '#334155', fontWeight: 'bold' }}
                        itemStyle={{ color: '#f59e0b', fontWeight: '900' }} 
                      />
                      <Area type="monotone" dataKey="avgScore" stroke="#f59e0b" strokeWidth={4} fillOpacity={1} fill="url(#colorMastery)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* Grammar Weaknesses Section */}
              <section className="bg-white/80 backdrop-blur-xl p-6 sm:p-8 rounded-[2.5rem] border-2 border-white shadow-sm flex flex-col">
                <h2 className="text-xl sm:text-2xl font-black flex items-center gap-3 text-slate-700 mb-6">
                  <div className="bg-rose-100 p-2 sm:p-3 rounded-xl text-rose-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-6 sm:h-6"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3z"/><path d="M3 4h8s-.5-2-1-2H5a2 2 0 0 0-2 2z"/></svg>
                  </div>
                  Grammar Weaknesses
                </h2>
                
                {grammarPerformance.length === 0 ? (
                  <div className="text-center py-4 sm:py-8 text-slate-400 font-bold text-sm sm:text-base mt-auto">
                    Complete drills to generate insights.
                  </div>
                ) : (
                  <div className="space-y-5 sm:space-y-6 mt-auto">
                    {grammarPerformance.map((grammar, idx) => (
                      <div key={idx} className="flex flex-col gap-1.5 sm:gap-2">
                        <div className="flex justify-between text-sm sm:text-base">
                          <span className="font-black text-slate-700 capitalize">
                            {(() => {
                              const val = grammar.dimension_value.replace(/_/g, ' ');
                              const typeStr = grammar.dimension_type ? grammar.dimension_type.split('_')[0] : '';
                              if (['Plural', 'Singular', 'Definite', 'Indefinite', 'Masculine', 'Feminine'].includes(grammar.dimension_value)) {
                                return `${typeStr} ${val}`;
                              }
                              return val;
                            })()}
                          </span>
                          <span className="text-slate-400 font-bold">{Math.round(grammar.mastery_score * 100)}%</span>
                        </div>
                        <div className="h-3 sm:h-4 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ${
                              grammar.mastery_score < 0.4 ? 'bg-rose-400' : 
                              grammar.mastery_score < 0.8 ? 'bg-amber-400' : 
                              'bg-emerald-400'
                            }`} 
                            style={{ width: `${Math.max(5, grammar.mastery_score * 100)}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

            </div>
          </div>
        )}
      </div>
    </main>
  );
}