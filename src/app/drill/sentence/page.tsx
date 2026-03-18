"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { evaluateAnswer } from "@/lib/logic";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
};

export default function SentenceDrill() {
  const [currentPrompt, setCurrentPrompt] = useState<any>(null);
  const [userInput, setUserInput] = useState("");
  const [feedback, setFeedback] = useState<{ score: number; expected: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dbVocab, setDbVocab] = useState<any[]>([]);
  const [appReady, setAppReady] = useState(false);
  const dbVocabRef = useRef<any[]>([]);

  useEffect(() => {
    async function loadVocab() {
      const supabase = getSupabase();
      if (!supabase) { setAppReady(true); return; }
      const { data, error } = await supabase.from("vocab").select("*");
      if (!error && data) {
        dbVocabRef.current = data;
        setDbVocab(data);
      }
      setAppReady(true);
    }
    loadVocab();
  }, []);

  const generateSentence = async () => {
    const vocab = dbVocabRef.current;
    if (vocab.length === 0) return;

    setLoading(true);
    setFeedback(null);
    setUserInput("");
    
    setTimeout(() => {
      const targetWord = vocab[Math.floor(Math.random() * vocab.length)];
      
      const mockLLMResponses: Record<string, any> = {
        "Verb": {
          english: "I will go to the store tomorrow.",
          albanian: "Unë do të shkoj në dyqan nesër.",
          constraints: ["Future Tense", "Unë (I)", "Indicative"],
        },
        "Adjective": {
          english: "She has a beautiful house.",
          albanian: "Ajo ka një shtëpi të bukur.",
          constraints: ["Feminine Singular", "Accusative"],
        },
        "Noun (M)": {
          english: "I read an interesting book.",
          albanian: "Unë lexova një libër interesant.",
          constraints: ["Accusative", "Indefinite", "Singular"],
        }
      };

      const typeKey = Object.keys(mockLLMResponses).includes(targetWord.type) ? targetWord.type : "Verb";
      const response = mockLLMResponses[typeKey];

      setCurrentPrompt({
        targetWord: targetWord.english,
        englishSentence: response.english,
        albanianSentence: response.albanian,
        constraints: response.constraints
      });
      setLoading(false);
    }, 1500);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPrompt) return;
    const score = evaluateAnswer(currentPrompt.albanianSentence, userInput, 0.85);
    setFeedback({ score, expected: currentPrompt.albanianSentence });
  };

  return (
    <main className="min-h-screen bg-[#0F172A] text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full glassmorphism p-8 md:p-12 rounded-2xl shadow-2xl border border-white/10 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/20 rounded-full blur-[100px] pointer-events-none"></div>
        
        <header className="mb-10 text-center relative">
          <Link href="/" className="absolute left-0 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </Link>
          <p className="text-xs uppercase tracking-widest text-emerald-400 font-semibold mb-2">Sentence Drill</p>
          <h1 className="text-3xl font-bold tracking-tight">Translate Context</h1>
        </header>

        {!appReady ? (
          <div className="text-center py-10 opacity-50">Loading database...</div>
        ) : dbVocab.length === 0 ? (
          <div className="text-center py-10 border border-rose-500/20 bg-rose-500/10 rounded-xl">
            <p className="text-rose-400 font-semibold mb-2">No words found in database!</p>
            <p className="text-sm">Head back to the Hub and add vocabulary via &apos;Manage Vocab&apos; to begin sentence drilling.</p>
          </div>
        ) : (
          <>
            {!currentPrompt && !loading && (
              <div className="text-center py-10">
                <p className="text-white/60 mb-6">Hit generate to create a custom sentence focusing on your weakest grammar points.</p>
                <button onClick={generateSentence} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]">
                  Generate Sentence
                </button>
              </div>
            )}

            {loading && (
              <div className="text-center py-16 flex flex-col items-center gap-4 text-emerald-400">
                <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin"></div>
                <p className="text-sm font-medium animate-pulse">Generating a sentence...</p>
              </div>
            )}

            {currentPrompt && !loading && (
              <>
                <section className="text-center mb-10">
                  <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
                    <span className="bg-indigo-500/20 text-indigo-300 text-xs px-3 py-1 rounded-full border border-indigo-500/20" title="Target Word">
                      Target: {currentPrompt.targetWord}
                    </span>
                    {currentPrompt.constraints.map((c: string, idx: number) => (
                      <span key={idx} className="bg-white/10 text-white/80 text-xs px-3 py-1 rounded-full border border-white/5 backdrop-blur-sm">
                        {c}
                      </span>
                    ))}
                  </div>
                  <h2 className="text-3xl md:text-4xl font-light leading-snug text-white mb-2 tracking-tight drop-shadow-md">
                    &ldquo;{currentPrompt.englishSentence}&rdquo;
                  </h2>
                </section>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <textarea
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    disabled={feedback !== null}
                    autoFocus
                    rows={3}
                    className="w-full bg-black/30 border border-white/10 focus:border-emerald-500 outline-none rounded-xl px-6 py-4 text-center text-xl transition-all disabled:opacity-50 resize-none"
                    placeholder="Type the Albanian translation..."
                  />
                  
                  {feedback === null ? (
                    <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-emerald-500/20 active:scale-[0.98]">
                      Check Sentence
                    </button>
                  ) : (
                    <button type="button" onClick={generateSentence} className="w-full bg-white text-black font-bold py-4 rounded-xl transition-colors hover:bg-gray-100 active:scale-[0.98]">
                      Next Sentence
                    </button>
                  )}
                </form>

                {feedback !== null && (
                  <div className={`mt-6 p-6 rounded-xl text-center font-medium animate-in fade-in slide-in-from-bottom-2 ${
                    feedback.score === 1.0 ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20" :
                    feedback.score > 0 ? "bg-amber-500/20 text-amber-400 border border-amber-500/20" :
                    "bg-rose-500/20 text-rose-400 border border-rose-500/20"
                  }`}>
                    {feedback.score === 1.0 && <p className="text-lg">Perfect Translation! ✓</p>}
                    {feedback.score > 0 && feedback.score < 1.0 && <p className="text-lg">Close enough!</p>}
                    {feedback.score === 0.0 && <p className="text-lg">Needs work!</p>}
                    {feedback.score < 1.0 && (
                      <div className="mt-4 pt-4 border-t border-white/10">
                        <p className="text-sm text-white/50 uppercase tracking-widest mb-1">Expected</p>
                        <p className="font-bold text-white text-lg">{feedback.expected}</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
