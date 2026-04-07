"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  evaluateAnswer,
  scheduleSRS,
  pickDueWord,
  updateGlobalGrammarStat
} from "@/lib/logic";
import grammarRules from "@/lib/grammar_rules.json";
import { createClient } from "@supabase/supabase-js";
import DictionaryModal from "@/components/DictionaryModal";
import { initDemoDB, mockSupabase } from "@/lib/mockSupabaseClient";

const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const getSupabase = () => {
  if (isDemoMode) {
    initDemoDB();
    return mockSupabase;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
};

const TYPE_FILTERS = [
  { id: "Verb", label: "Verbs", emoji: "⚡", color: "bg-indigo-500", text: "text-indigo-600", match: (t: string | null) => t === "Verb" || t === "Command" },
  { id: "Noun", label: "Nouns", emoji: "📘", color: "bg-blue-500", text: "text-blue-600", match: (t: string | null) => t === "Noun (M)" || t === "Noun (F)" },
  { id: "Adjective", label: "Adjectives", emoji: "🎨", color: "bg-emerald-500", text: "text-emerald-600", match: (t: string | null) => t === "Adjective" },
  { id: "Adverb", label: "Adverbs", emoji: "💨", color: "bg-amber-500", text: "text-amber-600", match: (t: string | null) => t === "Adverb" },
  { id: "Phrase", label: "Phrases", emoji: "💬", color: "bg-sky-500", text: "text-sky-600", match: (t: string | null) => t === "Phrase" },
  { id: "Preposition", label: "Prepositions", emoji: "🔗", color: "bg-violet-500", text: "text-violet-600", match: (t: string | null) => t === "Preposition" },
  { id: "New", label: "Misc", emoji: "📦", color: "bg-slate-500", text: "text-slate-600", match: (t: string | null) => !t || t === "Unknown" },
];

export default function WordDrill() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "setup" | "drill">("loading");
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(new Set(TYPE_FILTERS.map(f => f.id)));
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragAction, setDragAction] = useState<"select" | "unselect" | null>(null);

  useEffect(() => {
    const handlePointerUp = () => { setIsDragging(false); setDragAction(null); };
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, []);

  const [currentPrompt, setCurrentPrompt] = useState<any>(null);
  const [caughtUp, setCaughtUp] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<{ score: number; expected: string; promptId: string; } | null>(null);

  const [modalWord, setModalWord] = useState<any | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [isGeneratingMnemonic, setIsGeneratingMnemonic] = useState(false);

  const [dbVocab, setDbVocab] = useState<any[]>([]);
  const dbVocabRef = useRef<any[]>([]);
  const filteredVocabRef = useRef<any[]>([]);
  const [grammarMetrics, setGrammarMetrics] = useState<any[]>([]);
  const grammarMetricsRef = useRef<any[]>([]);
  const [dbConjugations, setDbConjugations] = useState<any[]>([]);
  const dbConjugationsRef = useRef<any[]>([]);
  const [dbNouns, setDbNouns] = useState<any[]>([]);
  const dbNounsRef = useRef<any[]>([]);
  const [dbAdjectives, setDbAdjectives] = useState<any[]>([]);
  const dbAdjectivesRef = useRef<any[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const actionLock = useRef(false);

  // --- PERSISTENCE: Save State ---
  useEffect(() => {
    if (phase !== "loading") {
      const stateToSave = { 
        phase, currentPrompt, userInput, feedback, caughtUp, 
        selectedFilters: Array.from(selectedFilters) 
      };
      sessionStorage.setItem('word_drill_state', JSON.stringify(stateToSave));
    }
  }, [phase, currentPrompt, userInput, feedback, caughtUp, selectedFilters]);

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      if (!supabase) { setPhase("setup"); return; }
      
      const { data: vocabData } = await supabase.from("vocab").select("*");
      if (vocabData) { dbVocabRef.current = vocabData; setDbVocab(vocabData); }
      
      const { data: metricsData } = await supabase.from("grammar_metrics").select("*");
      if (metricsData) { grammarMetricsRef.current = metricsData; setGrammarMetrics(metricsData); }
      
      const { data: conjData } = await supabase.from("conjugations").select("*");
      if (conjData) { dbConjugationsRef.current = conjData; setDbConjugations(conjData); }
      
      const { data: nounData } = await supabase.from("noun_declensions").select("*");
      if (nounData) { dbNounsRef.current = nounData; setDbNouns(nounData); }
      
      const { data: adjData } = await supabase.from("adjective_agreements").select("*");
      if (adjData) { dbAdjectivesRef.current = adjData; setDbAdjectives(adjData); }
      
      // --- PERSISTENCE: Rehydrate ---
      const saved = sessionStorage.getItem('word_drill_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        const loadedFilters = new Set<string>(parsed.selectedFilters);
        setSelectedFilters(loadedFilters);
        setPhase(parsed.phase);
        setCurrentPrompt(parsed.currentPrompt);
        setUserInput(parsed.userInput);
        setFeedback(parsed.feedback);
        setCaughtUp(parsed.caughtUp);
        
        if (vocabData) {
          filteredVocabRef.current = vocabData.filter((word: any) => 
            TYPE_FILTERS.some(f => loadedFilters.has(f.id) && f.match(word.type))
          );
        }
      } else {
        setPhase("setup");
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && feedback && currentPrompt && feedback.promptId === currentPrompt.promptId && !modalWord) {
        e.preventDefault(); generatePrompt();
      }
    };
    if (phase === "drill") window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [feedback, currentPrompt, phase, modalWord]);

  useEffect(() => {
    if (currentPrompt && !feedback && inputRef.current && !modalWord) {
      inputRef.current.focus();
    }
  }, [currentPrompt, feedback, modalWord]);

  function applyTypeFilter(vocab: any[]) {
    return vocab.filter(word => TYPE_FILTERS.some(f => selectedFilters.has(f.id) && f.match(word.type)));
  }

  function toggleFilter(id: string) { updateFilter(id, !selectedFilters.has(id)); }
  
  function updateFilter(id: string, select: boolean) {
    setSelectedFilters(prev => {
      const next = new Set(prev);
      if (select) next.add(id);
      else if (next.size > 1) next.delete(id);
      return next;
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>, id: string, currentlyActive: boolean) {
    e.currentTarget.releasePointerCapture(e.pointerId); 
    setIsDragging(true);
    const willSelect = !currentlyActive;
    setDragAction(willSelect ? "select" : "unselect");
    updateFilter(id, willSelect);
  }

  function handlePointerEnter(id: string) {
    if (isDragging && dragAction !== null) updateFilter(id, dragAction === "select");
  }

  function startDrill() {
    const filtered = applyTypeFilter(dbVocabRef.current);
    filteredVocabRef.current = filtered;
    setPhase("drill"); setCaughtUp(false); pickAndSetPrompt(filtered);
  }

  function pickAndSetPrompt(vocab: any[]) {
    const word = pickDueWord(vocab);
    if (!word) { setCurrentPrompt(null); setCaughtUp(true); return; }
    setCaughtUp(false);
    
    let constraints: string[] = [];
    let expectedAnswer = word.albanian;
    let finalTargetTense: string | null = null;
    let finalTargetPronoun: string | null = null;
    let finalTargetCase: string | null = null;
    let finalTargetDefiniteness: string | null = null;
    let finalTargetPlurality: string | null = null;
    let finalTargetGender: string | null = null;

    const getUrgency = (type: string, value: string) => {
      const metric = grammarMetricsRef.current.find(m => m.dimension_type === type && m.dimension_value === value);
      const importance = metric?.importance || 5; 
      const baseUrgency = metric ? importance * (1 - metric.mastery_score) : 2.5;
      return baseUrgency + (Math.random() * 0.2); 
    };

    if (word.type === "Verb") {
      finalTargetTense = grammarRules.verb_tenses.reduce((mostUrgent, current) => 
        getUrgency('tense', current) > getUrgency('tense', mostUrgent) ? current : mostUrgent
      );
      
      let conjugationRow = dbConjugationsRef.current.find(c => c.vocab_id === word.id && c.mood_tense === finalTargetTense);
      const pronounColumnMap: Record<string, string> = { "Unë": "une", "Ti": "ti", "Ai/Ajo": "ai_ajo", "Ne": "ne", "Ju": "ju", "Ata/Ato": "ata_ato" };
      
      let validPronouns = grammarRules.pronouns;
      if (conjugationRow) validPronouns = grammarRules.pronouns.filter(p => conjugationRow[pronounColumnMap[p]] !== null);
      else {
        if (finalTargetTense === "imperative_present") validPronouns = ["Ti", "Ju"];
        if (finalTargetTense === "participle") validPronouns = ["Unë"];
      }
      if (validPronouns.length === 0) validPronouns = ["Unë"];

      finalTargetPronoun = validPronouns.reduce((mostUrgent, current) => 
        getUrgency('pronoun', current) > getUrgency('pronoun', mostUrgent) ? current : mostUrgent
      );

      const targetColumn = pronounColumnMap[finalTargetPronoun];
      const displayTense = (grammarRules as any).tense_labels?.[finalTargetTense] || finalTargetTense;

      if (finalTargetTense === "participle") constraints = [displayTense];
      else if (finalTargetTense === "imperative_present") constraints = [finalTargetPronoun, displayTense];
      else constraints = [finalTargetPronoun, displayTense, finalTargetTense.includes("subjunctive") ? "Subjunctive" : "Indicative"];

      if (conjugationRow && targetColumn && conjugationRow[targetColumn]) expectedAnswer = conjugationRow[targetColumn];
    
    } else if (word.type === "Adjective") {
      finalTargetGender = ["Masculine", "Feminine"].reduce((m, c) => getUrgency('adjective_gender', c) > getUrgency('adjective_gender', m) ? c : m);
      finalTargetPlurality = ["Singular", "Plural"].reduce((m, c) => getUrgency('adjective_plurality', c) > getUrgency('adjective_plurality', m) ? c : m);
      constraints = [finalTargetGender, finalTargetPlurality];
      
      const adjData = dbAdjectivesRef.current.find(a => a.vocab_id === word.id);
      if (adjData) {
        const colMap: any = { "Masculine:Singular": "masc_sg", "Feminine:Singular": "fem_sg", "Masculine:Plural": "masc_pl", "Feminine:Plural": "fem_pl" };
        expectedAnswer = adjData[colMap[`${finalTargetGender}:${finalTargetPlurality}`]] || word.albanian;
      }
    } else if (word.type?.startsWith("Noun")) {
      finalTargetCase = grammarRules.noun_cases.reduce((m, c) => getUrgency('noun_case', c) > getUrgency('noun_case', m) ? c : m);
      finalTargetDefiniteness = ["Definite", "Indefinite"].reduce((m, c) => getUrgency('noun_definiteness', c) > getUrgency('noun_definiteness', m) ? c : m);
      finalTargetPlurality = ["Singular", "Plural"].reduce((m, c) => getUrgency('noun_plurality', c) > getUrgency('noun_plurality', m) ? c : m);
      constraints = [finalTargetCase, finalTargetDefiniteness, finalTargetPlurality];
      
      const nounData = dbNounsRef.current.find(n => n.vocab_id === word.id && n.n_case === finalTargetCase);
      if (nounData) {
        const colMap: any = { "Indefinite:Singular": "indef_sg", "Definite:Singular": "def_sg", "Indefinite:Plural": "indef_pl", "Definite:Plural": "def_pl" };
        expectedAnswer = nounData[colMap[`${finalTargetDefiniteness}:${finalTargetPlurality}`]] || word.albanian;
      }
    }

    setCurrentPrompt({
      word: word.english, constraints, expected: expectedAnswer.toLowerCase(), type: word.type,
      promptId: Math.random().toString(36).slice(2), id: word.id, interval: word.interval ?? 0,
      ease_factor: word.ease_factor ?? 2.5, streak: word.streak ?? 0, usefulness: word.usefulness ?? 5,
      mastery_score: word.mastery_score ?? 0.0, targetTense: finalTargetTense, targetPronoun: finalTargetPronoun,
      targetCase: finalTargetCase, targetDefiniteness: finalTargetDefiniteness, targetPlurality: finalTargetPlurality, targetGender: finalTargetGender
    });
  }

  const generatePrompt = () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setFeedback(null); setUserInput(""); setMnemonic(null);
    pickAndSetPrompt(filteredVocabRef.current);
    setTimeout(() => { actionLock.current = false; }, 300);
  };

  const handleGenerateMnemonic = async () => {
    if (!currentPrompt) return;
    setIsGeneratingMnemonic(true); setMnemonic(null);
    try {
      const res = await fetch('/api/generate-mnemonic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albanian: currentPrompt.expected, english: currentPrompt.word })
      });
      const data = await res.json();
      if (res.ok) setMnemonic(data.mnemonic); else alert("Failed to generate mnemonic.");
    } catch (err) { console.error(err); } 
    finally { setIsGeneratingMnemonic(false); }
  };

  async function updateMastery(prompt: any, score: number) {
    const supabase = getSupabase();
    if (!supabase) return;

    const schedule = scheduleSRS(score, prompt.interval, prompt.ease_factor, prompt.streak, prompt.usefulness);
    const updatedValues = {
      next_review: schedule.nextReview, interval: schedule.newInterval, ease_factor: schedule.newEaseFactor,
      streak: schedule.newStreak, mastery_score: schedule.newMastery, confidence: schedule.newConfidence, last_seen: new Date().toISOString()
    };

    await supabase.from("vocab").update(updatedValues).eq("id", prompt.id);
    const idx = dbVocabRef.current.findIndex((w: any) => w.id === prompt.id);
    if (idx !== -1) dbVocabRef.current[idx] = { ...dbVocabRef.current[idx], ...updatedValues };
    const fidx = filteredVocabRef.current.findIndex((w: any) => w.id === prompt.id);
    if (fidx !== -1) filteredVocabRef.current[fidx] = { ...filteredVocabRef.current[fidx], ...updatedValues };

    let grammarMasteryId = null;
    const updateMetric = async (dType: string, dValue: string) => {
      const oldStat = grammarMetricsRef.current.find(m => m.dimension_type === dType && m.dimension_value === dValue);
      if (oldStat) {
        const newScore = updateGlobalGrammarStat(oldStat.mastery_score, score, oldStat.total_reviews);
        oldStat.mastery_score = newScore; oldStat.total_reviews += 1;
        await supabase.from("grammar_metrics").update({ mastery_score: newScore, total_reviews: oldStat.total_reviews, updated_at: new Date().toISOString() }).eq("id", oldStat.id);
      }
    };

    const updateSpecificMastery = async (gType: string, gValue: string) => {
      let { data: mData } = await supabase.from("grammar_mastery").select("id, mastery_score").eq("vocab_id", prompt.id).eq("grammar_type", gType).eq("grammar_value", gValue).single();
      if (mData) {
        grammarMasteryId = mData.id;
        const newMastery = updateGlobalGrammarStat(mData.mastery_score, score, 5);
        await supabase.from("grammar_mastery").update({ mastery_score: newMastery, last_seen: new Date().toISOString() }).eq("id", grammarMasteryId);
      } else {
        const { data: nData } = await supabase.from("grammar_mastery").insert({ vocab_id: prompt.id, grammar_type: gType, grammar_value: gValue, mastery_score: score, last_seen: new Date().toISOString() }).select("id").single();
        if (nData) grammarMasteryId = nData.id;
      }
    };

    if (prompt.type === "Verb") {
      if (prompt.targetTense && prompt.targetPronoun) await updateSpecificMastery("conjugation", `${prompt.targetTense}:${prompt.targetPronoun}`);
      if (prompt.targetPronoun && prompt.targetTense !== "participle") await updateMetric("pronoun", prompt.targetPronoun);
      if (prompt.targetTense) await updateMetric("tense", prompt.targetTense);
    } else if (prompt.type === "Adjective") {
      if (prompt.targetGender && prompt.targetPlurality) {
        await updateSpecificMastery("adjective_agreement", `${prompt.targetGender}:${prompt.targetPlurality}`);
        await updateMetric("adjective_gender", prompt.targetGender); await updateMetric("adjective_plurality", prompt.targetPlurality);
      }
    } else if (prompt.type?.startsWith("Noun")) {
      if (prompt.targetCase && prompt.targetDefiniteness && prompt.targetPlurality) {
        await updateSpecificMastery("noun_declension", `${prompt.targetCase}:${prompt.targetDefiniteness}:${prompt.targetPlurality}`);
        await updateMetric("noun_case", prompt.targetCase); await updateMetric("noun_definiteness", prompt.targetDefiniteness); await updateMetric("noun_plurality", prompt.targetPlurality);
      }
    }
    await supabase.from("review_logs").insert({ vocab_id: prompt.id, grammar_mastery_id: grammarMasteryId, score, created_at: new Date().toISOString() });
  }

  const handleCheck = () => {
    if (!currentPrompt || actionLock.current || feedback) return;
    actionLock.current = true;
    const finalInput = userInput.trim();
    const score = finalInput === "" ? 0.0 : evaluateAnswer(currentPrompt.expected, finalInput, grammarRules.rules.partial_credit_threshold);
    setFeedback({ score, expected: currentPrompt.expected, promptId: currentPrompt.promptId });
    updateMastery(currentPrompt, score);
    setTimeout(() => { actionLock.current = false; }, 100);
  };

  const openDictionaryForCurrentWord = () => {
    if (!currentPrompt || !feedback) return;
    const baseWord = dbVocabRef.current.find(w => w.id === currentPrompt.id);
    if (baseWord) setModalWord(baseWord);
  };

  const handleModalUpdate = (updatedWord: any) => {
    setModalWord(updatedWord);
    const idx = dbVocabRef.current.findIndex(w => w.id === updatedWord.id);
    if (idx !== -1) dbVocabRef.current[idx] = { ...dbVocabRef.current[idx], ...updatedWord };
    const fidx = filteredVocabRef.current.findIndex(w => w.id === updatedWord.id);
    if (fidx !== -1) filteredVocabRef.current[fidx] = { ...filteredVocabRef.current[fidx], ...updatedWord };
    if (currentPrompt && currentPrompt.id === updatedWord.id) setCurrentPrompt((prev: any) => ({ ...prev, word: updatedWord.english }));
  };

  if (phase === "loading") {
    return (
      <main className="min-h-screen bg-[#fafafa] flex items-center justify-center pb-[calc(env(safe-area-inset-bottom)+80px)]">
        <div className="flex flex-col items-center gap-4 text-slate-400 font-bold">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-pink-400 rounded-full animate-spin"></div>
        </div>
      </main>
    );
  }

  if (phase === "setup") {
    const filteredVocab = applyTypeFilter(dbVocab);
    const dueCount = filteredVocab.filter(w => !w.next_review || new Date(w.next_review) <= new Date()).length;

    return (
      <main className="min-h-[100dvh] bg-[#fafafa] flex flex-col items-center p-6 pt-12 sm:pt-20 pb-[calc(env(safe-area-inset-bottom)+5rem)] select-none">
        {isDemoMode && (
          <div className="fixed top-4 left-4 z-[400] bg-indigo-500 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg tracking-widest uppercase border-2 border-indigo-400">
            Demo Mode
          </div>
        )}

        <div className="max-w-md sm:max-w-3xl w-full">
          
          <header className="mb-8 text-center sm:text-left">
            <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-600 font-bold text-sm mb-4 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              Home
            </Link>
            <h1 className="text-3xl sm:text-5xl font-black text-slate-700 tracking-tight mb-2">Select Filters</h1>
            <p className="text-slate-500 font-bold text-sm sm:text-base">Tap categories to include them.</p>
          </header>

          <div className="flex flex-wrap gap-2.5 sm:gap-4 mb-10 justify-center sm:justify-start">
            {TYPE_FILTERS.map(filter => {
              const count = dbVocab.filter(w => filter.match(w.type)).length;
              const active = selectedFilters.has(filter.id);
              return (
                <button
                  key={filter.id} 
                  onPointerDown={(e) => handlePointerDown(e, filter.id, active)}
                  onPointerEnter={() => handlePointerEnter(filter.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFilter(filter.id); } }}
                  className={`flex items-center gap-2 px-4 py-2.5 sm:px-5 sm:py-3 rounded-full touch-none transition-all duration-200 border-2 ${
                    active
                      ? `${filter.color} border-transparent text-white shadow-md scale-105 ring-4 ring-${filter.color}/20`
                      : `bg-white/80 backdrop-blur-md border-slate-100 ${filter.text} hover:bg-slate-50 shadow-sm`
                  }`}
                >
                  <span className="text-lg sm:text-xl leading-none">{filter.emoji}</span>
                  <span className="font-bold text-sm sm:text-base">{filter.label}</span>
                  <span className={`text-[11px] font-black px-1.5 rounded-md ${active ? 'bg-black/10' : 'bg-slate-100 text-slate-400'}`}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="text-center sm:text-left mt-auto sm:mt-12">
            <p className="text-indigo-500 font-black mb-4 bg-indigo-50 inline-block px-4 py-1.5 rounded-full text-sm sm:text-base">
              {dueCount} words due today
            </p>
            <button
              onClick={startDrill} disabled={filteredVocab.length === 0}
              className="w-full sm:w-auto sm:min-w-[300px] bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:scale-100 text-white font-black py-4 sm:py-5 rounded-[2rem] transition-all shadow-[0_8px_20px_rgba(99,102,241,0.3)] active:scale-95 flex items-center justify-center gap-2 text-lg sm:text-xl"
            >
              Start Session
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#fafafa] flex flex-col items-center justify-start sm:justify-center p-4 pt-8 sm:p-8 pb-[calc(env(safe-area-inset-bottom)+5rem)] select-none">
      
      {isDemoMode && (
        <div className="fixed top-4 left-4 z-[400] bg-indigo-500 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg tracking-widest uppercase border-2 border-indigo-400">
          Demo Mode
        </div>
      )}

      <div className="max-w-md sm:max-w-xl md:max-w-2xl w-full bg-white/80 backdrop-blur-xl p-6 sm:p-10 rounded-[2.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] border-2 border-white relative">
        
        <header className="mb-6 sm:mb-8 text-center relative">
          <button onClick={() => { setPhase("setup"); sessionStorage.removeItem('word_drill_state'); }} className="absolute left-0 top-0 text-slate-300 hover:text-slate-500 transition-colors p-2 sm:p-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-7 sm:h-7"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          
          <button 
            onClick={openDictionaryForCurrentWord} 
            disabled={!feedback}
            className={`absolute right-0 top-0 transition-colors p-2 sm:p-2.5 rounded-full ${!feedback ? 'text-slate-300 bg-slate-50 opacity-50 cursor-not-allowed' : 'text-indigo-500 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-600 shadow-sm'}`} 
            title="Grammar Details"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          </button>
          
          <p className="text-xs uppercase tracking-widest text-slate-400 font-bold pt-2 sm:pt-1">Translate</p>
        </header>

        {caughtUp && (
          <div className="text-center py-12 sm:py-16">
            <p className="text-5xl sm:text-6xl mb-4 animate-bounce">🎉</p>
            <p className="text-2xl sm:text-3xl font-black text-slate-700 mb-2 sm:mb-4">All caught up!</p>
            <p className="text-slate-400 text-sm sm:text-base mb-8 font-bold">You crushed your reviews for now.</p>
            <button onClick={() => { setPhase("setup"); sessionStorage.removeItem('word_drill_state'); }} className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-3 sm:py-3.5 px-6 sm:px-8 rounded-full transition-colors inline-flex items-center gap-2 sm:text-base">
               Back to Filter
            </button>
          </div>
        )}

        {!caughtUp && currentPrompt && (
          <>
            <section className="text-center mb-8 sm:mb-10">
              <h2 className="text-4xl sm:text-5xl font-black text-slate-800 mb-4 tracking-tight">{currentPrompt.word}</h2>
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                {currentPrompt.constraints.map((c: string, idx: number) => (
                  <span key={idx} className="bg-slate-100 text-slate-500 text-[11px] sm:text-xs font-black px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md border border-slate-200/60 uppercase tracking-wide">
                    {c}
                  </span>
                ))}
              </div>
            </section>

            <form onSubmit={(e) => { e.preventDefault(); handleCheck(); }} className="flex flex-col gap-3 sm:gap-4">
              <input
                key={`input-${currentPrompt?.promptId}`}
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                ref={inputRef}
                disabled={!!feedback}
                autoComplete="off"
                className="w-full bg-slate-50 border-2 border-slate-200 focus:border-indigo-400 focus:bg-white outline-none rounded-[1.5rem] px-4 py-4 sm:px-5 sm:py-4 text-center text-xl sm:text-2xl font-bold text-slate-700 transition-all disabled:opacity-50"
                placeholder="Type in Albanian..."
              />

              {!feedback && (
                <button type="submit" className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-black py-4 sm:py-4 rounded-[1.5rem] transition-all shadow-[0_4px_14px_rgba(99,102,241,0.3)] active:scale-95 text-lg sm:text-xl mt-2 sm:mt-3">
                  {userInput.trim() === "" ? "Show Answer" : "Check"}
                </button>
              )}
            </form>

            {feedback && feedback.promptId === currentPrompt?.promptId && (
              <div className="mt-4 sm:mt-5 flex flex-col gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-2">
                
                <div className={`p-4 sm:p-5 rounded-[1.5rem] text-center font-bold border-2 ${
                  feedback.score === 1.0 ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                  feedback.score > 0 ? "bg-amber-50 text-amber-600 border-amber-200" :
                  "bg-rose-50 text-rose-600 border-rose-200"
                  }`}>
                  <p className="text-lg sm:text-xl mb-1">{feedback.score === 1.0 ? "Perfect! ✨" : feedback.score > 0 ? "Almost!" : "Incorrect."}</p>
                  
                  {feedback.score < 1.0 && (
                    <p className="text-sm sm:text-base text-slate-500">
                      Answer: <span className="font-black text-slate-800 text-base sm:text-lg">{feedback.expected}</span>
                    </p>
                  )}
                </div>

                {/* Compact Action Row for PWA */}
                <div className="flex gap-2 sm:gap-3">
                  {!mnemonic && !isGeneratingMnemonic && (
                    <button onClick={handleGenerateMnemonic} type="button" className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-500 font-bold py-3 sm:py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform text-sm sm:text-base">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>
                      Hint
                    </button>
                  )}
                  {isGeneratingMnemonic && (
                     <div className="flex-1 bg-slate-50 text-indigo-400 font-bold py-3 sm:py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm sm:text-base">
                        <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div>
                     </div>
                  )}
                  
                  <button onClick={generatePrompt} type="button" className="flex-[2] bg-slate-800 hover:bg-slate-700 text-white font-black py-3 sm:py-3.5 rounded-xl active:scale-95 transition-transform shadow-md text-sm sm:text-base flex items-center justify-center gap-2">
                    Next <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  </button>
                </div>

                {/* Compact Mnemonic Display */}
                {mnemonic && (
                  <div className="bg-white border-2 border-indigo-100 rounded-[1.5rem] p-4 sm:p-5 text-left shadow-sm mt-1">
                    <div className="prose prose-sm leading-snug font-medium text-slate-600"
                      dangerouslySetInnerHTML={{ __html: mnemonic.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-indigo-600 font-black">$1</strong>') }}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <DictionaryModal word={modalWord} onClose={() => setModalWord(null)} onUpdate={handleModalUpdate} />
    </main>
  );
}