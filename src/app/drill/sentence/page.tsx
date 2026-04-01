"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { evaluateAnswer, scheduleSRS, pickDueWord, updateGlobalGrammarStat } from "@/lib/logic";
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
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentPrompt, setCurrentPrompt] = useState<any>(null);
  const [caughtUp, setCaughtUp] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<{ score: number; expected: string; promptId: string; } | null>(null);

  const [modalWord, setModalWord] = useState<any | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [isGeneratingMnemonic, setIsGeneratingMnemonic] = useState(false);

  // NEW STATE: For the Sentence Explanation
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isGeneratingExplanation, setIsGeneratingExplanation] = useState(false);

  const [dbVocab, setDbVocab] = useState<any[]>([]);
  const dbVocabRef = useRef<any[]>([]);
  const [grammarMetrics, setGrammarMetrics] = useState<any[]>([]);
  const grammarMetricsRef = useRef<any[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const actionLock = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showTarget, setShowTarget] = useState(false);

  // --- PERSISTENCE: Save State ---
  useEffect(() => {
    if (phase !== "loading") {
      const stateToSave = { phase, currentPrompt, userInput, feedback, caughtUp, showTarget, explanation };
      sessionStorage.setItem('sentence_drill_state', JSON.stringify(stateToSave));
    }
  }, [phase, currentPrompt, userInput, feedback, caughtUp, showTarget, explanation]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setPhase("loading");
    const supabase = getSupabase();
    if (!supabase) { setLoadError("Supabase is not configured."); setPhase("setup"); return; }
    setLoadError(null);

    // Purge old sentences (older than 14 days) on page load
    try {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      const { error: purgeError } = await supabase.from('sentences').delete().lt('created_at', twoWeeksAgo.toISOString());
      if (purgeError) console.error("Sentence Purge Failed:", purgeError);
    } catch (e) {
      console.error("Purge Exception:", e);
    }

    const { data: metricsData } = await supabase.from("grammar_metrics").select("*");
    if (metricsData) { grammarMetricsRef.current = metricsData; setGrammarMetrics(metricsData); }

    const { data: vocabData, error: vocabErr } = await supabase
      .from("vocab")
      .select("*, sentences(id, blanked_albanian, target_albanian, target_english, english_translation, grammar_type, grammar_value)");

    if (vocabErr) {
      console.error("Failed to fetch vocab + sentences:", vocabErr);
      setLoadError("Couldn't load sentence data from Supabase.");
    }

    if (vocabData) {
      const validVocab = vocabData.filter(v => v.sentences && v.sentences.length > 0);
      dbVocabRef.current = validVocab;
      setDbVocab(validVocab);
    } else {
      dbVocabRef.current = []; setDbVocab([]);
    }

    // --- PERSISTENCE: Rehydrate ---
    const saved = sessionStorage.getItem('sentence_drill_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      setPhase(parsed.phase);
      setCurrentPrompt(parsed.currentPrompt);
      setUserInput(parsed.userInput);
      setFeedback(parsed.feedback);
      setCaughtUp(parsed.caughtUp);
      setShowTarget(parsed.showTarget || false);
      setExplanation(parsed.explanation || null);
    } else {
      setPhase("setup");
    }
  }

  const handleGenerateSentences = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate-sentences', { method: 'POST' });
      const data = await res.json();
      if (res.ok) { alert(data.message || "Sentences generated successfully!"); await loadData(); }
      else { alert("Error: " + (data.error || "Failed to generate sentences. Check console.")); }
    } catch (err) {
      console.error(err); alert("An error occurred while calling the sentence generator.");
    } finally { setIsGenerating(false); }
  };

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
    if (currentPrompt && !feedback && inputRef.current && !modalWord) { inputRef.current.focus(); }
  }, [currentPrompt, feedback, modalWord]);

  function startDrill() {
    setPhase("drill"); setCaughtUp(false); setShowTarget(false); pickAndSetPrompt(dbVocabRef.current);
  }

  function pickAndSetPrompt(vocab: any[]) {
    const word = pickDueWord(vocab);
    if (!word) { setCurrentPrompt(null); setCaughtUp(true); return; }
    setCaughtUp(false);

    const sentences = word.sentences;
    const randomSentence = sentences[Math.floor(Math.random() * sentences.length)];
    const promptId = Math.random().toString(36).slice(2);

    setCurrentPrompt({
      vocab_id: word.id, sentence_id: randomSentence.id, promptId,
      blanked_albanian: randomSentence.blanked_albanian, target_english: randomSentence.target_english,
      expected: randomSentence.target_albanian.toLowerCase(), english_translation: randomSentence.english_translation,
      grammar_type: randomSentence.grammar_type, grammar_value: randomSentence.grammar_value, type: word.type,
      interval: word.interval ?? 0, ease_factor: word.ease_factor ?? 2.5, streak: word.streak ?? 0,
      usefulness: word.usefulness ?? 5, mastery_score: word.mastery_score ?? 0.0,
    });
  }

  const generatePrompt = () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setFeedback(null);
    setUserInput("");
    setMnemonic(null);
    setExplanation(null); // Clear explanation state on next
    setShowTarget(false);
    pickAndSetPrompt(dbVocabRef.current);
    setTimeout(() => { actionLock.current = false; }, 300);
  };

  const handleGenerateMnemonic = async () => {
    if (!currentPrompt) return;
    setIsGeneratingMnemonic(true); setMnemonic(null);
    try {
      const res = await fetch('/api/generate-mnemonic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albanian: currentPrompt.expected, english: currentPrompt.target_english })
      });
      const data = await res.json();
      if (res.ok) setMnemonic(data.mnemonic);
      else alert("Failed to generate mnemonic.");
    } catch (err) { console.error(err); }
    finally { setIsGeneratingMnemonic(false); }
  };

  // NEW FUNCTION: Request grammar explanation from Gemini with precise error catching
  const handleExplainSentence = async () => {
    if (!currentPrompt) return;
    setIsGeneratingExplanation(true); setExplanation(null);
    try {
      // Reconstruct the full sentence by swapping the blank with the target word
      const fullAlbanianSentence = currentPrompt.blanked_albanian.replace("___", currentPrompt.expected);
      const res = await fetch('/api/explain-sentence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albanian_sentence: fullAlbanianSentence, english_translation: currentPrompt.english_translation })
      });
      const data = await res.json();

      if (res.ok) {
        setExplanation(data.explanation);
      } else {
        // This will expose the *exact* error to you on the screen
        alert(`API Error: ${data.error || "Failed to generate explanation."}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Network Error: ${err.message}`);
    } finally {
      setIsGeneratingExplanation(false);
    }
  };

  async function updateMastery(prompt: any, score: number) {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Supabase client not initialized");

      const schedule = scheduleSRS(score, prompt.interval, prompt.ease_factor, prompt.streak, prompt.usefulness);
      const updatedValues = {
        next_review: schedule.nextReview, interval: schedule.newInterval, ease_factor: schedule.newEaseFactor,
        streak: schedule.newStreak, mastery_score: schedule.newMastery, confidence: schedule.newConfidence, last_seen: new Date().toISOString()
      };

      await supabase.from("vocab").update(updatedValues).eq("id", prompt.vocab_id);

      const idx = dbVocabRef.current.findIndex((w: any) => w.id === prompt.vocab_id);
      if (idx !== -1) { dbVocabRef.current[idx] = { ...dbVocabRef.current[idx], ...updatedValues }; }

      let grammarMasteryId = null;

      if (prompt.grammar_type && prompt.grammar_value) {
        const gType = prompt.grammar_type;
        const gValue = prompt.grammar_value;

        const updateMetric = async (dType: string, dValue: string) => {
          const oldStat = grammarMetricsRef.current.find(m => m.dimension_type === dType && m.dimension_value === dValue);
          if (oldStat) {
            const newScore = updateGlobalGrammarStat(oldStat.mastery_score, score, oldStat.total_reviews);
            oldStat.mastery_score = newScore; oldStat.total_reviews += 1;
            await supabase.from("grammar_metrics").update({
              mastery_score: newScore, total_reviews: oldStat.total_reviews, updated_at: new Date().toISOString()
            }).eq("id", oldStat.id);
          }
        };

        let { data: masteryData } = await supabase.from("grammar_mastery").select("id, mastery_score").eq("vocab_id", prompt.vocab_id).eq("grammar_type", gType).eq("grammar_value", gValue).single();

        if (masteryData) {
          grammarMasteryId = masteryData.id;
          const newMastery = updateGlobalGrammarStat(masteryData.mastery_score, score, 5);
          await supabase.from("grammar_mastery").update({ mastery_score: newMastery, last_seen: new Date().toISOString() }).eq("id", grammarMasteryId);
        } else {
          const { data: newData } = await supabase.from("grammar_mastery").insert({
            vocab_id: prompt.vocab_id, grammar_type: gType, grammar_value: gValue, mastery_score: score, last_seen: new Date().toISOString()
          }).select("id").single();
          if (newData) grammarMasteryId = newData.id;
        }

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

      await supabase.from("review_logs").insert({ vocab_id: prompt.vocab_id, grammar_mastery_id: grammarMasteryId, score, created_at: new Date().toISOString() });

    } catch (err) {
      console.error("Critical failure executing updateMastery database calls:", err);
    }
  }

  const handleCheck = () => {
    if (!currentPrompt || actionLock.current || feedback) return;
    actionLock.current = true;
    const finalInput = userInput.trim();
    const score = finalInput === "" ? 0.0 : evaluateAnswer(currentPrompt.expected, finalInput, 0.8);

    setFeedback({ score, expected: currentPrompt.expected, promptId: currentPrompt.promptId });
    setShowTarget(true); updateMastery(currentPrompt, score);
    setTimeout(() => { actionLock.current = false; }, 100);
  };

  const openDictionaryForCurrentWord = () => {
    // Only allow opening the dictionary if feedback exists
    if (!currentPrompt || !feedback) return;
    const baseWord = dbVocabRef.current.find(w => w.id === currentPrompt.vocab_id);
    if (baseWord) setModalWord(baseWord);
  };

  const handleModalUpdate = (updatedWord: any) => {
    setModalWord(updatedWord);
    const idx = dbVocabRef.current.findIndex(w => w.id === updatedWord.id);
    if (idx !== -1) dbVocabRef.current[idx] = { ...dbVocabRef.current[idx], ...updatedWord };
  };

  if (phase === "loading") {
    return (
      <main className="min-h-[100dvh] bg-[#fafafa] flex items-center justify-center pb-[calc(env(safe-area-inset-bottom)+80px)]">
        <div className="flex flex-col items-center gap-4 text-slate-400 font-bold">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-400 rounded-full animate-spin"></div>
        </div>
      </main>
    );
  }

  if (phase === "setup") {
    const dueCount = dbVocabRef.current.filter(w => !w.next_review || new Date(w.next_review) <= new Date()).length;
    if (loadError) {
      return (
        <main className="min-h-[100dvh] bg-[#fafafa] flex items-center justify-center p-6 pb-[calc(env(safe-area-inset-bottom)+5rem)]">
          <div className="max-w-md w-full bg-white/80 backdrop-blur-xl p-8 rounded-[2.5rem] border-2 border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] text-center">
            <h2 className="text-2xl font-black text-slate-700 mb-3">Couldn't load sentences</h2>
            <p className="text-sm text-slate-500 font-bold mb-6">{loadError}</p>
            <button type="button" onClick={() => loadData()} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 rounded-[2rem] transition-all shadow-md active:scale-95">
              Retry
            </button>
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-[100dvh] bg-[#fafafa] flex flex-col items-center p-6 pt-12 sm:pt-20 pb-[calc(env(safe-area-inset-bottom)+5rem)] select-none">
        <div className="max-w-md sm:max-w-3xl w-full">

          <header className="mb-8 text-center sm:text-left">
            <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-600 font-bold text-sm mb-4 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Home
            </Link>
            <h1 className="text-3xl sm:text-5xl font-black text-slate-700 tracking-tight mb-2">Context Drill</h1>
            <p className="text-slate-500 font-bold text-sm sm:text-base">Practice words in native sentences.</p>
          </header>

          <div className="bg-white/80 backdrop-blur-xl p-8 sm:p-12 rounded-[2.5rem] sm:rounded-[3rem] border-2 border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] text-center mb-8 flex flex-col justify-center items-center">
            <h2 className="text-6xl sm:text-7xl font-black mb-2 sm:mb-4 text-slate-800 tracking-tight">{dbVocabRef.current.length}</h2>
            <p className="text-slate-400 font-bold mb-8 uppercase tracking-widest text-xs sm:text-sm">Words unlocked</p>

            <p className="text-emerald-500 font-black mb-6 sm:mb-8 bg-emerald-50 inline-block px-4 sm:px-6 py-1.5 sm:py-2.5 rounded-full text-sm sm:text-base">
              {dueCount > 0 ? `${dueCount} ready for review` : `No sentences due`}
            </p>

            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center w-full max-w-lg">
              <button onClick={startDrill} disabled={dbVocabRef.current.length === 0} className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:scale-100 text-white font-black py-4 sm:py-5 rounded-[2rem] transition-all shadow-[0_8px_20px_rgba(16,185,129,0.3)] active:scale-95 text-lg sm:text-xl">
                Start Session
              </button>

              <button onClick={handleGenerateSentences} disabled={isGenerating} className="w-full bg-slate-50 hover:bg-slate-100 border-2 border-slate-200 text-slate-600 font-bold py-4 sm:py-5 rounded-[2rem] transition-colors flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 text-sm sm:text-base shadow-sm">
                {isGenerating ? (
                  <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-slate-300 border-t-emerald-500 rounded-full animate-spin"></div>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" className="text-emerald-500 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" /></svg>
                )}
                {isGenerating ? "Generating..." : "Generate More"}
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#fafafa] flex flex-col items-center justify-start sm:justify-center p-4 pt-8 sm:p-8 pb-[calc(env(safe-area-inset-bottom)+5rem)] select-none">
      <div className="max-w-md sm:max-w-xl md:max-w-2xl w-full bg-white/80 backdrop-blur-xl p-6 sm:p-10 rounded-[2.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] border-2 border-white relative">

        <header className="mb-6 sm:mb-8 text-center relative">
          <button onClick={() => { setPhase("setup"); sessionStorage.removeItem('sentence_drill_state'); }} className="absolute left-0 top-0 text-slate-300 hover:text-slate-500 transition-colors p-2 sm:p-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-7 sm:h-7"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>

          <button
            onClick={openDictionaryForCurrentWord}
            disabled={!feedback}
            className={`absolute right-0 top-0 transition-colors p-2 sm:p-2.5 rounded-full ${!feedback ? 'text-slate-300 bg-slate-50 opacity-50 cursor-not-allowed' : 'text-emerald-500 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-600 shadow-sm'}`}
            title="Grammar Details"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
          </button>

          <p className="text-xs uppercase tracking-widest text-slate-400 font-bold pt-2 sm:pt-1">Fill the Blank</p>
        </header>

        {caughtUp && (
          <div className="text-center py-12 sm:py-16">
            <p className="text-5xl sm:text-6xl mb-4 animate-bounce">🎉</p>
            <p className="text-2xl sm:text-3xl font-black text-slate-700 mb-2 sm:mb-4">All caught up!</p>
            <p className="text-slate-400 text-sm sm:text-base mb-8 font-bold">You crushed your sentences for now.</p>
            <button onClick={() => { setPhase("setup"); sessionStorage.removeItem('sentence_drill_state'); }} className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-3 sm:py-3.5 px-6 sm:px-8 rounded-full transition-colors inline-flex items-center gap-2 sm:text-base">
              Back to Hub
            </button>
          </div>
        )}

        {!caughtUp && currentPrompt && (() => {
          const sentenceParts = currentPrompt.blanked_albanian ? currentPrompt.blanked_albanian.split("___") : ["", ""];
          return (
            <form onSubmit={(e) => { e.preventDefault(); handleCheck(); }} className="flex flex-col w-full">
              <div className="text-center mb-8 sm:mb-10">
                <div className="text-2xl sm:text-3xl font-black text-slate-800 mb-6 sm:mb-8 md:leading-relaxed block">
                  {sentenceParts[0]}
                  <input
                    key={`input-${currentPrompt?.promptId}`}
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    ref={inputRef}
                    disabled={!!(feedback && feedback.promptId === currentPrompt?.promptId)}
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
                    className="inline-block mx-2 w-32 sm:w-48 bg-slate-50 border-b-4 border-x-0 border-t-0 border-emerald-300 focus:border-emerald-500 outline-none px-2 py-1 sm:py-2 text-center text-emerald-600 font-black transition-all disabled:opacity-50 text-xl sm:text-2xl"
                  />
                  {sentenceParts[1]}
                </div>

                <div className="inline-flex items-center justify-center gap-2 sm:gap-3">
                  <span className="text-slate-400 font-bold text-xs sm:text-sm uppercase tracking-widest">Target:</span>
                  {showTarget ? (
                    <span className="text-emerald-500 font-black animate-in fade-in bg-emerald-50 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-md sm:text-base">{currentPrompt.target_english}</span>
                  ) : (
                    <button type="button" onClick={() => setShowTarget(true)} className="text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-full transition-colors active:scale-95">
                      Reveal Hint
                    </button>
                  )}
                </div>
              </div>

              {!feedback && (
                <button type="button" onClick={handleCheck} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 sm:py-4 rounded-[1.5rem] transition-all shadow-[0_4px_14px_rgba(16,185,129,0.3)] active:scale-95 text-lg sm:text-xl mt-2 sm:mt-3">
                  {userInput.trim() === "" ? "Show Answer" : "Check"}
                </button>
              )}

              {feedback && feedback.promptId === currentPrompt?.promptId && (
                <div className="mt-4 sm:mt-5 flex flex-col gap-3 sm:gap-4 animate-in fade-in slide-in-from-bottom-2">

                  <div className={`p-4 sm:p-5 rounded-[1.5rem] text-center font-bold border-2 ${feedback.score === 1.0 ? "bg-emerald-50 text-emerald-600 border-emerald-200" :
                      feedback.score > 0 ? "bg-amber-50 text-amber-600 border-amber-200" :
                        "bg-rose-50 text-rose-600 border-rose-200"
                    }`}>
                    <p className="text-lg sm:text-xl mb-1 sm:mb-1.5">{feedback.score === 1.0 ? "Perfect! ✨" : feedback.score > 0 ? "Almost!" : "Incorrect."}</p>

                    {feedback.score < 1.0 && (
                      <p className="text-sm sm:text-base text-slate-500">
                        Missing Word: <span className="font-black text-slate-800 text-base sm:text-lg">{feedback.expected}</span>
                      </p>
                    )}

                    <div className="mt-4 sm:mt-4 pt-4 sm:pt-4 border-t border-slate-200/50 text-sm sm:text-sm text-left px-2 sm:px-3">
                      <p className="text-slate-400 font-bold mb-1 text-[11px] uppercase tracking-wider">Full Translation</p>
                      <p className="text-slate-700 font-medium italic">"{currentPrompt.english_translation}"</p>
                    </div>
                  </div>

                  <div className="flex gap-2 sm:gap-3 w-full">
                    {!mnemonic && !isGeneratingMnemonic && (
                      <button onClick={handleGenerateMnemonic} type="button" className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold py-3 sm:py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform text-sm sm:text-base">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5"><path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" /><path d="M16.24 16.24l2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" /></svg>
                        Hint
                      </button>
                    )}
                    {isGeneratingMnemonic && (
                      <div className="flex-1 bg-slate-50 text-emerald-400 font-bold py-3 sm:py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm sm:text-base">
                        <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-emerald-200 border-t-emerald-500 rounded-full animate-spin"></div>
                      </div>
                    )}

                    {!explanation && !isGeneratingExplanation && (
                      <button onClick={handleExplainSentence} type="button" className="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-500 font-bold py-3 sm:py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform text-sm sm:text-base">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5"><line x1="22" y1="12" x2="2" y2="12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /><line x1="6" y1="16" x2="6.01" y2="16" /><line x1="10" y1="16" x2="10.01" y2="16" /></svg>
                        Explain
                      </button>
                    )}
                    {isGeneratingExplanation && (
                      <div className="flex-1 bg-slate-50 text-indigo-400 font-bold py-3 sm:py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm sm:text-base">
                        <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin"></div>
                      </div>
                    )}

                    <button onClick={generatePrompt} type="button" className="flex-[2] bg-slate-800 hover:bg-slate-700 text-white font-black py-3 sm:py-3.5 rounded-xl active:scale-95 transition-transform shadow-md text-sm sm:text-base flex items-center justify-center gap-2">
                      Next <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                    </button>
                  </div>

                  {mnemonic && (
                    <div className="bg-white border-2 border-emerald-100 rounded-[1.5rem] p-4 sm:p-5 text-left shadow-sm mt-1 sm:mt-2">
                      <div className="prose prose-sm leading-snug font-medium text-slate-600"
                        dangerouslySetInnerHTML={{ __html: mnemonic.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-emerald-600 font-black">$1</strong>') }}
                      />
                    </div>
                  )}

                  {explanation && (
                    <div className="bg-white border-2 border-indigo-100 rounded-[1.5rem] p-4 sm:p-5 text-left shadow-sm mt-1 sm:mt-2">
                      <div className="prose prose-sm leading-snug font-medium text-slate-600 space-y-2"
                        dangerouslySetInnerHTML={{ __html: explanation.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-indigo-600 font-black">$1</strong>') }}
                      />
                    </div>
                  )}
                </div>
              )}
            </form>
          );
        })()}
      </div>

      <DictionaryModal word={modalWord} onClose={() => setModalWord(null)} onUpdate={handleModalUpdate} />
    </main>
  );
}