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

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
};

const TYPE_FILTERS = [
  {
    id: "Verb",
    label: "Verbs",
    emoji: "⚡",
    color: "from-indigo-600 to-purple-600",
    border: "border-indigo-500/40",
    match: (t: string | null) => t === "Verb" || t === "Command",
  },
  {
    id: "Noun",
    label: "Nouns",
    emoji: "📘",
    color: "from-blue-600 to-cyan-600",
    border: "border-blue-500/40",
    match: (t: string | null) => t === "Noun (M)" || t === "Noun (F)",
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
    id: "Phrase",
    label: "Phrases",
    emoji: "💬",
    color: "from-sky-500 to-blue-500",
    border: "border-sky-400/40",
    match: (t: string | null) => t === "Phrase",
  },
  {
    id: "Preposition",
    label: "Prepositions",
    emoji: "🔗",
    color: "from-violet-600 to-indigo-600",
    border: "border-violet-500/40",
    match: (t: string | null) => t === "Preposition",
  },
  {
    id: "New",
    label: "Uncategorized",
    emoji: "📦",
    color: "from-slate-600 to-gray-600",
    border: "border-slate-500/40",
    match: (t: string | null) => !t || t === "Unknown",
  },
];

export default function WordDrill() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "setup" | "drill">("loading");

  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(
    new Set(TYPE_FILTERS.map(f => f.id))
  );

  // Drag to select state
  const [isDragging, setIsDragging] = useState(false);
  const [dragAction, setDragAction] = useState<"select" | "unselect" | null>(null);

  useEffect(() => {
    const handlePointerUp = () => {
      setIsDragging(false);
      setDragAction(null);
    };
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, []);

  const [currentPrompt, setCurrentPrompt] = useState<any>(null);
  const [caughtUp, setCaughtUp] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<{
    score: number;
    expected: string;
    promptId: string;
  } | null>(null);

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

      const { data: nounData } = await supabase.from("noun_declensions").select("*");
      if (nounData) {
        dbNounsRef.current = nounData;
        setDbNouns(nounData);
      }

      const { data: adjData } = await supabase.from("adjective_agreements").select("*");
      if (adjData) {
        dbAdjectivesRef.current = adjData;
        setDbAdjectives(adjData);
      }

      setPhase("setup");
    }
    loadData();
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && feedback && currentPrompt && feedback.promptId === currentPrompt.promptId && !modalWord) {
        e.preventDefault();
        generatePrompt();
      }
    };

    if (phase === "drill") {
      window.addEventListener('keydown', handleGlobalKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [feedback, currentPrompt, phase, modalWord]);

  useEffect(() => {
    if (currentPrompt && !feedback && inputRef.current && !modalWord) {
      inputRef.current.focus();
    }
  }, [currentPrompt, feedback, modalWord]);

  function applyTypeFilter(vocab: any[]) {
    return vocab.filter(word =>
      TYPE_FILTERS.some(f => selectedFilters.has(f.id) && f.match(word.type))
    );
  }

  function toggleFilter(id: string) {
    updateFilter(id, !selectedFilters.has(id));
  }

  function updateFilter(id: string, select: boolean) {
    setSelectedFilters(prev => {
      const next = new Set(prev);
      if (select) {
        next.add(id);
      } else {
        if (next.size > 1) {
          next.delete(id);
        }
      }
      return next;
    });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>, id: string, currentlyActive: boolean) {
    // Release pointer capture so pointer events can fire on sibling elements during drag
    e.currentTarget.releasePointerCapture(e.pointerId); 
    setIsDragging(true);
    const willSelect = !currentlyActive;
    setDragAction(willSelect ? "select" : "unselect");
    updateFilter(id, willSelect);
  }

  function handlePointerEnter(id: string) {
    if (isDragging && dragAction !== null) {
      updateFilter(id, dragAction === "select");
    }
  }

  function startDrill() {
    const filtered = applyTypeFilter(dbVocabRef.current);
    filteredVocabRef.current = filtered;

    setPhase("drill");
    setCaughtUp(false);
    pickAndSetPrompt(filtered);
  }

  function pickAndSetPrompt(vocab: any[]) {
    const word = pickDueWord(vocab);

    if (!word) {
      setCurrentPrompt(null);
      setCaughtUp(true);
      return;
    }

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
      return metric ? metric.importance * (1 - metric.mastery_score) : 2.5;
    };

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

      const adjData = dbAdjectivesRef.current.find(a => a.vocab_id === word.id);
      if (adjData) {
        const colMap: any = {
          "Masculine:Singular": "masc_sg",
          "Feminine:Singular": "fem_sg",
          "Masculine:Plural": "masc_pl",
          "Feminine:Plural": "fem_pl"
        };
        const col = colMap[`${finalTargetGender}:${finalTargetPlurality}`];
        expectedAnswer = adjData[col] || word.albanian;
      }

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

      const nounData = dbNounsRef.current.find(n => n.vocab_id === word.id && n.n_case === finalTargetCase);
      if (nounData) {
        const colMap: any = {
          "Indefinite:Singular": "indef_sg",
          "Definite:Singular": "def_sg",
          "Indefinite:Plural": "indef_pl",
          "Definite:Plural": "def_pl"
        };
        const col = colMap[`${finalTargetDefiniteness}:${finalTargetPlurality}`];
        expectedAnswer = nounData[col] || word.albanian;
      }
    }

    const promptId = Math.random().toString(36).slice(2);
    setCurrentPrompt({
      word: word.english,
      constraints,
      expected: expectedAnswer.toLowerCase(),
      type: word.type,
      promptId,
      id: word.id,
      interval: word.interval ?? 0,
      ease_factor: word.ease_factor ?? 2.5,
      streak: word.streak ?? 0,
      usefulness: word.usefulness ?? 5,
      mastery_score: word.mastery_score ?? 0.0,

      targetTense: finalTargetTense,
      targetPronoun: finalTargetPronoun,
      targetCase: finalTargetCase,
      targetDefiniteness: finalTargetDefiniteness,
      targetPlurality: finalTargetPlurality,
      targetGender: finalTargetGender
    });
  }

  const generatePrompt = () => {
    if (actionLock.current) return;
    actionLock.current = true;

    setFeedback(null);
    setUserInput("");
    setMnemonic(null); // Reset mnemonic state
    pickAndSetPrompt(filteredVocabRef.current);

    setTimeout(() => {
      actionLock.current = false;
    }, 300);
  };

  const handleGenerateMnemonic = async () => {
    if (!currentPrompt) return;
    setIsGeneratingMnemonic(true);
    setMnemonic(null);

    try {
      const res = await fetch('/api/generate-mnemonic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          albanian: currentPrompt.expected,
          english: currentPrompt.word
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMnemonic(data.mnemonic);
      } else {
        alert("Failed to generate mnemonic.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsGeneratingMnemonic(false);
    }
  };

  async function updateMastery(prompt: any, score: number) {
    const supabase = getSupabase();
    if (!supabase) return;

    const schedule = scheduleSRS(score, prompt.interval, prompt.ease_factor, prompt.streak, prompt.usefulness);
    const updatedValues = {
      next_review: schedule.nextReview,
      interval: schedule.newInterval,
      ease_factor: schedule.newEaseFactor,
      streak: schedule.newStreak,
      mastery_score: schedule.newMastery,
      confidence: schedule.newConfidence,
      last_seen: new Date().toISOString()
    };

    await supabase.from("vocab").update(updatedValues).eq("id", prompt.id);

    const idx = dbVocabRef.current.findIndex((w: any) => w.id === prompt.id);
    if (idx !== -1) {
      dbVocabRef.current[idx] = { ...dbVocabRef.current[idx], ...updatedValues };
    }
    const fidx = filteredVocabRef.current.findIndex((w: any) => w.id === prompt.id);
    if (fidx !== -1) {
      filteredVocabRef.current[fidx] = { ...filteredVocabRef.current[fidx], ...updatedValues };
    }

    let grammarMasteryId = null;

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

    await supabase.from("review_logs").insert({
      vocab_id: prompt.id, grammar_mastery_id: grammarMasteryId, score, created_at: new Date().toISOString()
    });
  }

  const handleCheck = () => {
    if (!currentPrompt || actionLock.current || feedback) {
      return;
    }

    actionLock.current = true;

    const finalInput = userInput.trim();
    const score = finalInput === "" ? 0.0 : evaluateAnswer(currentPrompt.expected, finalInput, grammarRules.rules.partial_credit_threshold);

    setFeedback({ score, expected: currentPrompt.expected, promptId: currentPrompt.promptId });
    updateMastery(currentPrompt, score);

    setTimeout(() => {
      actionLock.current = false;
    }, 100);
  };

  const openDictionaryForCurrentWord = () => {
    if (!currentPrompt) return;
    const baseWord = dbVocabRef.current.find(w => w.id === currentPrompt.id);
    if (baseWord) {
      setModalWord(baseWord);
    }
  };

  const handleModalUpdate = (updatedWord: any) => {
    setModalWord(updatedWord);

    // Update local database refs so the drill uses the fixed strings
    const idx = dbVocabRef.current.findIndex(w => w.id === updatedWord.id);
    if (idx !== -1) dbVocabRef.current[idx] = { ...dbVocabRef.current[idx], ...updatedWord };

    const fidx = filteredVocabRef.current.findIndex(w => w.id === updatedWord.id);
    if (fidx !== -1) filteredVocabRef.current[fidx] = { ...filteredVocabRef.current[fidx], ...updatedWord };

    // Dynamically update the current prompt's english if it was just edited
    if (currentPrompt && currentPrompt.id === updatedWord.id) {
      setCurrentPrompt((prev: any) => ({ ...prev, word: updatedWord.english }));
    }
  };

  if (phase === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center pb-20">
        <div className="flex flex-col items-center gap-4 text-slate-400 font-bold">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-pink-400 rounded-full animate-spin"></div>
          <p className="text-sm">Loading vocabulary...</p>
        </div>
      </main>
    );
  }

  if (phase === "setup") {
    const filteredVocab = applyTypeFilter(dbVocab);
    const dueCount = filteredVocab.filter(w => !w.next_review || new Date(w.next_review) <= new Date()).length;

    return (
      <main className="min-h-screen flex flex-col items-center p-6 pt-12 pb-32">
        <div className="max-w-3xl w-full">
          <div className="flex items-center gap-4 mb-8">
            <div>
              <p className="text-xs uppercase tracking-widest text-indigo-400 font-bold">Word Drill · SM-2</p>
              <h1 className="text-3xl font-black text-slate-700 tracking-tight">Tap Word Types</h1>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-5 sm:grid-cols-3">
            {TYPE_FILTERS.map(filter => {
              const count = dbVocab.filter(w => filter.match(w.type)).length;
              const active = selectedFilters.has(filter.id);
              return (
                <button
                  key={filter.id} 
                  onPointerDown={(e) => handlePointerDown(e, filter.id, active)}
                  onPointerEnter={() => handlePointerEnter(filter.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleFilter(filter.id);
                    }
                  }}
                  className={`relative p-3 rounded-[1.25rem] border-2 text-left touch-none transition-all duration-200 ${active ? `bg-gradient-to-br ${filter.color} border-transparent shadow-lg scale-[1.02] text-white` : `bg-white border-slate-100 hover:bg-slate-50 hover:scale-[1.01] text-slate-700 shadow-sm`
                    }`}
                >
                  {active && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-white/30 rounded-full flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    </div>
                  )}
                  <span className="text-2xl mb-1 block">{filter.emoji}</span>
                  <p className="font-bold text-xs sm:text-sm">{filter.label}</p>
                  <p className={`text-[10px] mt-0.5 font-semibold ${active ? 'text-white/80' : 'text-slate-400'}`}>{count} words</p>
                </button>
              );
            })}
          </div>

          <div className="text-center mt-10">
            <p className="text-slate-400 font-bold text-sm mb-1">{filteredVocab.length} words in selection</p>
            <p className="text-indigo-500 text-sm font-black mb-4">{dueCount} due for review now</p>
            <button
              onClick={startDrill} disabled={filteredVocab.length === 0}
              className="w-full max-w-sm mx-auto bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-3 rounded-[2rem] transition-all shadow-[0_4px_14px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.5)] active:scale-[0.96] text-base block"
            >
              {dueCount > 0 ? `Start Drill → ${dueCount} due` : "Start Drill →"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 pb-32">
      <div className="max-w-md w-full cutesy-glass p-7 rounded-[2.25rem] shadow-[0_12px_40px_rgba(99,102,241,0.2)] border-2 border-white/80 relative overflow-hidden">
        
        <header className="mb-8 text-center relative pt-2">
          <p className="text-xs uppercase tracking-widest text-indigo-400 font-bold mb-2">Drill Mode · SM-2</p>
          <h1 className="text-3xl font-black text-slate-700 tracking-tight">Translate</h1>
        </header>

        {caughtUp && (
          <div className="text-center py-10">
            <p className="text-4xl mb-4">🎉</p>
            <p className="text-xl font-bold text-emerald-400 mb-2">All caught up!</p>
            <p className="text-white/50 text-sm mb-6">No words are due for review right now.<br />Come back later when more are scheduled.</p>
            <Link href="/" className="bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-6 rounded-xl transition-colors inline-block">
              ← Back to Hub
            </Link>
          </div>
        )}

        {!caughtUp && currentPrompt && (
          <>
            <section className="text-center mb-8">
              <h2 className="text-4xl font-black text-slate-700 mb-6 tracking-tight drop-shadow-sm">{currentPrompt.word}</h2>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {currentPrompt.constraints.map((c: string, idx: number) => (
                  <span key={idx} className="bg-indigo-100 text-indigo-600 text-[11px] sm:text-xs font-bold px-2 py-1 rounded-full shadow-sm border border-indigo-200">
                    {c}
                  </span>
                ))}
              </div>
            </section>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCheck();
              }}
              className="flex flex-col gap-4"
            >
              <input
                key={`input-${currentPrompt?.promptId}`}
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                ref={inputRef}
                disabled={!!feedback}
                autoComplete="off"
                className="w-full bg-white border-2 border-indigo-100 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100 outline-none rounded-2xl px-3 py-3 text-center text-lg font-bold text-slate-700 transition-all disabled:opacity-50 shadow-inner"
                placeholder="Type your answer..."
              />

              {!feedback && (
                <button type="submit" className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-black py-3 rounded-[2rem] transition-all shadow-[0_4px_14px_rgba(99,102,241,0.4)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.5)] active:scale-[0.96]">
                  {userInput.trim() === "" ? "I don't know (Show Answer)" : "Check"}
                </button>
              )}
            </form>

            {feedback && feedback.promptId === currentPrompt?.promptId && (
              <div className="mt-4 flex flex-col gap-4">
                <button
                  type="button"
                  onClick={generatePrompt}
                  className="w-full bg-slate-800 text-white font-black py-3 rounded-[2rem] transition-all hover:bg-slate-700 active:scale-[0.96] shadow-md"
                >
                  Next Word (Press Enter)
                </button>

                <div className={`p-3 rounded-[1.75rem] text-center font-bold animate-in fade-in slide-in-from-bottom-2 border-2 ${
                  feedback.score === 1.0 ? "bg-emerald-50 text-emerald-500 border-emerald-200" :
                  feedback.score > 0 ? "bg-amber-50 text-amber-500 border-amber-200" :
                  "bg-rose-50 text-rose-500 border-rose-200"
                  }`}>
                  {feedback.score === 1.0 && <p className="text-base">Perfect! <span className="text-lg">✨</span></p>}
                  {feedback.score > 0 && feedback.score < 1.0 && <p className="text-base">Almost! ½</p>}
                  {feedback.score === 0.0 && <p className="text-base">Incorrect!</p>}
                  {feedback.score < 1.0 && (
                    <p className="mt-2 text-sm text-slate-500 font-medium">
                      Expected: <span className="font-black text-slate-700">{feedback.expected}</span>
                    </p>
                  )}

                  {/* Mnemonic Creation Section */}
                  <div className="mt-4 pt-4 border-t border-slate-200/50 text-sm">
                    {!mnemonic && !isGeneratingMnemonic && (
                      <button
                        type="button"
                        onClick={handleGenerateMnemonic}
                        className="flex items-center justify-center gap-2 mx-auto text-indigo-500 hover:text-indigo-400 transition-colors font-bold bg-indigo-50 hover:bg-indigo-100 px-4 py-2 rounded-xl"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" /></svg>
                        Create Mnemonic
                      </button>
                    )}

                    {isGeneratingMnemonic && (
                      <div className="flex items-center justify-center gap-2 text-indigo-400 py-2 font-bold">
                        <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div>
                        Generating hook...
                      </div>
                    )}

                    {mnemonic && (
                      <div className="bg-white border text-slate-600 border-indigo-100 rounded-2xl p-4 text-left shadow-sm animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex items-center gap-2 mb-2 text-indigo-500 font-black border-b border-indigo-50 pb-2">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /></svg>
                          Memory Hook
                        </div>
                        <div
                          className="prose prose-sm max-w-none leading-relaxed font-medium"
                          dangerouslySetInnerHTML={{ __html: mnemonic.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-indigo-600 font-black">$1</strong>') }}
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={openDictionaryForCurrentWord}
                    className="mt-4 flex items-center justify-center gap-2 mx-auto text-sm text-slate-400 hover:text-indigo-500 font-bold transition-colors hover:bg-indigo-50 px-3 py-1.5 rounded-xl"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
                    View Grammar Details
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <DictionaryModal
        word={modalWord}
        onClose={() => setModalWord(null)}
        onUpdate={handleModalUpdate}
      />

    </main>
  );
}