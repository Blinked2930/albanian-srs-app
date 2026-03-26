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

export default function Dashboard() {
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
      // 1. Fetch Vocab for Top-Level KPIs (Corrected Syntax)
      const { data: vocabData } = await supabase.from('vocab').select('id, mastery_score, streak');
      
      let totalWords = 0;
      let globalMastery = 0;
      let maxStreak = 0;

      if (vocabData && vocabData.length > 0) {
        totalWords = vocabData.length;
        const totalMastery = vocabData.reduce((sum, v) => sum + (v.mastery_score || 0), 0);
        globalMastery = totalMastery / totalWords;
        // Using the highest individual word streak as a proxy for active momentum
        maxStreak = Math.max(...vocabData.map(v => v.streak || 0)); 
      }

      setKpis({
        totalWords,
        globalMastery: Number(globalMastery.toFixed(2)),
        activeStreak: maxStreak
      });

      // 2. Fetch Grammar Metrics (Sort by lowest mastery to highlight weaknesses)
      const { data: grammarData } = await supabase
        .from('grammar_metrics')
        .select('dimension_type, dimension_value, mastery_score')
        .order('mastery_score', { ascending: true })
        .limit(5);

      if (grammarData) {
        setGrammarPerformance(grammarData as GrammarMetric[]);
      }

      // 3. Fetch Review Logs for the last 7 days to build the chart
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { data: logData } = await supabase
        .from('review_logs')
        .select('score, created_at')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      // Process logs into daily buckets for Recharts
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const aggregatedChart: Record<string, { count: number; totalScore: number }> = {};
      
      // Initialize the last 7 days with empty data to ensure the chart always looks full
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
    <main className="min-h-screen p-6 pt-12 pb-24 relative overflow-x-hidden">
      <div className="max-w-5xl mx-auto z-10 relative">
        <header className="flex justify-between items-end mb-10 pl-2">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-700">Progress Dashboard</h1>
            <p className="text-slate-400 font-bold mt-1">Visualize your language acquisition.</p>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 cutesy-glass rounded-[2rem] border-2 border-white/80 shadow-sm">
             <div className="w-8 h-8 border-4 border-slate-200 border-t-pink-400 rounded-full animate-spin mb-4"></div>
             <p className="text-slate-400 font-bold">Compiling analytics...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Top Level KPIs */}
              <div className="cutesy-glass p-8 rounded-[2rem] border-2 border-white/80 shadow-md flex flex-col justify-center relative overflow-hidden group hover:scale-[1.02] transition-transform">
                <h3 className="text-xs uppercase tracking-widest text-slate-400 mb-2 font-bold">Total Words Learned</h3>
                <p className="text-6xl font-black text-indigo-500 drop-shadow-sm">{kpis.totalWords}</p>
              </div>
              
              <div className="cutesy-glass p-8 rounded-[2rem] border-2 border-white/80 shadow-md flex flex-col justify-center group hover:scale-[1.02] transition-transform">
                <h3 className="text-xs uppercase tracking-widest text-slate-400 mb-2 font-bold">Global Mastery Score</h3>
                <p className="text-6xl font-black text-amber-500 drop-shadow-sm">{kpis.globalMastery}</p>
                <p className="text-sm text-slate-400 mt-2 font-bold">Target: 1.0</p>
              </div>
              
              <div className="cutesy-glass p-8 rounded-[2rem] border-2 border-white/80 shadow-md flex flex-col justify-center group hover:scale-[1.02] transition-transform">
                <h3 className="text-xs uppercase tracking-widest text-slate-400 mb-2 font-bold">Max Word Streak</h3>
                <p className="text-6xl font-black text-rose-400 drop-shadow-sm">{kpis.activeStreak}<span className="text-2xl text-slate-300 ml-2">Days</span></p>
                <p className="text-sm text-rose-400 mt-2 font-bold">Maintain the discipline.</p>
              </div>
            </div>

            {/* Chart Section */}
            <section className="cutesy-glass p-8 rounded-[2.5rem] border-2 border-white/80 shadow-md mb-8">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black flex items-center gap-3 text-slate-700">
                  <div className="bg-amber-100 p-2 rounded-xl text-amber-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  </div>
                  7-Day Review Accuracy
                </h2>
              </div>
              <p className="text-sm font-bold text-slate-400 mb-6">
                This chart shows the average review score of your drills (0.0 to 1.0). Your global mastery score is calculated separately from your stored `mastery_score` values.
              </p>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorMastery" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} tick={{fontWeight: 'bold', fontSize: 12}} />
                    <YAxis stroke="#94a3b8" axisLine={false} tickLine={false} dx={-20} domain={[0, 1]} tick={{fontWeight: 'bold', fontSize: 12}} />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(2)}`, "Avg score"]}
                      contentStyle={{ backgroundColor: '#ffffff', border: '2px solid #f1f5f9', borderRadius: '16px', color: '#334155', fontWeight: 'bold' }}
                      itemStyle={{ color: '#f59e0b', fontWeight: '900' }} 
                    />
                    <Area type="monotone" dataKey="avgScore" stroke="#f59e0b" strokeWidth={5} fillOpacity={1} fill="url(#colorMastery)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Grammar Weaknesses (SRS Prioritization) */}
            <section className="cutesy-glass p-8 rounded-[2.5rem] border-2 border-white/80 shadow-md relative overflow-hidden">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-8 gap-4">
                <h2 className="text-2xl font-black flex items-center gap-3 text-slate-700">
                  <div className="bg-rose-100 p-2 rounded-xl text-rose-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3z"/><path d="M3 4h8s-.5-2-1-2H5a2 2 0 0 0-2 2z"/></svg>
                  </div>
                  Grammar Blind Spots
                </h2>
                {grammarPerformance.length > 0 && (
                  <Link 
                    href="/drill/word" 
                    className="bg-rose-500 hover:bg-rose-400 text-white font-black py-3 px-5 rounded-[1.5rem] transition-all shadow-md active:scale-95 text-sm w-fit flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="12" x2="12" y1="18" y2="12"/><line x1="9" x2="15" y1="15" y2="15"/></svg>
                    Drill Weaknesses
                  </Link>
                )}
              </div>
              
              {grammarPerformance.length === 0 ? (
                <div className="text-center py-8 text-slate-400 font-bold text-sm">
                  Complete more grammar drills to generate targeted insights.
                </div>
              ) : (
                <div className="space-y-6">
                  {grammarPerformance.map((grammar, idx) => (
                    <div key={idx} className="flex flex-col gap-2">
                      <div className="flex justify-between text-base">
                        <span className="font-bold text-slate-700 capitalize mb-1">
                          {(() => {
                            const val = grammar.dimension_value.replace(/_/g, ' ');
                            const typeStr = grammar.dimension_type ? grammar.dimension_type.split('_')[0] : '';
                            if (['Plural', 'Singular', 'Definite', 'Indefinite', 'Masculine', 'Feminine'].includes(grammar.dimension_value)) {
                              return `${typeStr} ${val}`;
                            }
                            return val;
                          })()}
                        </span>
                        <span className="text-slate-400 font-black">{Math.round(grammar.mastery_score * 100)}% Mastery</span>
                      </div>
                      <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200">
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
          </>
        )}
      </div>
    </main>
  );
}