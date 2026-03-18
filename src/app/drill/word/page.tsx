"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { 
  evaluateAnswer, 
  scheduleSRS, 
  pickDueWord,
  updateGlobalGrammarStat
} from "@/lib/logic";
import grammarRules from "@/lib/grammar_rules.json";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
};

// ────────────────────────────────────────────────────────────────
// Word-type filter definitions (Null-Safe)
// ────────────────────────────────────────────────────────────────
const TYPE_FILTERS = [
  {
    id: "Verb",
    label: "Verbs",
    emoji: "⚡",
    color: "from-indigo-600 to-purple-600",
    border: "border-indigo-500/40",
    match: (t: string | null) => t === "Verb",
  },
  {
    id: "Noun",
    label: "Nouns",
    emoji: "🏷️",
    color: "from-sky-600 to-cyan-600",
    border: "border-sky-500/40",
    match: (t: string | null) => t?.startsWith("Noun") || false,
  },
  {
    id: "Adjective",
    label: "Adjectives",
    emoji: "🎨",
    color: "from-emerald-600 to-teal-600",
    border: "border-emerald-500/40",
    match: (t: string | null) => t === "Adjective",
  },
  {
    id: "Adverb",
    label: "Adverbs",
    emoji: "💨",
    color: "from-amber-600 to-orange-600",
    border: "border-amber-500/40",
    match: (t: string | null) => t === "Adverb",
  },
  {
    id: "Other",
    label: "Other",
    emoji: "✨",
    color: "from-rose-600 to-pink-600",
    border: "border-rose-500/40",
    match: (t: string | null) => !t || (!["Verb", "Adjective", "Adverb", "Phrase"].includes(t) && !t.startsWith("Noun")),
  },
];

export default function WordDrill() {
  const [phase, setPhase] = useState<"loading" | "setup" | "drill">("loading");
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(
    new Set(["Verb", "Noun", "Adjective", "Adverb", "Other"])
  );
  const [currentPrompt, setCurrentPrompt] = useState<any>(null);
  const [caughtUp, setCaughtUp] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<{
    score: number;
    expected: string;
    promptId: string;
  } | null>(null);
  
  const [dbVocab, setDbVocab] = useState<any[]>([]);
  const dbVocabRef = useRef<any[]>([]);
  const filteredVocabRef = useRef<any[]>([]);

  const [grammarMetrics, setGrammarMetrics] = useState<any[]>([]);
  const grammarMetricsRef = useRef<any[]>([]);

  const [dbConjugations, setDbConjugations] = useState<any[]>([]);
  const dbConjugationsRef = useRef<any[]>([]);

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      if (!supabase) { setPhase("setup"); return; }
      
      const { data: vocabData } = await supabase.from("vocab").select("*");
      if (vocabData) {
        dbVocabRef.current = vocabData;
        setDbVocab(vocabData);
      }

      const { data: metricsData } = await supabase.from("grammar_metrics").select("*");
      if (metricsData) {
        grammarMetricsRef.current = metricsData;
        setGrammarMetrics(metricsData);
      }

      const { data: conjData } = await supabase.from("conjugations").select("*");
      if (conjData) {
        dbConjugationsRef.current = conjData;
        setDbConjugations(conjData);
      }

      setPhase("setup");
    }
    loadData();
  }, []);

  function applyTypeFilter(vocab: any[]) {
    return vocab.filter(word =>
      TYPE_FILTERS.some(f => selectedFilters.has(f.id) && f.match(word.type))
    );
  }

  function toggleFilter(id: string) {
    setSelectedFilters(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function startDrill() {
    const filtered = applyTypeFilter(dbVocabRef.current);
    filteredVocabRef.current = filtered;
    setPhase("drill");
    setCaughtUp(false);
    pickAndSetPrompt(filtered);
  }

  function pickAndSetPrompt(vocab: any[]) {
    // Step 1: Pick the "Weakest" Word based on SRS schedule
    const word = pickDueWord(vocab);

    if (!word) {
      setCurrentPrompt(null);
      setCaughtUp(true);
      return;
    }

    setCaughtUp(false);
    let constraints: string[] = [];
    let expectedAnswer = word.albanian;
    
    // Variables for Specific Tracker
    let finalTargetTense: string | null = null;
    let finalTargetPronoun: string | null = null;
    let finalTargetCase: string | null = null;
    let finalTargetDefiniteness: string | null = null;
    let finalTargetPlurality: string | null = null;
    let finalTargetGender: string | null = null;

    // Helper to calculate Urgency globally (Importance * (1 - Mastery))
    const getUrgency = (type: string, value: string) => {
      const metric = grammarMetricsRef.current.find(m => m.dimension_type === type && m.dimension_value === value);
      return metric ? metric.importance * (1 - metric.mastery_score) : 2.5; 
    };

    // Step 2: Pick the "Weakest" Attributes for that specific word
    if (word.type === "Verb") {
      const targetTense = grammarRules.verb_tenses.reduce((mostUrgent, current) => {
        return getUrgency('tense', current) > getUrgency('tense', mostUrgent) ? current : mostUrgent;
      });
      finalTargetTense = targetTense;

      let conjugationRow = dbConjugationsRef.current.find(c => c.vocab_id === word.id && c.mood_tense === targetTense);

      const pronounColumnMap: Record<string, string> = {
        "Unë": "une", "Ti": "ti", "Ai/Ajo": "ai_ajo", "Ne": "ne", "Ju": "ju", "Ata/Ato": "ata_ato"
      };

      let validPronouns = grammarRules.pronouns;
      if (conjugationRow) {
        validPronouns = grammarRules.pronouns.filter(p => conjugationRow[pronounColumnMap[p]] !== null);
      } else {
        if (targetTense === "imperative_present") validPronouns = ["Ti", "Ju"];
        if (targetTense === "participle") validPronouns = ["Unë"];
      }
      
      if (validPronouns.length === 0) validPronouns = ["Unë"];

      const targetPronoun = validPronouns.reduce((mostUrgent, current) => {
        return getUrgency('pronoun', current) > getUrgency('pronoun', mostUrgent) ? current : mostUrgent;
      });
      finalTargetPronoun = targetPronoun;

      const targetColumn = pronounColumnMap[targetPronoun];
      const displayTense = (grammarRules as any).tense_labels?.[targetTense] || targetTense;

      if (targetTense === "participle") {
        constraints = [displayTense]; 
      } else if (targetTense === "imperative_present") {
        constraints = [targetPronoun, displayTense];
      } else {
        const moodLabel = targetTense.includes("subjunctive") ? "Subjunctive" : "Indicative";
        constraints = [targetPronoun, displayTense, moodLabel];
      }

      if (conjugationRow && targetColumn && conjugationRow[targetColumn]) {
        expectedAnswer = conjugationRow[targetColumn];
      }

    } else if (word.type === "Adjective") {
      finalTargetGender = ["Masculine", "Feminine"].reduce((mostUrgent, current) => {
        return getUrgency('adjective_gender', current) > getUrgency('adjective_gender', mostUrgent) ? current : mostUrgent;
      });
      finalTargetPlurality = ["Singular", "Plural"].reduce((mostUrgent, current) => {
        return getUrgency('adjective_plurality', current) > getUrgency('adjective_plurality', mostUrgent) ? current : mostUrgent;
      });

      constraints = [finalTargetGender, finalTargetPlurality];
      
      // Placeholder until Adjective tables are built
      expectedAnswer = `i ${word.albanian}`; 

    } else if (word.type?.startsWith("Noun")) {
      finalTargetCase = grammarRules.noun_cases.reduce((mostUrgent, current) => {
        return getUrgency('noun_case', current) > getUrgency('noun_case', mostUrgent) ? current : mostUrgent;
      });
      finalTargetDefiniteness = ["Definite", "Indefinite"].reduce((mostUrgent, current) => {
        return getUrgency('noun_definiteness', current) > getUrgency('noun_definiteness', mostUrgent) ? current : mostUrgent;
      });
      finalTargetPlurality = ["Singular", "Plural"].reduce((mostUrgent, current) => {
        return getUrgency('noun_plurality', current) > getUrgency('noun_plurality', mostUrgent) ? current : mostUrgent;
      });

      constraints = [finalTargetCase, finalTargetDefiniteness, finalTargetPlurality];
      
      // Placeholder until Noun Declension tables are built
      expectedAnswer = word.albanian; 
    }

    const promptId = Math.random().toString(36).slice(2);
    setCurrentPrompt({
      word: word.english,
      constraints,
      expected: expectedAnswer.toLowerCase(),
      type: word.type,
      promptId,
      id: word.id,
      interval:    word.interval    ?? 0,
      ease_factor: word.ease_factor ?? 2.5,
      streak:      word.streak      ?? 0,
      usefulness:  word.usefulness  ?? 5,
      mastery_score: word.mastery_score ?? 0.0,
      
      // Pass down constraints for DB logging
      targetTense: finalTargetTense,
      targetPronoun: finalTargetPronoun,
      targetCase: finalTargetCase,
      targetDefiniteness: finalTargetDefiniteness,
      targetPlurality: finalTargetPlurality,
      targetGender: finalTargetGender
    });
  }

  const generatePrompt = () => {
    setFeedback(null);
    setUserInput("");
    pickAndSetPrompt(filteredVocabRef.current);
  };

  async function updateMastery(prompt: any, score: number) {
    const supabase = getSupabase();
    if (!supabase) return;

    // 1. Core SM-2 Update for the Word
    const schedule = scheduleSRS(score, prompt.interval, prompt.ease_factor, prompt.streak, prompt.usefulness);

    await supabase.from("vocab").update({
      next_review: schedule.nextReview,
      interval: schedule.newInterval,
      ease_factor: schedule.newEaseFactor,
      streak: schedule.newStreak,
      mastery_score: schedule.newMastery,
      confidence: schedule.newConfidence,
      last_seen: new Date().toISOString(),
    }).eq("id", prompt.id);

    const idx = dbVocabRef.current.findIndex((w: any) => w.id === prompt.id);
    if (idx !== -1) {
      dbVocabRef.current[idx] = { ...dbVocabRef.current[idx], ...schedule };
    }
    const fidx = filteredVocabRef.current.findIndex((w: any) => w.id === prompt.id);
    if (fidx !== -1) {
      filteredVocabRef.current[fidx] = dbVocabRef.current[idx];
    }

    let grammarMasteryId = null;

    // Helper: Global Grammar Metrics Updater
    const updateMetric = async (dType: string, dValue: string) => {
      const oldStat = grammarMetricsRef.current.find(m => m.dimension_type === dType && m.dimension_value === dValue);
      if (oldStat) {
        const newScore = updateGlobalGrammarStat(oldStat.mastery_score, score, oldStat.total_reviews);
        oldStat.mastery_score = newScore;
        oldStat.total_reviews += 1;
        await supabase.from("grammar_metrics").update({
          mastery_score: newScore, total_reviews: oldStat.total_reviews, updated_at: new Date().toISOString()
        }).eq("id", oldStat.id);
      }
    };

    // Helper: Specific Word Grammar Mastery Updater
    const updateSpecificMastery = async (gType: string, gValue: string) => {
      let { data: masteryData } = await supabase.from("grammar_mastery")
        .select("id, mastery_score").eq("vocab_id", prompt.id).eq("grammar_type", gType).eq("grammar_value", gValue).single();

      if (masteryData) {
        grammarMasteryId = masteryData.id;
        const newMastery = updateGlobalGrammarStat(masteryData.mastery_score, score, 5); 
        await supabase.from("grammar_mastery").update({ mastery_score: newMastery, last_seen: new Date().toISOString() }).eq("id", grammarMasteryId);
      } else {
        const { data: newData } = await supabase.from("grammar_mastery").insert({
          vocab_id: prompt.id, grammar_type: gType, grammar_value: gValue, mastery_score: score, last_seen: new Date().toISOString()
        }).select("id").single();
        if (newData) grammarMasteryId = newData.id;
      }
    };

    // 3. Handle Grammar Tracking (Verbs, Nouns, Adjectives)
    if (prompt.type === "Verb") {
      const { targetPronoun, targetTense } = prompt;
      if (targetTense && targetPronoun) {
        await updateSpecificMastery("conjugation", `${targetTense}:${targetPronoun}`);
      }
      if (targetPronoun && targetTense !== "participle") await updateMetric("pronoun", targetPronoun);
      if (targetTense) await updateMetric("tense", targetTense);

    } else if (prompt.type === "Adjective") {
      const { targetGender, targetPlurality } = prompt;
      if (targetGender && targetPlurality) {
        await updateSpecificMastery("adjective_agreement", `${targetGender}:${targetPlurality}`);
        await updateMetric("adjective_gender", targetGender);
        await updateMetric("adjective_plurality", targetPlurality);
      }

    } else if (prompt.type?.startsWith("Noun")) {
      const { targetCase, targetDefiniteness, targetPlurality } = prompt;
      if (targetCase && targetDefiniteness && targetPlurality) {
        await updateSpecificMastery("noun_declension", `${targetCase}:${targetDefiniteness}:${targetPlurality}`);
        await updateMetric("noun_case", targetCase);
        await updateMetric("noun_definiteness", targetDefiniteness);
        await updateMetric("noun_plurality", targetPlurality);
      }
    }

    // 4. Insert Review Log
    await supabase.from("review_logs").insert({ 
      vocab_id: prompt.id, grammar_mastery_id: grammarMasteryId, score, created_at: new Date().toISOString() 
    });
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPrompt || !userInput.trim()) return;
    const score = evaluateAnswer(currentPrompt.expected, userInput, grammarRules.rules.partial_credit_threshold);
    setFeedback({ score, expected: currentPrompt.expected, promptId: currentPrompt.promptId });
    updateMastery(currentPrompt, score);
  };

  if (phase === "loading") {
    return (
      <main className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-white/40">
          <div className="w-8 h-8 border-4 border-white/20 border-t-white/60 rounded-full animate-spin"></div>
          <p className="text-sm">Loading vocabulary...</p>
        </div>
      </main>
    );
  }

  if (phase === "setup") {
    const filteredVocab = applyTypeFilter(dbVocab);
    const dueCount = filteredVocab.filter(w => !w.next_review || new Date(w.next_review) <= new Date()).length;

    return (
      <main className="min-h-screen bg-[#0F172A] text-white flex flex-col items-center justify-center p-6">
        <div className="max-w-lg w-full">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/" className="text-white/40 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </Link>
            <div>
              <p className="text-xs uppercase tracking-widest text-indigo-400 font-semibold">Word Drill · SM-2</p>
              <h1 className="text-2xl font-bold">Choose word types</h1>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-3">
            {TYPE_FILTERS.map(filter => {
              const count = dbVocab.filter(w => filter.match(w.type)).length;
              const active = selectedFilters.has(filter.id);
              return (
                <button
                  key={filter.id} onClick={() => toggleFilter(filter.id)}
                  className={`relative p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                    active ? `bg-gradient-to-br ${filter.color} border-transparent shadow-lg scale-[1.02]` : `bg-white/5 ${filter.border} hover:bg-white/10 hover:scale-[1.01]`
                  }`}
                >
                  {active && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-white/30 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                  )}
                  <span className="text-2xl mb-2 block">{filter.emoji}</span>
                  <p className="font-bold text-sm">{filter.label}</p>
                  <p className="text-xs text-white/60 mt-0.5">{count} words</p>
                </button>
              );
            })}
          </div>

          <div className="text-center">
            <p className="text-white/50 text-sm mb-1">{filteredVocab.length} words in selection</p>
            <p className="text-indigo-400 text-sm font-semibold mb-4">{dueCount} due for review now</p>
            <button
              onClick={startDrill} disabled={filteredVocab.length === 0}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98] text-lg"
            >
              {dueCount > 0 ? `Start Drill → ${dueCount} due` : "Start Drill →"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0F172A] text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full glassmorphism p-8 rounded-2xl shadow-2xl border border-white/10 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>

        <header className="mb-10 text-center relative">
          <button
            onClick={() => { setPhase("setup"); setCurrentPrompt(null); setFeedback(null); setUserInput(""); setCaughtUp(false); }}
            className="absolute left-0 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
            title="Back to type selection"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <p className="text-xs uppercase tracking-widest text-indigo-400 font-semibold mb-2">Drill Mode · SM-2</p>
          <h1 className="text-3xl font-bold tracking-tight">Translate</h1>
        </header>

        {caughtUp && (
          <div className="text-center py-10">
            <p className="text-4xl mb-4">🎉</p>
            <p className="text-xl font-bold text-emerald-400 mb-2">All caught up!</p>
            <p className="text-white/50 text-sm mb-6">No words are due for review right now.<br/>Come back later when more are scheduled.</p>
            <button onClick={() => setPhase("setup")} className="bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-6 rounded-xl transition-colors">
              ← Back to selection
            </button>
          </div>
        )}

        {!caughtUp && currentPrompt && (
          <>
            <section className="text-center mb-8">
              <h2 className="text-4xl font-black text-white mb-6 tracking-tight drop-shadow-md">{currentPrompt.word}</h2>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {currentPrompt.constraints.map((c: string, idx: number) => (
                  <span key={idx} className="bg-indigo-500/20 text-indigo-100 text-xs sm:text-sm font-medium px-3 py-1 rounded-full border border-indigo-400/30 backdrop-blur-sm shadow-sm">
                    {c}
                  </span>
                ))}
              </div>
            </section>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <input
                type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)}
                disabled={!!(feedback && feedback.promptId === currentPrompt?.promptId)} autoFocus autoComplete="off"
                className="w-full bg-black/30 border border-white/10 focus:border-indigo-500 outline-none rounded-xl px-4 py-4 text-center text-xl transition-all disabled:opacity-50"
                placeholder="Type your answer..."
              />

              {(!feedback || feedback.promptId !== currentPrompt?.promptId) ? (
                <button type="submit" disabled={!userInput.trim()} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-indigo-500/20 active:scale-[0.98]">
                  Check
                </button>
              ) : (
                <button type="button" onClick={generatePrompt} className="w-full bg-white text-black font-bold py-4 rounded-xl transition-colors hover:bg-gray-100 active:scale-[0.98]">
                  Next Word
                </button>
              )}
            </form>

            {feedback && feedback.promptId === currentPrompt?.promptId && (
              <div className={`mt-6 p-4 rounded-xl text-center font-medium animate-in fade-in slide-in-from-bottom-2 ${
                feedback.score === 1.0 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" :
                feedback.score > 0    ? "bg-amber-500/20  text-amber-400  border border-amber-500/20"  :
                                        "bg-rose-500/20   text-rose-400   border border-rose-500/20"
              }`}>
                {feedback.score === 1.0 && <p className="text-lg">Perfect! ✓</p>}
                {feedback.score > 0 && feedback.score < 1.0 && <p className="text-lg">Almost! ½</p>}
                {feedback.score === 0.0 && <p className="text-lg">Incorrect!</p>}
                {feedback.score < 1.0 && (
                  <p className="mt-2 text-sm text-white/70">
                    Expected: <span className="font-bold text-white">{feedback.expected}</span>
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}