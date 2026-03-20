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

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
};

// ────────────────────────────────────────────────────────────────
// Word-type filter definitions
// ────────────────────────────────────────────────────────────────
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

export default function WordDrill() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "setup" | "drill">("loading");
  
  const [selectedFilters, setSelectedFilters] = useState<Set<string>>(
    new Set(TYPE_FILTERS.map(f => f.id))
  );
  
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
      // Prevent shortcut if the dictionary modal is open
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
      interval:    word.interval    ?? 0,
      ease_factor: word.ease_factor ?? 2.5,
      streak:      word.streak      ?? 0,
      usefulness:  word.usefulness  ?? 5,
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
    setFeedback(null);
    setUserInput("");
    pickAndSetPrompt(filteredVocabRef.current);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPrompt) return; 
    const finalInput = userInput.trim();
    const score = finalInput === "" ? 0.0 : evaluateAnswer(currentPrompt.expected, finalInput, grammarRules.rules.partial_credit_threshold);
    
    setFeedback({ score, expected: currentPrompt.expected, promptId: currentPrompt.promptId });
    updateMastery(currentPrompt, score);
  };

  const openDictionaryForCurrentWord = () => {
    if (!currentPrompt) return;
    const baseWord = dbVocabRef.current.find(w => w.id === currentPrompt.id);
    if (baseWord) {
      setModalWord(baseWord);
    }
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
        <div className="max-w-3xl w-full">
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

          <div className="text-center mt-10">
            <p className="text-white/50 text-sm mb-1">{filteredVocab.length} words in selection</p>
            <p className="text-indigo-400 text-sm font-semibold mb-4">{dueCount} due for review now</p>
            <button
              onClick={startDrill} disabled={filteredVocab.length === 0}
              className="w-full max-w-sm mx-auto bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98] text-lg block"
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
          <Link
            href="/"
            className="absolute left-0 top-1/2 -translate-y-1/2 text-white/50 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
            title="Back to Hub"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </Link>
          <p className="text-xs uppercase tracking-widest text-indigo-400 font-semibold mb-2">Drill Mode · SM-2</p>
          <h1 className="text-3xl font-bold tracking-tight">Translate</h1>
        </header>

        {caughtUp && (
          <div className="text-center py-10">
            <p className="text-4xl mb-4">🎉</p>
            <p className="text-xl font-bold text-emerald-400 mb-2">All caught up!</p>
            <p className="text-white/50 text-sm mb-6">No words are due for review right now.<br/>Come back later when more are scheduled.</p>
            <Link href="/" className="bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-6 rounded-xl transition-colors inline-block">
              ← Back to Hub
            </Link>
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
                ref={inputRef}
                disabled={!!(feedback && feedback.promptId === currentPrompt?.promptId)} autoComplete="off"
                className="w-full bg-black/30 border border-white/10 focus:border-indigo-500 outline-none rounded-xl px-4 py-4 text-center text-xl transition-all disabled:opacity-50"
                placeholder="Type your answer..."
              />

              {(!feedback || feedback.promptId !== currentPrompt?.promptId) ? (
                <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-colors shadow-lg shadow-indigo-500/20 active:scale-[0.98]">
                  Check
                </button>
              ) : (
                <button type="button" onClick={generatePrompt} className="w-full bg-white text-black font-bold py-4 rounded-xl transition-colors hover:bg-gray-100 active:scale-[0.98]">
                  Next Word (Press Enter)
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
                
                <button 
                  type="button" 
                  onClick={openDictionaryForCurrentWord}
                  className="mt-4 flex items-center justify-center gap-2 mx-auto text-sm text-white/50 hover:text-white transition-colors hover:bg-white/5 px-3 py-1.5 rounded-lg"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  View Grammar Details
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <DictionaryModal word={modalWord} onClose={() => setModalWord(null)} />

    </main>
  );
}