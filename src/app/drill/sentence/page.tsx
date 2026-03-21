"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  evaluateAnswer, 
  scheduleSRS, 
  pickDueWord
} from "@/lib/logic";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
};

// ────────────────────────────────────────────────────────────────
// UI Component: Interactive Dictionary Modal
// ────────────────────────────────────────────────────────────────
const DictionaryModal = ({ word, onClose }: { word: any | null; onClose: () => void }) => {
  const [grammarData, setGrammarData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!word) return;
    
    const fetchGrammar = async () => {
      setLoading(true);
      const supabase = getSupabase();
      if (!supabase) return;

      try {
        if (word.type === "Verb" || word.type === "Command") {
          const { data } = await supabase.from('conjugations').select('*').eq('vocab_id', word.id);
          setGrammarData(data || []);
        } else if (word.type === "Adjective") {
          const { data } = await supabase.from('adjective_agreements').select('*').eq('vocab_id', word.id);
          setGrammarData(data || []);
        } else if (word.type?.startsWith("Noun")) {
          const { data } = await supabase.from('noun_declensions').select('*').eq('vocab_id', word.id);
          setGrammarData(data || []);
        } else {
          setGrammarData([]); 
        }
      } catch (err) {
        console.error("Failed to fetch grammar details", err);
      } finally {
        setLoading(false);
      }
    };

    fetchGrammar();
  }, [word]);

  if (!word) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="glassmorphism w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 shadow-2xl relative text-left">
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors p-2 bg-white/5 hover:bg-white/10 rounded-full"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>

        <div className="p-6 md:p-8">
          <div className="mb-6">
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-1 block">
              {word.type || "Uncategorized"}
            </span>
            <h2 className="text-3xl font-black text-white">{word.albanian}</h2>
            <p className="text-lg text-white/60 mt-1">{word.english}</p>
          </div>

          <div className="border-t border-white/10 pt-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 opacity-50">
                 <div className="w-6 h-6 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin mb-2"></div>
                 <p className="text-sm">Fetching grammar matrices...</p>
              </div>
            ) : grammarData && grammarData.length > 0 ? (
              word.type === "Verb" || word.type === "Command" ? (
                <div className="space-y-6">
                  {grammarData.map((conj, idx) => (
                    <div key={idx} className="bg-black/30 rounded-xl border border-white/5 overflow-hidden">
                      <div className="bg-white/5 px-4 py-2 border-b border-white/5 font-semibold text-sm text-indigo-300">
                        {conj.mood_tense?.replace(/_/g, ' ')?.toUpperCase() || "UNKNOWN TENSE"}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-y-2 p-4 text-sm">
                        <div className="flex justify-between md:block"><span className="text-white/40 mr-2 md:block md:mb-1">Unë</span> <span className="font-medium">{conj.une || "—"}</span></div>
                        <div className="flex justify-between md:block"><span className="text-white/40 mr-2 md:block md:mb-1">Ti</span> <span className="font-medium">{conj.ti || "—"}</span></div>
                        <div className="flex justify-between md:block"><span className="text-white/40 mr-2 md:block md:mb-1">Ai/Ajo</span> <span className="font-medium">{conj.ai_ajo || "—"}</span></div>
                        <div className="flex justify-between md:block"><span className="text-white/40 mr-2 md:block md:mb-1">Ne</span> <span className="font-medium">{conj.ne || "—"}</span></div>
                        <div className="flex justify-between md:block"><span className="text-white/40 mr-2 md:block md:mb-1">Ju</span> <span className="font-medium">{conj.ju || "—"}</span></div>
                        <div className="flex justify-between md:block"><span className="text-white/40 mr-2 md:block md:mb-1">Ata/Ato</span> <span className="font-medium">{conj.ata_ato || "—"}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : 
              word.type?.startsWith("Noun") ? (
                <div className="space-y-6">
                  {grammarData.map((decl, idx) => (
                    <div key={idx} className="bg-black/30 rounded-xl border border-white/5 overflow-hidden">
                      <div className="bg-white/5 px-4 py-2 border-b border-white/5 font-semibold text-sm text-sky-300">
                        {decl.n_case?.toUpperCase() || "UNKNOWN CASE"}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 text-sm">
                        <div className="space-y-2">
                           <div className="text-xs text-white/30 uppercase tracking-widest font-bold">Singular</div>
                           <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-white/50">Indef.</span> <span className="font-medium">{decl.indef_sg || "—"}</span></div>
                           <div className="flex justify-between"><span className="text-white/50">Def.</span> <span className="font-medium">{decl.def_sg || "—"}</span></div>
                        </div>
                        <div className="space-y-2">
                           <div className="text-xs text-white/30 uppercase tracking-widest font-bold mt-4 md:mt-0">Plural</div>
                           <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-white/50">Indef.</span> <span className="font-medium">{decl.indef_pl || "—"}</span></div>
                           <div className="flex justify-between"><span className="text-white/50">Def.</span> <span className="font-medium">{decl.def_pl || "—"}</span></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : 
              word.type === "Adjective" ? (
                <div className="space-y-6">
                  {grammarData.map((agr, idx) => (
                    <div key={idx} className="bg-black/30 rounded-xl border border-white/5 overflow-hidden">
                      <div className="bg-white/5 px-4 py-2 border-b border-white/5 font-semibold text-sm text-emerald-300">
                        {agr.adj_case?.toUpperCase() || "UNKNOWN CASE"}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 text-sm">
                         <div className="space-y-2">
                           <div className="text-xs text-white/30 uppercase tracking-widest font-bold">Singular</div>
                           <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-white/50">Indef. Masc.</span> <span className="font-medium">{agr.indef_masc_sg || "—"}</span></div>
                           <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-white/50">Def. Masc.</span> <span className="font-medium">{agr.def_masc_sg || "—"}</span></div>
                           <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-white/50">Indef. Fem.</span> <span className="font-medium">{agr.indef_fem_sg || "—"}</span></div>
                           <div className="flex justify-between"><span className="text-white/50">Def. Fem.</span> <span className="font-medium">{agr.def_fem_sg || "—"}</span></div>
                        </div>
                        <div className="space-y-2">
                           <div className="text-xs text-white/30 uppercase tracking-widest font-bold mt-4 md:mt-0">Plural</div>
                           <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-white/50">Indef. Masc.</span> <span className="font-medium">{agr.indef_masc_pl || "—"}</span></div>
                           <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-white/50">Def. Masc.</span> <span className="font-medium">{agr.def_masc_pl || "—"}</span></div>
                           <div className="flex justify-between border-b border-white/5 pb-1"><span className="text-white/50">Indef. Fem.</span> <span className="font-medium">{agr.indef_fem_pl || "—"}</span></div>
                           <div className="flex justify-between"><span className="text-white/50">Def. Fem.</span> <span className="font-medium">{agr.def_fem_pl || "—"}</span></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null
            ) : (
              <div className="text-center py-8 text-white/40">
                <p>No grammar matrices needed or available for this word.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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
  
  const [dbVocab, setDbVocab] = useState<any[]>([]);
  const dbVocabRef = useRef<any[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  
  // THE IRON DOOR
  const actionLock = useRef(false);

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      if (!supabase) { setPhase("setup"); return; }
      
      const { data: vocabData } = await supabase
        .from("vocab")
        .select("*, sentences(id, blanked_albanian, target_albanian, target_english, english_translation)")
        .not('sentences', 'is', null);
        
      if (vocabData) {
        const validVocab = vocabData.filter(v => v.sentences && v.sentences.length > 0);
        dbVocabRef.current = validVocab;
        setDbVocab(validVocab);
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
      promptId,
      blanked_albanian: randomSentence.blanked_albanian,
      target_english: randomSentence.target_english,
      expected: randomSentence.target_albanian.toLowerCase(),
      english_translation: randomSentence.english_translation,
      type: word.type,
      
      // SRS Data
      interval:    word.interval    ?? 0,
      ease_factor: word.ease_factor ?? 2.5,
      streak:      word.streak      ?? 0,
      usefulness:  word.usefulness  ?? 5,
      mastery_score: word.mastery_score ?? 0.0,
    });
  }

  const generatePrompt = () => {
    if (actionLock.current) return;
    actionLock.current = true;

    setFeedback(null);
    setUserInput("");
    pickAndSetPrompt(dbVocabRef.current);

    setTimeout(() => {
      actionLock.current = false;
    }, 300);
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

    await supabase.from("vocab").update(updatedValues).eq("id", prompt.vocab_id);

    const idx = dbVocabRef.current.findIndex((w: any) => w.id === prompt.vocab_id);
    if (idx !== -1) {
      dbVocabRef.current[idx] = { ...dbVocabRef.current[idx], ...updatedValues };
    }

    await supabase.from("review_logs").insert({ 
      vocab_id: prompt.vocab_id, 
      score, 
      created_at: new Date().toISOString() 
    });
  }

  const handleCheck = () => {
    // Absolutely block evaluation if there is already feedback or if we're locked
    if (!currentPrompt || actionLock.current || feedback) {
      return; 
    }

    actionLock.current = true;
    
    const finalInput = userInput.trim();
    const score = finalInput === "" ? 0.0 : evaluateAnswer(currentPrompt.expected, finalInput, 0.8);
    
    setFeedback({ score, expected: currentPrompt.expected, promptId: currentPrompt.promptId });
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

  const renderSentence = (text: string) => {
    const parts = text.split("___");
    if (parts.length !== 2) return <span className="text-white">{text}</span>;
    return (
      <span className="leading-relaxed">
        {parts[0]}
        <span className="inline-block border-b-2 border-emerald-400 w-16 mx-1 opacity-50 relative top-1"></span>
        {parts[1]}
      </span>
    );
  };

  if (phase === "loading") {
    return (
      <main className="min-h-screen bg-[#0F172A] text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-white/40">
          <div className="w-8 h-8 border-4 border-white/20 border-t-white/60 rounded-full animate-spin"></div>
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
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
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
              {dueCount > 0 ? `${dueCount} ready for review right now.` : `All caught up!`}
            </p>

            <button
              onClick={startDrill} disabled={dbVocabRef.current.length === 0}
              className="w-full max-w-sm mx-auto bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98] text-lg block"
            >
              {dueCount > 0 ? `Start Context Drill` : "Start Context Drill"}
            </button>
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
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </Link>
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold mb-2">Context Drill</p>
          <h1 className="text-3xl font-bold tracking-tight">Fill the Blank</h1>
        </header>

        {caughtUp && (
          <div className="text-center py-10">
            <p className="text-4xl mb-4">🎉</p>
            <p className="text-xl font-bold text-emerald-400 mb-2">All caught up!</p>
            <p className="text-white/50 text-sm mb-6">You've completed all available context drills.<br/>Generate more sentences in the Manage tab.</p>
            <Link href="/" className="bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-6 rounded-xl transition-colors inline-block">
              ← Back to Hub
            </Link>
          </div>
        )}

        {!caughtUp && currentPrompt && (
          <>
            <section className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-medium text-white/90 mb-8 leading-tight drop-shadow-md">
                "{renderSentence(currentPrompt.blanked_albanian)}"
              </h2>
              
              <div className="bg-white/5 border border-white/10 rounded-xl py-3 px-6 inline-block mx-auto">
                <span className="text-white/50 text-sm uppercase tracking-widest block mb-1">Target Word</span>
                <span className="text-emerald-400 font-bold text-xl">{currentPrompt.target_english}</span>
              </div>
            </section>

            {/* ONLY THE CHECK LOGIC LIVES IN THE FORM */}
            <form 
              onSubmit={(e) => { 
                e.preventDefault(); 
                handleCheck(); 
              }} 
              className="flex flex-col gap-4"
            >
              <input
                key={`input-${currentPrompt?.promptId}`}
                type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)}
                ref={inputRef}
                disabled={!!(feedback && feedback.promptId === currentPrompt?.promptId)} autoComplete="off"
                className="w-full bg-black/30 border border-white/10 focus:border-emerald-500 outline-none rounded-xl px-4 py-4 text-center text-xl transition-all disabled:opacity-50"
                placeholder="Type the missing Albanian word..."
              />

              {!feedback && (
                <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-emerald-500/20 active:scale-[0.98]">
                  Check
                </button>
              )}
            </form>

            {/* THE NEXT BUTTON IS NOW 100% OUTSIDE OF THE FORM */}
            {feedback && feedback.promptId === currentPrompt?.promptId && (
              <div className="mt-4 flex flex-col gap-4">
                <button 
                  type="button" 
                  onClick={generatePrompt} 
                  className="w-full bg-white text-black font-bold py-4 rounded-xl transition-colors hover:bg-gray-100 active:scale-[0.98]"
                >
                  Next Sentence (Press Enter)
                </button>
                
                <div className={`p-6 rounded-xl text-center font-medium animate-in fade-in slide-in-from-bottom-2 ${
                  feedback.score === 1.0 ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20" :
                  feedback.score > 0    ? "bg-amber-500/10  text-amber-300  border border-amber-500/20"  :
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

                  <div className="mt-4 pt-4 border-t border-white/10 text-sm">
                    <p className="text-white/60 mb-1">Full Translation:</p>
                    <p className="text-white font-medium italic">"{currentPrompt.english_translation}"</p>
                  </div>
                  
                  <button 
                    type="button" 
                    onClick={openDictionaryForCurrentWord}
                    className="mt-5 flex items-center justify-center gap-2 mx-auto text-sm text-white/50 hover:text-white transition-colors hover:bg-white/5 px-3 py-1.5 rounded-lg"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    View Grammar Details
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <DictionaryModal word={modalWord} onClose={() => setModalWord(null)} />

    </main>
  );
}