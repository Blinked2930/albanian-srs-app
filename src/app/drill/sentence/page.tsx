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
import { createClient } from "@supabase/supabase-js";
import DictionaryModal from "@/components/DictionaryModal";

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
};

export default function SentenceDrill() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "setup" | "drill">("loading");

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

  // Grammar Metrics State
  const [grammarMetrics, setGrammarMetrics] = useState<any[]>([]);
  const grammarMetricsRef = useRef<any[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const actionLock = useRef(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [showTarget, setShowTarget] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setPhase("loading");
    const supabase = getSupabase();
    if (!supabase) { setPhase("setup"); return; }

    // Fetch global metrics
    const { data: metricsData } = await supabase.from("grammar_metrics").select("*");
    if (metricsData) {
      grammarMetricsRef.current = metricsData;
      setGrammarMetrics(metricsData);
    }

    // Fetch sentences WITH the newly added SM-2 tracking fields
    const { data: vocabData } = await supabase
      .from("vocab")
      .select("*, sentences(id, blanked_albanian, target_albanian, target_english, english_translation, grammar_type, grammar_value, next_review, interval, ease_factor, streak, usefulness, mastery_score, confidence)")
      .not('sentences', 'is', null);

    if (vocabData) {
      const validVocab = vocabData.filter(v => v.sentences && v.sentences.length > 0);
      dbVocabRef.current = validVocab;
      setDbVocab(validVocab);
    }

    setPhase("setup");
  }

  const handleGenerateSentences = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate-sentences', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        alert(data.message || "Sentences generated successfully!");
        await loadData();
      } else {
        alert("Error: " + (data.error || "Failed to generate sentences. Check console."));
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while calling the sentence generator.");
    } finally {
      setIsGenerating(false);
    }
  };

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

    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [feedback, currentPrompt, phase, modalWord]);

  useEffect(() => {
    if (currentPrompt && !feedback && inputRef.current && !modalWord) {
      inputRef.current.focus();
    }
  }, [currentPrompt, feedback, modalWord]);

  function startDrill() {
    setPhase("drill");
    setCaughtUp(false);
    setShowTarget(false);
    pickAndSetPrompt(dbVocabRef.current);
  }

  function pickAndSetPrompt(vocab: any[]) {
    const word = pickDueWord(vocab);

    if (!word) {
      setCurrentPrompt(null);
      setCaughtUp(true);
      return;
    }

    setCaughtUp(false);

    const sentences = word.sentences;
    const randomSentence = sentences[Math.floor(Math.random() * sentences.length)];

    const promptId = Math.random().toString(36).slice(2);
    setCurrentPrompt({
      vocab_id: word.id,
      sentence_id: randomSentence.id, // Explicitly grab the sentence ID
      promptId,
      blanked_albanian: randomSentence.blanked_albanian,
      target_english: randomSentence.target_english,
      expected: randomSentence.target_albanian.toLowerCase(),
      english_translation: randomSentence.english_translation,
      grammar_type: randomSentence.grammar_type,
      grammar_value: randomSentence.grammar_value,
      type: word.type,

      // SRS Data (Using the word's baseline so they stay synced)
      interval: word.interval ?? 0,
      ease_factor: word.ease_factor ?? 2.5,
      streak: word.streak ?? 0,
      usefulness: word.usefulness ?? 5,
      mastery_score: word.mastery_score ?? 0.0,
    });
  }

  const generatePrompt = () => {
    if (actionLock.current) return;
    actionLock.current = true;

    setFeedback(null);
    setUserInput("");
    setMnemonic(null); // Reset mnemonic state on next prompt
    setShowTarget(false); // Reset target visibility
    pickAndSetPrompt(dbVocabRef.current);

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
          english: currentPrompt.target_english
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
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Supabase client not initialized");

      // 1. Calculate unified SRS schedule
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

      // 2. Update Vocab Table
      const { error: vocabErr } = await supabase.from("vocab").update(updatedValues).eq("id", prompt.vocab_id);
      if (vocabErr) console.error("Vocab update failed:", vocabErr);

      const idx = dbVocabRef.current.findIndex((w: any) => w.id === prompt.vocab_id);
      if (idx !== -1) {
        dbVocabRef.current[idx] = { ...dbVocabRef.current[idx], ...updatedValues };
      }

      // 3. Update Sentences Table simultaneously 
      const { error: sentErr } = await supabase.from("sentences").update(updatedValues).eq("id", prompt.sentence_id);
      if (sentErr) console.error("Sentence update failed:", sentErr);

      // 4. Parse AI Grammar String & Distribute Global Grammar Updates
      let grammarMasteryId = null;

      if (prompt.grammar_type && prompt.grammar_value) {
        const gType = prompt.grammar_type;
        const gValue = prompt.grammar_value;

        const updateMetric = async (dType: string, dValue: string) => {
          const oldStat = grammarMetricsRef.current.find(m => m.dimension_type === dType && m.dimension_value === dValue);
          if (oldStat) {
            const newScore = updateGlobalGrammarStat(oldStat.mastery_score, score, oldStat.total_reviews);
            oldStat.mastery_score = newScore;
            oldStat.total_reviews += 1;
            const { error: metricErr } = await supabase.from("grammar_metrics").update({
              mastery_score: newScore, total_reviews: oldStat.total_reviews, updated_at: new Date().toISOString()
            }).eq("id", oldStat.id);
            if (metricErr) console.error(`Grammar metric update failed for ${dType}:`, metricErr);
          }
        };

        // Word-specific grammar mastery
        let { data: masteryData } = await supabase.from("grammar_mastery")
          .select("id, mastery_score").eq("vocab_id", prompt.vocab_id).eq("grammar_type", gType).eq("grammar_value", gValue).single();

        if (masteryData) {
          grammarMasteryId = masteryData.id;
          const newMastery = updateGlobalGrammarStat(masteryData.mastery_score, score, 5);
          const { error: specErr } = await supabase.from("grammar_mastery").update({ mastery_score: newMastery, last_seen: new Date().toISOString() }).eq("id", grammarMasteryId);
          if (specErr) console.error("Specific grammar mastery update failed:", specErr);
        } else {
          const { data: newData, error: newSpecErr } = await supabase.from("grammar_mastery").insert({
            vocab_id: prompt.vocab_id, grammar_type: gType, grammar_value: gValue, mastery_score: score, last_seen: new Date().toISOString()
          }).select("id").single();
          if (newSpecErr) console.error("Failed to insert new specific grammar mastery:", newSpecErr);
          if (newData) grammarMasteryId = newData.id;
        }

        // Splitting logic for multidimensional global tracking
        if (gType === "conjugation") {
          const [tense, pronoun] = gValue.split(":");
          if (tense && tense !== "participle") await updateMetric("tense", tense);
          if (tense === "participle") await updateMetric("tense", "participle");
          if (pronoun) await updateMetric("pronoun", pronoun);
        } else if (gType === "noun_declension") {
          const [n_case, definiteness, plurality] = gValue.split(":");
          if (n_case) await updateMetric("noun_case", n_case);
          if (definiteness) await updateMetric("noun_definiteness", definiteness);
          if (plurality) await updateMetric("noun_plurality", plurality);
        } else if (gType === "adjective_agreement") {
          const [gender, plurality] = gValue.split(":");
          if (gender) await updateMetric("adjective_gender", gender);
          if (plurality) await updateMetric("adjective_plurality", plurality);
        }
      }

      // 5. Log the review event
      const { error: logErr } = await supabase.from("review_logs").insert({
        vocab_id: prompt.vocab_id,
        grammar_mastery_id: grammarMasteryId,
        score,
        created_at: new Date().toISOString()
      });
      if (logErr) console.error("Review log insertion failed:", logErr);

    } catch (err) {
      console.error("Critical failure executing updateMastery database calls:", err);
    }
  }

  const handleCheck = () => {
    if (!currentPrompt || actionLock.current || feedback) {
      return;
    }

    actionLock.current = true;

    const finalInput = userInput.trim();
    const score = finalInput === "" ? 0.0 : evaluateAnswer(currentPrompt.expected, finalInput, 0.8);

    setFeedback({ score, expected: currentPrompt.expected, promptId: currentPrompt.promptId });
    setShowTarget(true);
    updateMastery(currentPrompt, score);

    setTimeout(() => {
      actionLock.current = false;
    }, 100);
  };

  const openDictionaryForCurrentWord = () => {
    if (!currentPrompt) return;
    const baseWord = dbVocabRef.current.find(w => w.id === currentPrompt.vocab_id);
    if (baseWord) {
      setModalWord(baseWord);
    }
  };

  const handleModalUpdate = (updatedWord: any) => {
    setModalWord(updatedWord);

    // Update local database ref so the drill uses the fixed string
    const idx = dbVocabRef.current.findIndex(w => w.id === updatedWord.id);
    if (idx !== -1) dbVocabRef.current[idx] = { ...dbVocabRef.current[idx], ...updatedWord };
  };

  if (phase === "loading") {
    return (
      <main className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-white/40">
          <div className="w-8 h-8 border-4 border-white/20 border-t-emerald-400 rounded-full animate-spin"></div>
          <p className="text-sm">Loading context drills...</p>
        </div>
      </main>
    );
  }

  if (phase === "setup") {
    const dueCount = dbVocabRef.current.filter(w => !w.next_review || new Date(w.next_review) <= new Date()).length;

    return (
      <main className="min-h-screen bg-[#0F172A] text-white flex flex-col items-center justify-center p-6">
        <div className="max-w-3xl w-full">
          <div className="flex items-center gap-4 mb-8">
            <Link href="/" className="text-white/40 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </Link>
            <div>
              <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold">Context Drill · SM-2</p>
              <h1 className="text-2xl font-bold">Sentence Immersion</h1>
            </div>
          </div>

          <div className="glassmorphism p-8 rounded-2xl border border-white/10 text-center mb-8">
            <h2 className="text-4xl font-black mb-2">{dbVocabRef.current.length}</h2>
            <p className="text-white/50 mb-6">Words with available sentences</p>

            <p className="text-emerald-400 font-medium mb-6">
              {dueCount > 0 ? `${dueCount} ready for review right now.` : `No sentences currently due.`}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto">
              <button
                onClick={startDrill} disabled={dbVocabRef.current.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] text-lg block"
              >
                {dueCount > 0 ? `Start Context Drill` : "Start Context Drill"}
              </button>

              <button
                onClick={handleGenerateSentences}
                disabled={isGenerating}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold py-4 rounded-xl transition-colors flex flex-col items-center justify-center gap-1 active:scale-95 disabled:opacity-50 text-sm"
              >
                {isGenerating ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin"></div>
                    Generating...
                  </div>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" className="text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" /></svg>
                    Generate More Sentences
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0F172A] text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-xl w-full glassmorphism p-8 rounded-2xl shadow-2xl border border-white/10 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none"></div>

        <header className="mb-10 text-center relative">
          <Link
            href="/"
            className="absolute left-0 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
            title="Back to Hub"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </Link>
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold mb-2">Context Drill</p>
          <h1 className="text-3xl font-bold tracking-tight">Fill the Blank</h1>
        </header>

        {caughtUp && (
          <div className="text-center py-10">
            <p className="text-4xl mb-4">🎉</p>
            <p className="text-xl font-bold text-emerald-400 mb-2">All caught up!</p>
            <p className="text-white/50 text-sm mb-8">You've completed all available context drills.</p>

            <div className="flex flex-col gap-4 max-w-xs mx-auto">
              <button
                onClick={handleGenerateSentences}
                disabled={isGenerating}
                className="w-full bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-medium py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {isGenerating ? (
                  <div className="w-5 h-5 border-2 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin"></div>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>
                )}
                {isGenerating ? "Generating..." : "Generate Sentences"}
              </button>

              <Link href="/" className="bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-6 rounded-xl transition-colors inline-block w-full">
                ← Back to Hub
              </Link>
            </div>
          </div>
        )}

        {!caughtUp && currentPrompt && (() => {
          const sentenceParts = currentPrompt.blanked_albanian ? currentPrompt.blanked_albanian.split("___") : ["", ""];
          return (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCheck();
              }}
              className="flex flex-col w-full"
            >
              {/* Inline Sentence Input Section */}
              <div className="text-center mb-10">
                <div className="text-2xl sm:text-3xl font-medium text-white/90 mb-4 leading-loose drop-shadow-md block">
                  {sentenceParts[0]}
                  <input
                    key={`input-${currentPrompt?.promptId}`}
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCheck();
                      }
                    }}
                    ref={inputRef}
                    disabled={!!(feedback && feedback.promptId === currentPrompt?.promptId)}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    className="inline-block mx-2 w-32 sm:w-40 bg-black/30 border-b-2 border-x-0 border-t-0 border-emerald-500 focus:border-emerald-400 focus:bg-white/5 outline-none px-2 py-1 text-center text-emerald-400 font-bold transition-all disabled:opacity-50"
                    autoFocus
                  />
                  {sentenceParts[1]}
                </div>

                <div className="inline-flex mt-2 items-center justify-center gap-2">
                  <span className="text-white/40 text-xs uppercase tracking-widest">Target:</span>
                  {showTarget ? (
                    <span className="text-emerald-400 font-semibold animate-in fade-in">{currentPrompt.target_english}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowTarget(true)}
                      className="text-xs bg-white/10 hover:bg-white/20 text-white/70 px-2 py-1 rounded transition-colors border border-white/10"
                    >
                      Reveal
                    </button>
                  )}
                </div>
              </div>

              {!feedback && (
                <button
                  type="button"
                  onClick={handleCheck}
                  className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-emerald-500/20 active:scale-[0.98]">
                  {userInput.trim() === "" ? "I don't know (Show Answer)" : "Check"}
                </button>
              )}

              {/* Feedback Section */}
              {feedback && feedback.promptId === currentPrompt?.promptId && (
                <div className="mt-4 flex flex-col gap-4">
                  <button
                    type="button"
                    onClick={generatePrompt}
                    className="w-full bg-white text-black font-bold py-4 rounded-xl transition-colors hover:bg-gray-100 active:scale-[0.98]"
                  >
                    Next Sentence (Press Enter)
                  </button>

                  <div className={`p-6 rounded-xl text-center font-medium animate-in fade-in slide-in-from-bottom-2 ${feedback.score === 1.0 ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" :
                    feedback.score > 0 ? "bg-amber-500/10  text-amber-300  border border-amber-500/20" :
                      "bg-rose-500/10   text-rose-300   border border-rose-500/20"
                    }`}>
                    {feedback.score === 1.0 && <p className="text-lg font-bold mb-2">Perfect! ✓</p>}
                    {feedback.score > 0 && feedback.score < 1.0 && <p className="text-lg font-bold mb-2">Almost! ½</p>}
                    {feedback.score === 0.0 && <p className="text-lg font-bold mb-2">Incorrect!</p>}

                    {feedback.score < 1.0 && (
                      <p className="mt-2 text-base text-white/80">
                        The missing word was: <span className="font-bold text-white">{feedback.expected}</span>
                      </p>
                    )}

                    <div className="mt-4 pt-4 border-t border-white/10 text-sm flex flex-col gap-3">
                      <div>
                        <p className="text-white/60 mb-1">Full Translation:</p>
                        <p className="text-white font-medium italic">"{currentPrompt.english_translation}"</p>
                      </div>
                    </div>

                    {/* Mnemonic Creation Section */}
                    <div className="mt-4 pt-4 border-t border-white/10 text-sm">
                      {!mnemonic && !isGeneratingMnemonic && (
                        <button
                          type="button"
                          onClick={handleGenerateMnemonic}
                          className="flex items-center justify-center gap-2 mx-auto text-emerald-400 hover:text-emerald-300 transition-colors font-medium bg-emerald-500/10 hover:bg-emerald-500/20 px-4 py-2 rounded-lg"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" /></svg>
                          Create Mnemonic
                        </button>
                      )}

                      {isGeneratingMnemonic && (
                        <div className="flex items-center justify-center gap-2 text-white/50 py-2">
                          <div className="w-4 h-4 border-2 border-white/20 border-t-emerald-400 rounded-full animate-spin"></div>
                          Generating hook...
                        </div>
                      )}

                      {mnemonic && (
                        <div className="bg-black/40 border border-emerald-500/20 rounded-xl p-4 text-left animate-in fade-in slide-in-from-bottom-2">
                          <div className="flex items-center gap-2 mb-2 text-emerald-400 font-semibold border-b border-emerald-500/20 pb-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /></svg>
                            Memory Hook
                          </div>
                          {/* Rendering the simple markdown bold and newlines cleanly */}
                          <div
                            className="text-white/90 prose prose-invert prose-sm max-w-none leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: mnemonic.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-300">$1</strong>') }}
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={openDictionaryForCurrentWord}
                      className="mt-2 flex items-center justify-center gap-2 mx-auto text-sm text-white/50 hover:text-white transition-colors hover:bg-white/5 px-3 py-1.5 rounded-lg"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
                      View Grammar Details
                    </button>
                  </div>
                </div>
              )}
            </form>
          );
        })()}
      </div>

      <DictionaryModal
        word={modalWord}
        onClose={() => setModalWord(null)}
        onUpdate={handleModalUpdate}
      />

    </main>
  );
}