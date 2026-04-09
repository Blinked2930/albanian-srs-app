"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { evaluateAnswer } from "@/lib/logic";
import DictionaryModal from "@/components/DictionaryModal";
import { supabase, isDemoMode } from "@/lib/supabaseClient";

export default function CramDrill() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "drill" | "done">("loading");
  
  const [currentPrompt, setCurrentPrompt] = useState<any>(null);
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<{ score: number; expected: string; promptId: string; } | null>(null);

  // Hint & Dictionary State
  const [modalWord, setModalWord] = useState<any | null>(null);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [isGeneratingMnemonic, setIsGeneratingMnemonic] = useState(false);

  const [dbVocab, setDbVocab] = useState<any[]>([]);
  const dbVocabRef = useRef<any[]>([]);
  
  // Cram Logic: Track consecutive correct answers (Target: 3 per word)
  const [wordProgress, setWordProgress] = useState<Record<string, number>>({});
  const wordProgressRef = useRef<Record<string, number>>({});

  const inputRef = useRef<HTMLInputElement>(null);
  const actionLock = useRef(false);

  // --- PERSISTENCE: Save State ---
  useEffect(() => {
    if (phase !== "loading") {
      const stateToSave = { 
        phase, currentPrompt, userInput, feedback, 
        wordProgress: wordProgressRef.current, 
        dbVocab: dbVocabRef.current 
      };
      sessionStorage.setItem('cram_drill_state', JSON.stringify(stateToSave));
    }
  }, [phase, currentPrompt, userInput, feedback, wordProgress]);

  useEffect(() => {
    async function loadData() {
      // --- PERSISTENCE: Rehydrate ---
      const savedState = sessionStorage.getItem('cram_drill_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        setPhase(parsed.phase);
        setCurrentPrompt(parsed.currentPrompt);
        setUserInput(parsed.userInput);
        setFeedback(parsed.feedback);
        setWordProgress(parsed.wordProgress);
        wordProgressRef.current = parsed.wordProgress;
        setDbVocab(parsed.dbVocab);
        dbVocabRef.current = parsed.dbVocab;
        return; // Exit early if we loaded from memory
      }

      const stored = sessionStorage.getItem('cram_vocab_ids');
      if (!stored) { router.push('/'); return; }
      
      const ids = JSON.parse(stored);
      if (ids.length === 0) { router.push('/'); return; }

      const { data, error } = await supabase.from("vocab").select("*").in('id', ids);
      if (error || !data) { router.push('/'); return; }

      setDbVocab(data);
      dbVocabRef.current = data;
      
      // Initialize progress to 0 for all selected words
      const initialProgress: Record<string, number> = {};
      data.forEach((v: any) => initialProgress[v.id] = 0);
      setWordProgress(initialProgress);
      wordProgressRef.current = initialProgress;

      setPhase("drill");
      pickNextWord(data, initialProgress, null);
    }
    loadData();
  }, [router]);

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

  function pickNextWord(vocabList: any[], progressMap: Record<string, number>, lastWordId: string | null) {
    const activeWords = vocabList.filter((w: any) => (progressMap[w.id] || 0) < 3);
    
    if (activeWords.length === 0) {
      setPhase("done");
      return;
    }

    let selectable = activeWords;
    if (activeWords.length > 1 && lastWordId) {
      selectable = activeWords.filter((w: any) => w.id !== lastWordId);
    }

    const nextWord = selectable[Math.floor(Math.random() * selectable.length)];
    
    setCurrentPrompt({
      id: nextWord.id,
      word: nextWord.english, 
      expected: nextWord.albanian.toLowerCase(), 
      type: nextWord.type,
      promptId: Math.random().toString(36).slice(2), 
      next_review: nextWord.next_review
    });
  }

  const generatePrompt = () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setFeedback(null); 
    setUserInput(""); 
    setMnemonic(null); 
    pickNextWord(dbVocabRef.current, wordProgressRef.current, currentPrompt?.id);
    setTimeout(() => { actionLock.current = false; }, 300);
  };

  const handleGenerateMnemonic = async () => {
    if (!currentPrompt) return;
    if (isDemoMode) {
      setMnemonic(`✨ **Ghost Mode:**\n\nAI generation is turned off for guests. In the real app, Gemini generates custom mnemonic stories here!`);
      return;
    }
    
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

  async function handleCramMastery(prompt: any, score: number) {
    const currentProg = wordProgressRef.current[prompt.id] || 0;
    const newProg = score === 1.0 ? currentProg + 1 : 0; 
    
    const updatedProgress = { ...wordProgressRef.current, [prompt.id]: newProg };
    setWordProgress(updatedProgress);
    wordProgressRef.current = updatedProgress;

    // GHOST MODE: Do not persist changes to the database
    if (isDemoMode) return;

    if (!prompt.next_review) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await supabase.from('vocab').update({ next_review: tomorrow.toISOString() }).eq('id', prompt.id);
      
      const idx = dbVocabRef.current.findIndex((w: any) => w.id === prompt.id);
      if (idx !== -1) dbVocabRef.current[idx].next_review = tomorrow.toISOString();
    }
  }

  const handleCheck = () => {
    if (!currentPrompt || actionLock.current || feedback) return;
    actionLock.current = true;
    const finalInput = userInput.trim();
    const score = finalInput === "" ? 0.0 : evaluateAnswer(currentPrompt.expected, finalInput, 0.9);
    
    setFeedback({ score, expected: currentPrompt.expected, promptId: currentPrompt.promptId });
    handleCramMastery(currentPrompt, score);
    setTimeout(() => { actionLock.current = false; }, 100);
  };

  const openDictionaryForCurrentWord = () => {
    if (!currentPrompt || !feedback) return;
    const baseWord = dbVocabRef.current.find((w: any) => w.id === currentPrompt.id);
    if (baseWord) setModalWord(baseWord);
  };

  const handleModalUpdate = (updatedWord: any) => {
    setModalWord(updatedWord);
    const idx = dbVocabRef.current.findIndex((w: any) => w.id === updatedWord.id);
    if (idx !== -1) {
      dbVocabRef.current[idx] = { ...dbVocabRef.current[idx], ...updatedWord };
      setDbVocab([...dbVocabRef.current]);
    }
    if (currentPrompt && currentPrompt.id === updatedWord.id) {
      setCurrentPrompt((prev: any) => ({ ...prev, word: updatedWord.english, expected: updatedWord.albanian.toLowerCase() }));
    }
  };

  const handlePause = () => {
    sessionStorage.setItem('cram_explicitly_paused', 'true');
    router.push('/');
  };

  if (phase === "loading") {
    return (
      <main className="min-h-screen bg-[#fafafa] flex items-center justify-center pb-[calc(env(safe-area-inset-bottom)+80px)]">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-rose-500 rounded-full animate-spin"></div>
      </main>
    );
  }

  const totalPointsNeeded = dbVocab.length * 3;
  const currentTotalPoints = Object.values(wordProgress).reduce((sum, val) => sum + val, 0);
  const progressPercent = totalPointsNeeded > 0 ? (currentTotalPoints / totalPointsNeeded) * 100 : 0;
  const currentWordPoints = currentPrompt ? (wordProgress[currentPrompt.id] || 0) : 0;

  return (
    <main className="min-h-[100dvh] bg-[#fafafa] flex flex-col items-center justify-start sm:justify-center p-4 pt-8 sm:p-8 pb-[calc(env(safe-area-inset-bottom)+5rem)] select-none">
      
      {isDemoMode && (
        <div className="fixed top-4 left-4 z-[400] bg-slate-800 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg tracking-widest uppercase border-2 border-slate-600 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          Ghost Mode: Read Only
        </div>
      )}

      <div className="max-w-md sm:max-w-xl md:max-w-2xl w-full bg-white/80 backdrop-blur-xl p-6 sm:p-10 rounded-[2.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] border-2 border-rose-50 relative">
        
        <header className="mb-6 sm:mb-8 text-center relative">
          <button onClick={handlePause} className="absolute left-0 top-0 text-slate-300 hover:text-slate-500 transition-colors p-2 sm:p-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-7 sm:h-7"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          
          <button 
            onClick={openDictionaryForCurrentWord} 
            disabled={!feedback}
            className={`absolute right-0 top-0 transition-colors p-2 sm:p-2.5 rounded-full ${!feedback ? 'text-slate-300 bg-slate-50 opacity-50 cursor-not-allowed' : 'text-rose-500 bg-rose-50 hover:bg-rose-100 hover:text-rose-600 shadow-sm'}`} 
            title="Grammar Details"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          </button>
          
          <div className="pt-2 sm:pt-0">
            <span className="text-xs sm:text-sm uppercase tracking-widest text-rose-400 font-black bg-rose-50 px-4 py-1.5 rounded-full inline-flex items-center gap-2">
              🔥 Cram Mode
            </span>
          </div>

          {phase === "drill" && (
            <div className="w-full bg-slate-100 h-2 sm:h-2.5 rounded-full mt-6 sm:mt-8 overflow-hidden shadow-inner">
              <div className="bg-rose-400 h-full transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }}></div>
            </div>
          )}
        </header>

        {phase === "done" && (
          <div className="text-center py-12 sm:py-16 animate-in zoom-in-95 duration-500">
            <p className="text-5xl sm:text-6xl mb-4 animate-bounce">🔥</p>
            <p className="text-2xl sm:text-3xl font-black text-slate-700 mb-2 sm:mb-4">Session Complete!</p>
            <p className="text-slate-400 text-sm sm:text-base mb-8 font-bold">You successfully looped all words 3 times.</p>
            
            <Link href="/" onClick={() => {
              sessionStorage.removeItem('cram_drill_state');
              sessionStorage.removeItem('cram_explicitly_paused');
            }} className="bg-rose-500 hover:bg-rose-400 text-white font-black py-3 sm:py-3.5 px-6 sm:px-8 rounded-full transition-all active:scale-95 inline-flex items-center gap-2 sm:text-base shadow-[0_4px_14px_rgba(244,63,94,0.3)]">
               Return to Dashboard
            </Link>
          </div>
        )}

        {phase === "drill" && currentPrompt && (
          <>
            <section className="text-center mb-8 sm:mb-10">
              <h2 className="text-4xl sm:text-5xl font-black text-slate-800 mb-4 tracking-tight">{currentPrompt.word}</h2>
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                <span className="bg-slate-100 text-slate-500 text-[11px] sm:text-xs font-black px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md border border-slate-200/60 uppercase tracking-wide">
                  {currentPrompt.type || "Vocab"}
                </span>
                <div className="flex gap-1.5 ml-1 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                   {[1, 2, 3].map(i => (
                     <div key={i} className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-colors duration-300 ${i <= currentWordPoints ? 'bg-rose-400 shadow-sm' : 'bg-slate-200'}`}></div>
                   ))}
                </div>
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
                className="w-full bg-slate-50 border-2 border-slate-200 focus:border-rose-400 focus:bg-white outline-none rounded-[1.5rem] px-4 py-4 sm:px-5 sm:py-4 text-center text-xl sm:text-2xl font-bold text-slate-700 transition-all disabled:opacity-50 shadow-inner"
                placeholder="Type in Albanian..."
              />

              {!feedback && (
                <button type="submit" className="w-full bg-rose-500 hover:bg-rose-400 text-white font-black py-4 sm:py-4 rounded-[1.5rem] transition-all shadow-[0_4px_14px_rgba(244,63,94,0.3)] active:scale-95 text-lg sm:text-xl mt-2 sm:mt-3">
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
                  <p className="text-lg sm:text-xl mb-1">{feedback.score === 1.0 ? "Perfect! ✨" : feedback.score > 0 ? "Almost!" : "Incorrect. Streak Reset."}</p>
                  
                  {feedback.score < 1.0 && (
                    <p className="text-sm sm:text-base text-slate-500">
                      Answer: <span className="font-black text-slate-800 text-base sm:text-lg">{feedback.expected}</span>
                    </p>
                  )}
                </div>

                <div className="flex gap-2 sm:gap-3">
                  {!mnemonic && !isGeneratingMnemonic && (
                    <button onClick={handleGenerateMnemonic} type="button" className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-500 font-bold py-3 sm:py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform text-sm sm:text-base">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg>
                      Hint
                    </button>
                  )}
                  {isGeneratingMnemonic && (
                     <div className="flex-1 bg-slate-50 text-rose-400 font-bold py-3 sm:py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm sm:text-base">
                        <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin"></div>
                     </div>
                  )}
                  
                  <button onClick={generatePrompt} type="button" className="flex-[2] bg-slate-800 hover:bg-slate-700 text-white font-black py-3 sm:py-3.5 rounded-xl active:scale-95 transition-transform shadow-md text-sm sm:text-base flex items-center justify-center gap-2">
                    Next <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="sm:w-5 sm:h-5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  </button>
                </div>

                {mnemonic && (
                  <div className="bg-white border-2 border-rose-100 rounded-[1.5rem] p-4 sm:p-5 text-left shadow-sm mt-1">
                    <div className="prose prose-sm leading-snug font-medium text-slate-600"
                      dangerouslySetInnerHTML={{ __html: mnemonic.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-rose-600 font-black">$1</strong>') }}
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