"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { supabase, isDemoMode } from "@/lib/supabaseClient";

interface ChartData { name: string; avgScore: number; wordsReviewed: number; }
interface TimeLogData { name: string; immersion: number; drills: number; total: number; }
interface HeatmapDay { date: string; active: boolean; intensity: number; }
interface GrammarMetric { dimension_type: string; dimension_value: string; mastery_score: number; }
interface KPIState { totalWords: number; globalMastery: number; activeStreak: number; dueToday: number; addedThisWeek: number; }
interface CramGroup { id: string; name: string; vocab_ids: string[]; }

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KPIState>({ totalWords: 0, globalMastery: 0, activeStreak: 0, dueToday: 0, addedThisWeek: 0 });
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [grammarPerformance, setGrammarPerformance] = useState<GrammarMetric[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  // --- NEW: Time Tracking States ---
  const [timeChartData, setTimeChartData] = useState<TimeLogData[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapDay[]>([]);
  const [totalTimeThisWeek, setTotalTimeThisWeek] = useState(0);

  // --- Session Persistence States ---
  const [activeCramSession, setActiveCramSession] = useState(false);
  const [activeWordSession, setActiveWordSession] = useState(false);
  const [activeSentenceSession, setActiveSentenceSession] = useState(false);

  // --- Navigation Loading State ---
  const [isNavigatingToCram, setIsNavigatingToCram] = useState(false);

  // --- Cram Mode & UI State ---
  const [allVocab, setAllVocab] = useState<any[]>([]);
  const [isCramModalOpen, setIsCramModalOpen] = useState(false);
  const [cramSearch, setCramSearch] = useState("");
  const [cramSelectedIds, setCramSelectedIds] = useState<string[]>([]);
  const [cramGroups, setCramGroups] = useState<CramGroup[]>([]);
  
  // Custom Modal & Toast State
  const [isNamingGroup, setIsNamingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  
  // Delete Confirmation State
  const [groupToDelete, setGroupToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingGroup, setIsDeletingGroup] = useState(false);

  const [toast, setToast] = useState<{ message: string, emoji: string, type: 'error' | 'info' } | null>(null);

  // Ghost Mode Modal State
  const [showGhostModal, setShowGhostModal] = useState(false);

  useEffect(() => { 
    fetchDashboardData(); 
    checkActiveSessions();
    setIsNavigatingToCram(false);
  }, []);

  useEffect(() => {
    sessionStorage.setItem('cram_builder_ids', JSON.stringify(cramSelectedIds));
  }, [cramSelectedIds]);

  const checkActiveSessions = () => {
    const cramState = sessionStorage.getItem('cram_drill_state');
    if (cramState) {
      try {
        const parsed = JSON.parse(cramState);
        if (parsed.phase === 'drill') {
          const isExplicitlyPaused = sessionStorage.getItem('cram_explicitly_paused') === 'true';
          if (!isExplicitlyPaused) {
            router.push('/drill/cram');
            return; 
          }
          setActiveCramSession(true);
        }
      } catch (e) {}
    }

    const wordState = sessionStorage.getItem('word_drill_state');
    if (wordState) {
      try {
        const parsed = JSON.parse(wordState);
        if (parsed.phase === 'drill') setActiveWordSession(true);
      } catch (e) {}
    }

    const sentenceState = sessionStorage.getItem('sentence_drill_state');
    if (sentenceState) {
      try {
        const parsed = JSON.parse(sentenceState);
        if (parsed.phase === 'drill') setActiveSentenceSession(true);
      } catch (e) {}
    }

    const savedBuilderIds = sessionStorage.getItem('cram_builder_ids');
    if (savedBuilderIds) {
      try {
        setCramSelectedIds(JSON.parse(savedBuilderIds));
      } catch (e) {}
    }
  };

  const showToast = (message: string, emoji: string = "⚠️", type: 'error' | 'info' = 'info') => {
    setToast({ message, emoji, type });
    setTimeout(() => setToast(null), 3000); 
  };

  async function fetchDashboardData() {
    setLoading(true);

    try {
      // 1. Fetch Vocab & Grammer
      const { data: vocabData } = await supabase.from('vocab').select('id, albanian, english, type, mastery_score, streak, next_review, created_at');
      if (vocabData) processVocab(vocabData);

      const { data: groupData } = await supabase.from('cram_groups').select('*').order('created_at', { ascending: false });
      if (groupData) setCramGroups(groupData as CramGroup[]);

      const { data: grammarData } = await supabase.from('grammar_metrics').select('dimension_type, dimension_value, mastery_score').order('mastery_score', { ascending: true }).limit(5);
      if (grammarData) setGrammarPerformance(grammarData as GrammarMetric[]);

      // 2. Setup Time Horizons
      const today = new Date();
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(today.getDate() - 6);
      const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(today.getDate() - 29);
      
      // 3. Fetch Activity Logs (For Heatmap & Time Chart)
      const { data: activityLogs } = await supabase.from('activity_logs')
        .select('activity_type, duration_seconds, created_at')
        .gte('created_at', thirtyDaysAgo.toISOString());

      // --- Build Time Chart (Last 7 Days) ---
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const aggregatedTime: Record<string, { immersion: number; drills: number }> = {};
      
      // Initialize last 7 days to 0
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(today.getDate() - i);
        aggregatedTime[days[d.getDay()]] = { immersion: 0, drills: 0 };
      }

      let totalWeekMinutes = 0;

      // --- Build Heatmap (Last 30 Days) ---
      const aggregatedHeatmap: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(today.getDate() - i);
        aggregatedHeatmap[d.toISOString().split('T')[0]] = 0;
      }

      if (activityLogs) {
        activityLogs.forEach((log: any) => {
          const logDate = new Date(log.created_at);
          const dateString = logDate.toISOString().split('T')[0];
          const dayName = days[logDate.getDay()];
          const durationMinutes = log.duration_seconds / 60;

          // Add to Heatmap
          if (aggregatedHeatmap[dateString] !== undefined) {
             aggregatedHeatmap[dateString] += durationMinutes;
          }

          // Add to Time Chart (only if within last 7 days)
          if (logDate >= sevenDaysAgo && aggregatedTime[dayName]) {
            if (log.activity_type === 'immersion') {
               aggregatedTime[dayName].immersion += durationMinutes;
            } else {
               aggregatedTime[dayName].drills += durationMinutes;
            }
            totalWeekMinutes += durationMinutes;
          }
        });
      }

      setTotalTimeThisWeek(Math.round(totalWeekMinutes));
      
      const finalTimeChartData: TimeLogData[] = Object.keys(aggregatedTime).map(key => ({
        name: key, 
        immersion: Number(aggregatedTime[key].immersion.toFixed(1)),
        drills: Number(aggregatedTime[key].drills.toFixed(1)),
        total: Number((aggregatedTime[key].immersion + aggregatedTime[key].drills).toFixed(1))
      }));
      setTimeChartData(finalTimeChartData);

      const finalHeatmapData: HeatmapDay[] = Object.keys(aggregatedHeatmap).map(key => ({
        date: key,
        active: aggregatedHeatmap[key] > 0,
        intensity: Math.min(Math.ceil(aggregatedHeatmap[key] / 15), 4) // Max intensity after 60 mins
      }));
      setHeatmapData(finalHeatmapData);


      // 4. Fetch Review Logs (For Accuracy Trend)
      const { data: logData } = await supabase.from('review_logs').select('vocab_id, score, created_at').gte('created_at', sevenDaysAgo.toISOString()).order('created_at', { ascending: true });
      const aggregatedAccuracy: Record<string, { count: number; totalScore: number }> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(today.getDate() - i);
        aggregatedAccuracy[days[d.getDay()]] = { count: 0, totalScore: 0 };
      }
      
      if (logData) {
        setRecentLogs(logData);
        logData.forEach((log: any) => {
          const dayName = days[new Date(log.created_at).getDay()];
          if (aggregatedAccuracy[dayName]) { aggregatedAccuracy[dayName].count += 1; aggregatedAccuracy[dayName].totalScore += log.score; }
        });
      }
      
      const finalAccuracyChartData: ChartData[] = Object.keys(aggregatedAccuracy).map(key => ({
        name: key, wordsReviewed: aggregatedAccuracy[key].count,
        avgScore: aggregatedAccuracy[key].count > 0 ? Number((aggregatedAccuracy[key].totalScore / aggregatedAccuracy[key].count).toFixed(2)) : 0
      }));
      setChartData(finalAccuracyChartData);

    } catch (err) { console.error("Error fetching dashboard data:", err); } 
    finally { setLoading(false); }
  }

  function processVocab(vocabData: any[]) {
    setAllVocab(vocabData);
    const totalWords = vocabData.length;
    const totalMastery = vocabData.reduce((sum, v) => sum + (Number(v.mastery_score) || 0), 0);
    const globalMastery = totalWords > 0 ? totalMastery / totalWords : 0;
    const maxStreak = totalWords > 0 ? Math.max(...vocabData.map(v => v.streak || 0)) : 0;
    
    const dueToday = vocabData.filter(v => !v.next_review || new Date(v.next_review) <= new Date()).length;
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const addedThisWeek = vocabData.filter(v => new Date(v.created_at) >= oneWeekAgo).length;

    setKpis({ 
      totalWords, 
      globalMastery: Number(globalMastery.toFixed(2)), 
      activeStreak: maxStreak,
      dueToday,
      addedThisWeek
    });
  }

  const applyCramPreset = (type: 'today' | 'yesterday' | 'week' | 'struggling' | 'failed') => {
    let filteredIds: string[] = [];
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 7);

    if (type === 'today') {
      filteredIds = allVocab.filter(v => v.created_at && new Date(v.created_at) >= startOfToday).map(v => v.id);
      if (filteredIds.length === 0) showToast("No new words added today yet.", "⏱️");
      
    } else if (type === 'yesterday') {
      filteredIds = allVocab.filter(v => {
        if (!v.created_at) return false;
        const createdDate = new Date(v.created_at);
        return createdDate >= startOfYesterday && createdDate < startOfToday;
      }).map(v => v.id);
      if (filteredIds.length === 0) showToast("No words added yesterday.", "⏳");

    } else if (type === 'week') {
      filteredIds = allVocab.filter(v => v.created_at && new Date(v.created_at) >= startOfWeek).map(v => v.id);
      if (filteredIds.length === 0) showToast("No new words added this week.", "📅");
      
    } else if (type === 'struggling') {
      filteredIds = allVocab.filter(v => Number(v.mastery_score || 0) < 0.5).map(v => v.id);
      if (filteredIds.length === 0) showToast("No weak words found! You're doing great.", "💪");
      
    } else if (type === 'failed') {
      const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
      const latestLogs: Record<string, any> = {};
      
      recentLogs.forEach(log => {
        const logDate = new Date(log.created_at);
        if (!latestLogs[log.vocab_id] || logDate > new Date(latestLogs[log.vocab_id].created_at)) {
          latestLogs[log.vocab_id] = log;
        }
      });

      filteredIds = Object.values(latestLogs)
        .filter(log => log.score < 1.0 && new Date(log.created_at) >= threeDaysAgo)
        .map(log => log.vocab_id)
        .filter(id => allVocab.some(v => v.id === id)); 

      if (filteredIds.length === 0) showToast("No recent failures found! Great job.", "🎉");
    }

    if (filteredIds.length > 0) {
      setCramSelectedIds(prev => {
        const hasAllSelected = filteredIds.every(id => prev.includes(id));
        if (hasAllSelected) {
          return prev.filter(id => !filteredIds.includes(id));
        } else {
          return Array.from(new Set([...prev, ...filteredIds]));
        }
      });
    }
  };

  const handleSaveGroup = async () => {
    if (isDemoMode) {
      showToast("Saving custom groups is disabled for guests.", "👻");
      setIsNamingGroup(false);
      return;
    }
    
    if (!newGroupName.trim() || cramSelectedIds.length === 0) return;
    setIsSavingGroup(true);
    
    const newGroup = { name: newGroupName.trim(), vocab_ids: cramSelectedIds };
    const { data, error } = await supabase.from('cram_groups').insert([newGroup] as any).select().single() as any;
    
    if (data) {
      setCramGroups(prev => [data, ...prev]);
      setNewGroupName("");
      setIsNamingGroup(false);
      showToast(`Saved group "${data.name}"`, "📁");
    }
    
    setIsSavingGroup(false);
  };

  const promptDeleteGroup = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDemoMode) {
      showToast("Deleting groups is disabled for guests.", "👻");
      return;
    }
    setGroupToDelete({ id, name });
  };

  const confirmDeleteGroup = async () => {
    if (!groupToDelete) return;
    setIsDeletingGroup(true);
    
    await supabase.from('cram_groups').delete().eq('id', groupToDelete.id);
    setCramGroups(prev => prev.filter(g => g.id !== groupToDelete.id));
    showToast("Group deleted", "🗑️");
    
    setIsDeletingGroup(false);
    setGroupToDelete(null);
  };

  const loadGroup = (ids: string[]) => {
    setCramSelectedIds(prev => {
      const hasAllSelected = ids.every(id => prev.includes(id));
      if (hasAllSelected) {
        return prev.filter(id => !ids.includes(id));
      } else {
        return Array.from(new Set([...prev, ...ids]));
      }
    });
  };

  const startCramming = () => {
    if (cramSelectedIds.length === 0) return;
    setIsNavigatingToCram(true); 
    sessionStorage.setItem('cram_vocab_ids', JSON.stringify(cramSelectedIds));
    sessionStorage.removeItem('cram_drill_state'); 
    sessionStorage.removeItem('cram_explicitly_paused');
    router.push('/drill/cram');
  };

  const closeCramModal = () => {
    setIsCramModalOpen(false); 
    setCramSearch(""); 
    setNewGroupName(""); 
    setIsNamingGroup(false);
    setGroupToDelete(null);
  };

  return (
    <main className="min-h-screen bg-[#fafafa] flex flex-col items-center p-4 sm:p-8 relative overflow-x-hidden">
      <style dangerouslySetInnerHTML={{__html: `@keyframes floatBreathe { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-10px) scale(1.03); } } .animate-float-breathe { animation: floatBreathe 5s ease-in-out infinite; }`}} />
      <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] bg-gradient-to-br from-pink-100/40 via-purple-50/20 to-indigo-100/40 z-0 pointer-events-none"></div>

      {isDemoMode && (
        <div className="fixed top-4 left-4 z-[400] bg-slate-800 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg tracking-widest uppercase border-2 border-slate-600 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          Ghost Mode: Read Only
        </div>
      )}

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] animate-in slide-in-from-top-10 fade-in duration-300">
          <div className="bg-slate-800/95 backdrop-blur-xl border-2 border-slate-700 shadow-2xl px-6 py-3.5 rounded-full flex items-center gap-3">
            <span className="text-xl">{toast.emoji}</span>
            <span className="text-white font-bold text-sm tracking-wide">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-5xl w-full z-10 relative pt-4 sm:pt-8">
        <div className="text-center z-10 mb-8 sm:mb-12 flex flex-col items-center">
          <div className="animate-float-breathe inline-flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 bg-white/80 backdrop-blur-xl rounded-[1.5rem] sm:rounded-[2rem] shadow-[0_8px_32px_rgba(255,182,193,0.3)] mb-4 text-pink-500 border-2 border-white transition-all">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:scale-110"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black mb-2 sm:mb-4 text-slate-700 tracking-tight transition-all">Dashboard</h1>
          <p className="text-slate-500 font-bold px-5 py-1.5 sm:px-6 sm:py-2 bg-white/60 backdrop-blur-md rounded-full inline-block border border-white/80 shadow-sm text-sm sm:text-base">Track your progress.</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 sm:h-64 bg-white/60 backdrop-blur-xl rounded-[2.5rem] border-2 border-white shadow-sm mt-8">
             <div className="w-8 h-8 border-4 border-slate-200 border-t-pink-400 rounded-full animate-spin mb-4"></div>
             <p className="text-slate-400 font-bold">Compiling analytics...</p>
          </div>
        ) : (
          <div className="space-y-6 sm:space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              
              <div className="md:col-span-7 grid grid-cols-2 gap-3 sm:gap-5">
                <div className="bg-white/80 backdrop-blur-xl p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border-2 border-white shadow-sm flex flex-col items-center justify-center transition-transform hover:scale-[1.02]">
                  <h3 className="text-[10px] sm:text-xs uppercase tracking-widest text-indigo-400 mb-1 font-black">Total Words</h3>
                  <p className="text-4xl sm:text-5xl font-black text-indigo-500 my-2">{kpis.totalWords}</p>
                  <p className="text-xs font-bold text-slate-400">+{kpis.addedThisWeek} added this week</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border-2 border-white shadow-sm flex flex-col items-center justify-center transition-transform hover:scale-[1.02]">
                  <h3 className="text-[10px] sm:text-xs uppercase tracking-widest text-amber-400 mb-1 font-black">Avg Mastery</h3>
                  <p className="text-4xl sm:text-5xl font-black text-amber-500 my-2">{Math.round(kpis.globalMastery * 100)}%</p>
                  <p className="text-xs font-bold text-slate-400">Overall accuracy score</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border-2 border-white shadow-sm flex flex-col items-center justify-center transition-transform hover:scale-[1.02]">
                  <h3 className="text-[10px] sm:text-xs uppercase tracking-widest text-emerald-400 mb-1 font-black">Due Today</h3>
                  <p className="text-4xl sm:text-5xl font-black text-emerald-500 my-2">{kpis.dueToday}</p>
                  <p className="text-xs font-bold text-slate-400">Pending flashcards</p>
                </div>
                <div className="bg-white/80 backdrop-blur-xl p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] border-2 border-white shadow-sm flex flex-col items-center justify-center transition-transform hover:scale-[1.02] relative overflow-hidden">
                  <h3 className="text-[10px] sm:text-xs uppercase tracking-widest text-emerald-400 mb-2 font-black">Consistency</h3>
                  
                  {/* NEW: 30 Day Heatmap Grid */}
                  <div className="w-full flex justify-center px-2">
                     <div className="grid grid-flow-col grid-rows-3 gap-1 h-[42px] sm:h-[48px] w-full max-w-[150px]">
                        {heatmapData.map((day, i) => {
                           const getIntensityClass = (lvl: number) => {
                             if (lvl === 0) return 'bg-slate-100 border border-slate-200/50';
                             if (lvl === 1) return 'bg-emerald-200';
                             if (lvl === 2) return 'bg-emerald-300';
                             if (lvl === 3) return 'bg-emerald-400';
                             return 'bg-emerald-500';
                           };
                           return (
                             <div 
                               key={i} 
                               title={day.date}
                               className={`w-full h-full rounded-sm sm:rounded-[3px] transition-colors ${getIntensityClass(day.intensity)}`}
                             ></div>
                           );
                        })}
                     </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">Last 30 Days</p>
                </div>
              </div>

              <div className="md:col-span-5 flex flex-col gap-3 sm:gap-5">
                {activeCramSession ? (
                  <div className="grid grid-cols-3 gap-3 sm:gap-5 w-full">
                    <button onClick={() => { setIsNavigatingToCram(true); sessionStorage.removeItem('cram_explicitly_paused'); router.push('/drill/cram'); }} className="col-span-2 bg-rose-500 hover:bg-rose-400 text-white p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] flex flex-col items-center justify-center gap-1 sm:gap-2 transition-all active:scale-95 shadow-[0_8px_20px_rgba(244,63,94,0.3)] border-2 border-rose-400/50 relative overflow-hidden">
                      <div className="absolute top-0 inset-x-0 bg-white/20 text-white py-0.5 text-center text-[10px] font-black tracking-widest uppercase">Active Session</div>
                      {isNavigatingToCram ? (
                        <>
                          <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mt-2"></div>
                          <span className="font-black text-sm sm:text-base tracking-wide">Loading...</span>
                        </>
                      ) : (
                        <>
                          <span className="text-2xl sm:text-3xl mt-2">🔥</span>
                          <span className="font-black text-base sm:text-xl tracking-wide">Resume Cram</span>
                        </>
                      )}
                    </button>
                    <button onClick={() => { sessionStorage.removeItem('cram_drill_state'); sessionStorage.removeItem('cram_explicitly_paused'); setActiveCramSession(false); setIsCramModalOpen(true); }} className="col-span-1 bg-white/60 backdrop-blur-md hover:bg-white text-rose-500 p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] flex flex-col items-center justify-center gap-1 transition-all active:scale-95 shadow-sm border-2 border-rose-200 font-black">
                      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mb-0.5 sm:mb-1"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                      <span className="text-[10px] sm:text-xs tracking-wider uppercase">Restart</span>
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setIsCramModalOpen(true)} className="w-full bg-rose-500 hover:bg-rose-400 text-white p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] flex items-center justify-center gap-3 transition-all active:scale-95 shadow-[0_8px_20px_rgba(244,63,94,0.3)] border-2 border-rose-400/50">
                    <span className="text-2xl sm:text-3xl">🔥</span>
                    <span className="font-black text-base sm:text-xl tracking-wide">Cram Mode</span>
                  </button>
                )}

                <div className="grid grid-cols-2 gap-3 sm:gap-5 w-full">
                  <Link href="/drill/word" className="relative overflow-hidden bg-indigo-500 hover:bg-indigo-400 text-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] flex flex-col items-center justify-center gap-2 sm:gap-3 transition-all active:scale-95 shadow-[0_8px_20px_rgba(99,102,241,0.3)] border-2 border-indigo-400/50">
                    {activeWordSession && <div className="absolute top-0 inset-x-0 bg-white/20 py-0.5 text-center text-[9px] font-black tracking-widest uppercase">Resume</div>}
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`sm:w-10 sm:h-10 ${activeWordSession ? 'mt-2' : ''}`}><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3z"/><path d="M3 4h8s-.5-2-1-2H5a2 2 0 0 0-2 2z"/></svg>
                    <span className="font-black text-sm sm:text-base">Word Drill</span>
                  </Link>
                  <Link href="/drill/sentence" className="relative overflow-hidden bg-emerald-500 hover:bg-emerald-400 text-white p-4 sm:p-6 rounded-2xl sm:rounded-[2rem] flex flex-col items-center justify-center gap-2 sm:gap-3 transition-all active:scale-95 shadow-[0_8px_20px_rgba(16,185,129,0.3)] border-2 border-emerald-400/50">
                    {activeSentenceSession && <div className="absolute top-0 inset-x-0 bg-white/20 py-0.5 text-center text-[9px] font-black tracking-widest uppercase">Resume</div>}
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`sm:w-10 sm:h-10 ${activeSentenceSession ? 'mt-2' : ''}`}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>
                    <span className="font-black text-sm sm:text-base">Sentences</span>
                  </Link>

                  <Link href="/immersion" className="col-span-2 relative overflow-hidden bg-fuchsia-500 hover:bg-fuchsia-400 text-white p-4 sm:p-5 rounded-2xl sm:rounded-[2rem] flex items-center justify-center gap-3 transition-all active:scale-95 shadow-[0_8px_20px_rgba(217,70,239,0.3)] border-2 border-fuchsia-400/50">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:w-8 sm:h-8"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    <span className="font-black text-base sm:text-lg">Immersion Stories</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* --- NEW: Analytics Row --- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8 pb-6">
              
              {/* 1. Time Block Chart (Replaces Accuracy Trend) */}
              <section className="bg-white/80 backdrop-blur-xl p-6 sm:p-8 rounded-[2.5rem] border-2 border-white shadow-sm flex flex-col order-1 lg:order-none">
                <div className="flex justify-between items-start mb-6">
                  <h2 className="text-xl sm:text-2xl font-black flex items-center gap-3 text-slate-700">
                    <div className="bg-sky-100 p-2 sm:p-3 rounded-xl text-sky-500"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-6 sm:h-6"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
                    Time Block
                  </h2>
                  <div className="text-right">
                    <p className="text-xl sm:text-2xl font-black text-sky-500">{Math.floor(totalTimeThisWeek / 60)}<span className="text-sm text-slate-400 ml-1 font-bold">hrs</span> {totalTimeThisWeek % 60}<span className="text-sm text-slate-400 ml-1 font-bold">m</span></p>
                    <p className="text-[10px] sm:text-xs uppercase tracking-widest font-bold text-slate-400">This Week</p>
                  </div>
                </div>

                <div className="h-[200px] sm:h-[250px] w-full mt-auto">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} tick={{fontWeight: 'bold', fontSize: 10}} />
                      <YAxis stroke="#94a3b8" axisLine={false} tickLine={false} tick={{fontWeight: 'bold', fontSize: 10}} />
                      <Tooltip cursor={{fill: '#f8fafc'}} formatter={(value: any, name: any) => [`${value} min`, name === 'drills' ? 'Active Output' : 'Passive Input']} contentStyle={{ backgroundColor: '#ffffff', border: '2px solid #f1f5f9', borderRadius: '16px', color: '#334155', fontWeight: 'bold' }} itemStyle={{ fontWeight: '900' }} />
                      <Bar dataKey="drills" stackId="a" fill="#6366f1" radius={[0, 0, 4, 4]} />
                      <Bar dataKey="immersion" stackId="a" fill="#d946ef" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>

              {/* 2. Grammar Weaknesses */}
              <section className="bg-white/80 backdrop-blur-xl p-6 sm:p-8 rounded-[2.5rem] border-2 border-white shadow-sm flex flex-col order-2 lg:order-none">
                <h2 className="text-xl sm:text-2xl font-black flex items-center gap-3 text-slate-700 mb-6">
                  <div className="bg-rose-100 p-2 sm:p-3 rounded-xl text-rose-500"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-6 sm:h-6"><path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3z"/><path d="M3 4h8s-.5-2-1-2H5a2 2 0 0 0-2 2z"/></svg></div>
                  Grammar Weaknesses
                </h2>
                {grammarPerformance.length === 0 ? (
                  <div className="text-center py-4 sm:py-8 text-slate-400 font-bold text-sm sm:text-base mt-auto">Complete drills to generate insights.</div>
                ) : (
                  <div className="space-y-5 sm:space-y-6 mt-auto">
                    {grammarPerformance.map((grammar, idx) => (
                      <div key={idx} className="flex flex-col gap-1.5 sm:gap-2">
                        <div className="flex justify-between text-sm sm:text-base">
                          <span className="font-black text-slate-700 capitalize">{(() => { const val = grammar.dimension_value.replace(/_/g, ' '); const typeStr = grammar.dimension_type ? grammar.dimension_type.split('_')[0] : ''; return ['Plural', 'Singular', 'Definite', 'Indefinite', 'Masculine', 'Feminine'].includes(grammar.dimension_value) ? `${typeStr} ${val}` : val; })()}</span>
                          <span className="text-slate-400 font-bold">{Math.round(grammar.mastery_score * 100)}%</span>
                        </div>
                        <div className="h-3 sm:h-4 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                          <div className={`h-full rounded-full transition-all duration-1000 ${grammar.mastery_score < 0.4 ? 'bg-rose-400' : grammar.mastery_score < 0.8 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${Math.max(5, grammar.mastery_score * 100)}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <div className="pb-12"></div>
          </div>
        )}
      </div>

      {/* CRAM MODAL */}
      {isCramModalOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-6 animate-in fade-in" onClick={closeCramModal}>
          <div className="bg-slate-50 rounded-t-[2.5rem] sm:rounded-[2.5rem] w-full max-w-2xl h-[90vh] sm:h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom-10" onClick={e => e.stopPropagation()}>
            
            <header className="p-6 sm:p-8 border-b-2 border-slate-200 flex justify-between items-center bg-white rounded-t-[2.5rem]">
               <div>
                 <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                   <div className="bg-rose-100 text-rose-500 w-10 h-10 flex items-center justify-center rounded-xl text-xl">🔥</div>
                   Cram Builder
                 </h2>
                 <p className="text-sm font-bold text-slate-400 mt-1">Select words to loop endlessly.</p>
               </div>
               <button onClick={closeCramModal} className="bg-slate-100 hover:bg-slate-200 text-slate-500 p-2.5 rounded-full transition-colors active:scale-90">
                 <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
               </button>
            </header>
            
            <div className="px-6 py-4 bg-white border-b-2 border-slate-200 space-y-4">
               <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  <button onClick={() => applyCramPreset('today')} className="whitespace-nowrap bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 font-bold px-4 py-2 rounded-xl text-xs active:scale-95 transition-all">New Today</button>
                  <button onClick={() => applyCramPreset('yesterday')} className="whitespace-nowrap bg-teal-50 hover:bg-teal-100 text-teal-600 border border-teal-100 font-bold px-4 py-2 rounded-xl text-xs active:scale-95 transition-all">Yesterday</button>
                  <button onClick={() => applyCramPreset('week')} className="whitespace-nowrap bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 font-bold px-4 py-2 rounded-xl text-xs active:scale-95 transition-all">Recent Adds</button>
                  <button onClick={() => applyCramPreset('struggling')} className="whitespace-nowrap bg-amber-50 hover:bg-amber-100 text-amber-600 border border-amber-100 font-bold px-4 py-2 rounded-xl text-xs active:scale-95 transition-all">Weak Words</button>
                  <button onClick={() => applyCramPreset('failed')} className="whitespace-nowrap bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 font-bold px-4 py-2 rounded-xl text-xs active:scale-95 transition-all">Recent Fails</button>
                  <button onClick={() => setCramSelectedIds([])} className="whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold px-4 py-2 rounded-xl text-xs active:scale-95 transition-all">Clear All</button>
               </div>

               {/* Custom Groups Row */}
               {cramGroups.length > 0 && (
                 <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {cramGroups.map(group => (
                      <div key={group.id} className="relative group inline-flex items-center bg-white border-2 border-indigo-100 text-indigo-600 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md hover:border-indigo-200">
                         <button onClick={() => loadGroup(group.vocab_ids)} className="px-3 py-2 whitespace-nowrap active:scale-95">{group.name} ({group.vocab_ids.length})</button>
                         {!isDemoMode && (
                           <button onClick={(e) => promptDeleteGroup(group.id, group.name, e)} className="px-2.5 py-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors border-l-2 border-indigo-50 active:scale-95 rounded-r-lg" title="Delete Group">
                             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                           </button>
                         )}
                      </div>
                    ))}
                 </div>
               )}

               <div className="relative">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  <input 
                    type="text" placeholder="Search by Albanian or English..." value={cramSearch} onChange={e => setCramSearch(e.target.value)} 
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 font-bold text-base text-slate-700 outline-none focus:border-rose-400 focus:bg-white focus:ring-4 focus:ring-rose-50 transition-all shadow-inner"
                  />
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
               {allVocab.filter(v => v.albanian.toLowerCase().includes(cramSearch.toLowerCase()) || v.english.toLowerCase().includes(cramSearch.toLowerCase())).map(word => {
                 const isSelected = cramSelectedIds.includes(word.id);
                 return (
                   <button 
                     key={word.id} onClick={() => setCramSelectedIds(prev => isSelected ? prev.filter(id => id !== word.id) : [...prev, word.id])}
                     className={`w-full flex items-center justify-between p-4 mb-2.5 rounded-2xl border-2 transition-all text-left active:scale-[0.98] ${isSelected ? 'bg-white border-rose-400 shadow-[0_4px_15px_rgba(244,63,94,0.15)] ring-4 ring-rose-50' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'}`}
                   >
                     <div>
                       <div className={`font-black text-lg mb-0.5 ${isSelected ? 'text-rose-600' : 'text-slate-700'}`}>{word.albanian}</div>
                       <div className={`font-bold text-xs ${isSelected ? 'text-rose-400' : 'text-slate-400'}`}>{word.english}</div>
                     </div>
                     <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected ? 'bg-rose-500 border-rose-500 text-white' : 'bg-slate-100 border-slate-300'}`}>
                       {isSelected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                     </div>
                   </button>
                 );
               })}
            </div>

            <footer className="p-6 sm:p-8 border-t-2 border-slate-200 bg-white rounded-b-[2.5rem] flex justify-between items-center shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-10">
              <div>
                <span className="block font-black text-xl text-slate-700">{cramSelectedIds.length}</span>
                <span className="block text-xs uppercase tracking-widest font-bold text-slate-400">Selected</span>
              </div>
              <div className="flex gap-2 sm:gap-3">
                {cramSelectedIds.length > 0 && (
                  <button 
                    onClick={() => {
                      if (isDemoMode) {
                        showToast("Saving groups is disabled in Ghost Mode.", "👻");
                        return;
                      }
                      setIsNamingGroup(true);
                    }}
                    className="bg-indigo-50 hover:bg-indigo-100 text-indigo-500 border-2 border-indigo-100 font-black py-3.5 px-4 rounded-2xl transition-all active:scale-95 animate-in slide-in-from-right-4 fade-in"
                    title="Save as Group"
                  >
                    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  </button>
                )}
                
                <button 
                  onClick={startCramming} disabled={cramSelectedIds.length === 0 || isNavigatingToCram}
                  className="flex-1 bg-rose-500 hover:bg-rose-400 text-white font-black py-3.5 px-6 sm:px-8 rounded-2xl transition-all active:scale-95 disabled:opacity-50 shadow-[0_8px_20px_rgba(244,63,94,0.3)] text-lg flex justify-center items-center gap-2"
                >
                  {isNavigatingToCram ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Starting...
                    </>
                  ) : (
                    "Start Cramming"
                  )}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {isNamingGroup && !isDemoMode && (
        <div className="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsNamingGroup(false)}>
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-slate-800 mb-2">Save Custom Group</h3>
            <p className="text-slate-500 text-sm font-bold mb-6">Name your group of {cramSelectedIds.length} words to quickly cram them later.</p>
            
            <input 
              type="text" placeholder="e.g. Host Family Verbs" 
              value={newGroupName} 
              onChange={e => setNewGroupName(e.target.value)} 
              onKeyDown={e => {
                if (e.key === 'Enter' && newGroupName.trim() && !isSavingGroup) {
                  e.preventDefault();
                  handleSaveGroup();
                }
              }}
              autoFocus 
              className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-700 outline-none focus:border-indigo-400 mb-6 shadow-inner transition-all" 
            />
            
            <div className="flex justify-end gap-3">
               <button onClick={() => setIsNamingGroup(false)} className="px-5 py-3 rounded-xl font-black text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors active:scale-95">Cancel</button>
               <button onClick={handleSaveGroup} disabled={!newGroupName.trim() || isSavingGroup} className="px-5 py-3 rounded-xl font-black text-white bg-indigo-500 hover:bg-indigo-400 transition-colors disabled:opacity-50 active:scale-95 flex items-center gap-2 shadow-md">
                 {isSavingGroup ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : "Save Group"}
               </button>
            </div>
          </div>
        </div>
      )}

      {groupToDelete && !isDemoMode && (
        <div className="fixed inset-0 z-[260] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setGroupToDelete(null)}>
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-black text-slate-800 mb-2">Delete Group?</h3>
            <p className="text-slate-500 text-sm font-bold mb-6">Are you sure you want to delete the <span className="text-rose-500">"{groupToDelete.name}"</span> cram group? This won't delete your words.</p>
            
            <div className="flex justify-end gap-3">
               <button onClick={() => setGroupToDelete(null)} className="px-5 py-3 rounded-xl font-black text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors active:scale-95">Cancel</button>
               <button onClick={confirmDeleteGroup} disabled={isDeletingGroup} className="px-5 py-3 rounded-xl font-black text-white bg-rose-500 hover:bg-rose-400 transition-colors disabled:opacity-50 active:scale-95 flex items-center gap-2 shadow-md">
                 {isDeletingGroup ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : "Delete"}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* GHOST MODE MODAL */}
      {showGhostModal && (
        <div className="fixed inset-0 z-[500] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowGhostModal(false)}>
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 w-full max-w-sm shadow-2xl animate-in zoom-in-95 flex flex-col items-center text-center" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-indigo-100 text-indigo-500 rounded-full flex items-center justify-center mb-6 shadow-inner text-3xl">
              👻
            </div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Ghost Mode Active</h3>
            <p className="text-slate-500 font-bold mb-8">
              Live AI generation is disabled for guests to save API costs. Imagine perfectly tailored Albanian sentences generating right here! 🚀
            </p>
            <button onClick={() => setShowGhostModal(false)} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-3.5 rounded-xl transition-colors active:scale-95">
              Got it!
            </button>
          </div>
        </div>
      )}
    </main>
  );
}