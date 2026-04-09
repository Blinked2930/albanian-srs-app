"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import DictionaryModal from "@/components/DictionaryModal";
import { supabase, isDemoMode } from "@/lib/supabaseClient";

interface ReviewLog {
  score: number;
  created_at: string;
}

interface VocabType {
  id: string;
  albanian: string;
  english: string;
  type: string | null;
  confidence: string;
  usefulness: number;
  mastery_score: number;
  streak: number;
  next_review: string | null;
  review_logs?: ReviewLog[];
  matchReason?: string; 
}

const mockCategories = ["Unknown", "Phrase", "Adjective", "Verb", "Adverb", "Noun (M)", "Noun (F)", "Command", "Preposition"];

type SortKey = "albanian" | "english" | "type" | "next_review" | "confidence" | "mastery_score";

const PROMPT_TYPES = [
  { id: "gemini_sentence_prompt", label: "Sentences" },
  { id: "gemini_mnemonic_prompt", label: "Mnemonics" },
  { id: "gemini_sql_prompt", label: "SQL Pipeline" },
  { id: "gemini_sentence_explanation_prompt", label: "Explain Sentence" }
];

// ────────────────────────────────────────────────────────────────
// UI Component: MiniTrend (Operational Sparkline)
// ────────────────────────────────────────────────────────────────
const MiniTrend = ({ logs }: { logs?: ReviewLog[] }) => {
  if (!logs || logs.length === 0) {
    return (
      <div className="flex gap-[2px] items-end h-5 w-14 opacity-40" title="No review history">
        {[1, 2, 3, 4, 5].map((_, i) => (
          <div key={i} className="w-[6px] rounded-sm bg-slate-300 h-[20%]"></div>
        ))}
      </div>
    );
  }

  const recent = [...logs]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-5);

  return (
    <div className="flex gap-[2px] items-end h-5 w-14" title="Last 5 reviews">
      {Array.from({ length: 5 - recent.length }).map((_, i) => (
        <div key={`empty-${i}`} className="w-[6px] rounded-sm bg-slate-200 h-[20%]"></div>
      ))}
      {recent.map((log, i) => {
        const height = log.score === 1.0 ? '100%' : log.score === 0.5 ? '50%' : '20%';
        const bg = log.score === 1.0 ? 'bg-emerald-400' : log.score === 0.5 ? 'bg-amber-400' : 'bg-rose-400';
        return <div key={`log-${i}`} className={`w-[6px] rounded-sm ${bg}`} style={{ height }}></div>;
      })}
    </div>
  );
};

export default function ManageVocab() {
  const [vocabList, setVocabList] = useState<VocabType[]>([]);
  const [loading, setLoading] = useState(true);

  // Deep Search States
  const [allConjugations, setAllConjugations] = useState<any[]>([]);
  const [allNouns, setAllNouns] = useState<any[]>([]);
  const [allAdjectives, setAllAdjectives] = useState<any[]>([]);

  // Search and Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "next_review",
    direction: "asc"
  });

  const [isImporting, setIsImporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom Dropdown State
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const typeDropdownButtonRef = useRef<HTMLButtonElement>(null);
  const typeDropdownListRef = useRef<HTMLDivElement>(null);

  // Multi-Prompt Modal State
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [activePromptKey, setActivePromptKey] = useState("gemini_sentence_prompt");
  const [promptsDict, setPromptsDict] = useState<Record<string, string>>({});
  const [editedPrompt, setEditedPrompt] = useState("");
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Word Modal State
  const [selectedWord, setSelectedWord] = useState<VocabType | null>(null);

  // Loading and Confirmation state
  const [isAdding, setIsAdding] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchVocab();
    if (!isDemoMode) fetchAllPrompts();
  }, []);

  // Close dropdown on scroll or resize
  useEffect(() => {
    if (!isTypeDropdownOpen) return;
    const close = (e: Event) => {
      if (typeDropdownListRef.current && typeDropdownListRef.current.contains(e.target as Node)) return;
      setIsTypeDropdownOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [isTypeDropdownOpen]);

  async function fetchVocab() {
    setLoading(true);
    try {
      const [vocabRes, conjRes, nounRes, adjRes] = await Promise.all([
        supabase.from("vocab").select("*, review_logs(score, created_at)").order("next_review", { ascending: true, nullsFirst: true }),
        supabase.from("conjugations").select("*"),
        supabase.from("noun_declensions").select("*"),
        supabase.from("adjective_agreements").select("*")
      ]);

      if (vocabRes.error) console.error("Error fetching vocab:", vocabRes.error);
      else if (vocabRes.data) setVocabList(vocabRes.data as VocabType[]);

      if (conjRes.data) setAllConjugations(conjRes.data);
      if (nounRes.data) setAllNouns(nounRes.data);
      if (adjRes.data) setAllAdjectives(adjRes.data);

    } catch (err) {
      console.error("Failed to load vocab:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAllPrompts() {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", ["gemini_sql_prompt", "gemini_sentence_prompt", "gemini_mnemonic_prompt", "gemini_sentence_explanation_prompt"]);

      if (error) {
        console.error("Error fetching prompts:", error);
        return;
      }

      if (data) {
        const mapping: Record<string, string> = {};
        data.forEach((item: any) => mapping[item.key] = item.value);
        setPromptsDict(mapping);
        setEditedPrompt(mapping["gemini_sentence_prompt"] || "");
      }
    } catch (err) {
      console.error("Failed to load prompts:", err);
    }
  }

  const [formData, setFormData] = useState({
    albanian: "",
    english: "",
    type: "Unknown",
    confidence: "New",
    usefulness: ""
  });

  // --- INVISIBLE SEARCH: Checks library as you type ---
  const duplicateMatch = useMemo(() => {
    const q = formData.albanian.trim().toLowerCase();
    if (q.length < 2) return null;

    // 1. Check Exact Match
    const exactVocab = vocabList.find((v: any) => v.albanian.toLowerCase() === q);
    if (exactVocab) return `Already in library: ${exactVocab.albanian} (${exactVocab.english})`;

    // 2. Deep check verbs
    for (const c of allConjugations) {
      if ([c.une, c.ti, c.ai_ajo, c.ne, c.ju, c.ata_ato].some((v: any) => v && v.toLowerCase() === q)) {
        const parent = vocabList.find((v: any) => v.id === c.vocab_id);
        return parent ? `Matches conjugation of ${parent.albanian}` : `Matches a verb conjugation`;
      }
    }
    
    // 3. Deep check nouns
    for (const n of allNouns) {
      if ([n.indef_sg, n.def_sg, n.indef_pl, n.def_pl].some((v: any) => v && v.toLowerCase() === q)) {
        const parent = vocabList.find((v: any) => v.id === n.vocab_id);
        return parent ? `Matches declension of ${parent.albanian}` : `Matches a noun declension`;
      }
    }
    
    // 4. Deep check adjectives
    for (const a of allAdjectives) {
      if ([a.masc_sg, a.fem_sg, a.masc_pl, a.fem_pl].some((v: any) => v && v.toLowerCase() === q)) {
        const parent = vocabList.find((v: any) => v.id === a.vocab_id);
        return parent ? `Matches adjective form of ${parent.albanian}` : `Matches an adjective form`;
      }
    }
    
    return null;
  }, [formData.albanian, vocabList, allConjugations, allNouns, allAdjectives]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDemoMode) return; // Ghost Mode safeguard
    if (!formData.albanian || !formData.english || isAdding) return;

    setIsAdding(true);

    const newVocab = {
      albanian: formData.albanian.trim(),
      english: formData.english.trim(),
      type: formData.type === "Unknown" ? null : formData.type,
      confidence: "New",
      usefulness: formData.usefulness ? parseInt(formData.usefulness, 10) : 5,
      mastery_score: 0.0,
      streak: 0,
      ease_factor: 2.5,
      interval: 0,
      next_review: new Date().toISOString()
    };

    const { data, error } = await supabase.from('vocab').insert([newVocab]).select();

    if (error) {
      console.error("Failed to insert word:", error);
      alert("Failed to save word.");
      setIsAdding(false);
      return;
    }

    if (data && data.length > 0) {
      setVocabList(prev => [data[0] as VocabType, ...prev]);
    }

    setFormData({ albanian: "", english: "", type: "Unknown", confidence: "New", usefulness: "" });
    setIsAdding(false);
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDemoMode) return; // Ghost Mode safeguard
    setDeleteConfirmId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmId || isDemoMode) return;
    setIsDeleting(true);

    const { error } = await supabase.from('vocab').delete().eq('id', deleteConfirmId);

    if (error) {
      console.error("Failed to delete word:", error);
      alert("Failed to delete word.");
    } else {
      setVocabList(prev => prev.filter(v => v.id !== deleteConfirmId));
    }
    setIsDeleting(false);
    setDeleteConfirmId(null);
  };

  const parseCSVRow = (str: string) => {
    const arr = [];
    let quote = false;
    let col = '';
    for (let i = 0; i < str.length; i++) {
      let cc = str[i], nc = str[i + 1];
      if (cc === '"' && quote && nc === '"') { col += cc; i++; continue; }
      if (cc === '"') { quote = !quote; continue; }
      if (cc === ',' && !quote) { arr.push(col.trim()); col = ''; continue; }
      col += cc;
    }
    arr.push(col.trim());
    return arr;
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isDemoMode) return; // Ghost Mode safeguard
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) throw new Error("File is empty or missing headers.");

        const headers = parseCSVRow(lines[0]).map(h => h.toLowerCase());

        const albIdx = headers.findIndex(h => h.includes('albanian'));
        const engIdx = headers.findIndex(h => h.includes('english'));
        const typeIdx = headers.findIndex(h => h.includes('type'));
        const useIdx = headers.findIndex(h => h.includes('usefulness'));

        if (albIdx === -1 || engIdx === -1) throw new Error("CSV must contain columns with 'Albanian' and 'English' in the header.");

        const batches = [];
        const now = new Date().toISOString();

        for (let i = 1; i < lines.length; i++) {
          const row = parseCSVRow(lines[i]);
          if (!row[albIdx] || !row[engIdx]) continue;

          const parsedType = typeIdx !== -1 && row[typeIdx] && row[typeIdx].trim() !== "" ? row[typeIdx].trim() : null;

          batches.push({
            albanian: row[albIdx],
            english: row[engIdx],
            type: parsedType,
            usefulness: useIdx !== -1 && parseInt(row[useIdx]) ? parseInt(row[useIdx]) : 5,
            confidence: "New",
            mastery_score: 0.0,
            interval: 0,
            ease_factor: 2.5,
            streak: 0,
            next_review: now
          });
        }

        if (batches.length > 0) {
          const { error } = await supabase.from('vocab').insert(batches);
          if (error) throw error;
          alert(`Successfully imported ${batches.length} words!`);
          fetchVocab();
        }
      } catch (err: any) {
        alert("Import failed: " + err.message);
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleExport = () => {
    const header = "Albanian,English,Type,Confidence,Usefulness,Mastery Score,Streak,Next Review\n";
    const csvContent = vocabList.map(v => {
      const reviewText = v.next_review || 'Due Now';
      return `"${v.albanian}","${v.english}","${v.type || 'Unknown'}","${v.confidence}",${v.usefulness},${v.mastery_score},${v.streak},"${reviewText}"`;
    }).join("\n");

    const fullCsv = header + csvContent;
    const blob = new Blob([fullCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `vocab_export_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerateSentences = async () => {
    if (isDemoMode) {
      alert("Ghost Mode: Live AI generation is disabled for guests to save API costs. Imagine perfectly tailored Albanian sentences generating right here! 🚀");
      return;
    }
    
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate-sentences', { method: 'POST' });
      const data = await res.json();
      if (res.ok) alert(data.message || "Sentences generated successfully!");
      else alert("Error: " + (data.error || "Failed to generate sentences. Check console."));
    } catch (err) {
      console.error(err); alert("An error occurred while calling the sentence generator.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePromptTabChange = (key: string) => {
    setActivePromptKey(key);
    setEditedPrompt(promptsDict[key] || "");
    setIsEditingPrompt(false);
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(promptsDict[activePromptKey] || "");
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleSavePrompt = async () => {
    if (isDemoMode) return; // Ghost Mode safeguard
    setIsSavingPrompt(true);

    const { error } = await supabase
      .from("app_settings")
      .update({ value: editedPrompt, updated_at: new Date().toISOString() })
      .eq("key", activePromptKey);

    if (error) {
      alert("Failed to save prompt: " + error.message);
    } else {
      setPromptsDict(prev => ({ ...prev, [activePromptKey]: editedPrompt }));
      setIsEditingPrompt(false);
    }
    setIsSavingPrompt(false);
  };

  const formatDue = (dateStr: string | null) => {
    if (!dateStr) return <span className="text-emerald-500 font-black">Due Now</span>;
    const date = new Date(dateStr);
    const now = new Date();
    if (date <= now) return <span className="text-emerald-500 font-black">Due Now</span>;

    const diffHours = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60));
    if (diffHours < 24) return <span className="text-slate-400 font-bold">in {diffHours} hr{diffHours !== 1 ? 's' : ''}</span>;

    const diffDays = Math.round(diffHours / 24);
    return <span className="text-slate-400 font-bold">in {diffDays} day{diffDays !== 1 ? 's' : ''}</span>;
  };

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc"
    }));
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortConfig.key !== columnKey) return <span className="text-slate-300 ml-1">↕</span>;
    return <span className="text-indigo-500 font-black ml-1">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  // --- SEARCH TO ADD ROUTER ---
  const handleSearchToAdd = () => {
    setFormData(prev => ({ ...prev, albanian: searchQuery }));
    setSearchQuery("");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- Search Algorithm with Contextual Feedback ---
  const processedVocab = vocabList.reduce((acc, item) => {
    const q = searchQuery.trim().toLowerCase();
    
    if (!q) {
      acc.push(item);
      return acc;
    }

    if (item.albanian.toLowerCase().includes(q) || item.english.toLowerCase().includes(q)) {
      acc.push(item);
      return acc;
    }

    let matchReason = null;

    if (item.type === "Verb" || item.type === "Command") {
      for (const c of allConjugations) {
        if (c.vocab_id === item.id) {
          const vals = [c.une, c.ti, c.ai_ajo, c.ne, c.ju, c.ata_ato];
          const match = vals.find((v: any) => v && v.toLowerCase().includes(q));
          if (match) { matchReason = `↳ Matches: ${match}`; break; }
        }
      }
    } 
    else if (item.type === "Adjective") {
      for (const a of allAdjectives) {
        if (a.vocab_id === item.id) {
          const vals = [a.masc_sg, a.fem_sg, a.masc_pl, a.fem_pl];
          const match = vals.find((v: any) => v && v.toLowerCase().includes(q));
          if (match) { matchReason = `↳ Matches: ${match}`; break; }
        }
      }
    } 
    else if (item.type?.startsWith("Noun")) {
      for (const n of allNouns) {
        if (n.vocab_id === item.id) {
          const vals = [n.indef_sg, n.def_sg, n.indef_pl, n.def_pl];
          const match = vals.find((v: any) => v && v.toLowerCase().includes(q));
          if (match) { matchReason = `↳ Matches: ${match}`; break; }
        }
      }
    }

    if (matchReason) {
      acc.push({ ...item, matchReason });
    }

    return acc;
  }, [] as VocabType[])
  .sort((a, b) => {
    let aVal: any = a[sortConfig.key];
    let bVal: any = b[sortConfig.key];
    if (sortConfig.key === "next_review") { aVal = aVal ? new Date(aVal).getTime() : 0; bVal = bVal ? new Date(bVal).getTime() : 0; }
    if (sortConfig.key === "type") { aVal = aVal || "Unknown"; bVal = bVal || "Unknown"; }
    if (typeof aVal === "string") aVal = aVal.toLowerCase();
    if (typeof bVal === "string") bVal = bVal.toLowerCase();
    if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  const handleOpenTypeDropdown = () => {
    if (typeDropdownButtonRef.current) {
      const rect = typeDropdownButtonRef.current.getBoundingClientRect();
      setDropdownRect({ top: rect.bottom + 8, left: rect.left, width: rect.width });
    }
    setIsTypeDropdownOpen(true);
  };

  return (
    <main className="min-h-[100dvh] bg-[#fafafa] p-4 sm:p-8 pt-8 sm:pt-12 pb-[calc(env(safe-area-inset-bottom)+6rem)] relative overflow-x-hidden">
      
      {/* Background Glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[120%] h-[120%] bg-gradient-to-br from-pink-100/40 via-purple-50/20 to-indigo-100/40 z-0 pointer-events-none"></div>

      {isDemoMode && (
        <div className="fixed top-4 left-4 z-[400] bg-slate-800 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg tracking-widest uppercase border-2 border-slate-600 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          Ghost Mode: Read Only
        </div>
      )}

      <div className="max-w-7xl mx-auto w-full z-10 relative">
        
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:justify-between md:items-end mb-8 sm:mb-12 gap-6">
          <div className="text-center md:text-left">
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-800">Manage Library</h1>
            <p className="text-slate-500 font-bold mt-2">Curate your vocabulary and rules.</p>
          </div>

          <div className="flex gap-3 flex-wrap justify-center md:justify-end">
            {/* GHOST MODE HIDES THESE BUTTONS */}
            {!isDemoMode && (
              <>
                <button onClick={() => setIsPromptModalOpen(true)} className="bg-white/80 backdrop-blur-md hover:bg-white text-indigo-500 font-bold p-3 rounded-[1rem] transition-colors flex items-center justify-center shadow-sm active:scale-95 border-2 border-white" title="Data Pipeline Prompt">
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" /></svg>
                </button>

                <button onClick={handleGenerateSentences} disabled={isGenerating} className="bg-emerald-100/80 backdrop-blur-md hover:bg-emerald-100 text-emerald-600 border-2 border-emerald-200 font-bold py-2 sm:py-3 px-4 sm:px-5 rounded-[1rem] transition-colors flex items-center gap-2 active:scale-95 disabled:opacity-50 shadow-sm text-sm sm:text-base">
                  {isGenerating ? <div className="w-5 h-5 border-2 border-emerald-400 border-t-emerald-600 rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" /></svg>}
                  <span className="hidden sm:inline">{isGenerating ? "Generating..." : "Generate Sentences"}</span>
                  <span className="inline sm:hidden">Sentences</span>
                </button>

                <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleImport} />
                
                <button onClick={() => fileInputRef.current?.click()} disabled={isImporting} className="bg-white/80 backdrop-blur-md hover:bg-white text-slate-600 border-2 border-white font-bold py-2 sm:py-3 px-4 sm:px-5 rounded-[1rem] transition-colors flex items-center gap-2 active:scale-95 disabled:opacity-50 shadow-sm text-sm sm:text-base">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
                  <span className="hidden sm:inline">{isImporting ? "Importing..." : "Import CSV"}</span>
                  <span className="inline sm:hidden">Import</span>
                </button>
              </>
            )}

            {/* Export button available to EVERYONE */}
            <button onClick={handleExport} className="bg-indigo-500 hover:bg-indigo-400 text-white font-black py-2 sm:py-3 px-4 sm:px-6 rounded-[1rem] transition-colors flex items-center gap-2 shadow-[0_4px_14px_rgba(99,102,241,0.4)] active:scale-95 text-sm sm:text-base">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
              Export
            </button>
          </div>
        </header>

        {/* GHOST MODE HIDES THE ADD WORD FORM */}
        {!isDemoMode && (
          <section className="bg-white/80 backdrop-blur-xl p-6 sm:p-8 rounded-[2.5rem] border-2 border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] mb-8 sm:mb-12">
            <h2 className="text-xl sm:text-2xl font-black mb-6 flex items-center gap-3 text-slate-700">
              <div className="bg-indigo-100 p-2 rounded-xl text-indigo-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
              </div>
              Add Single Word
            </h2>
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-end">
              <div className="flex flex-col gap-1.5 lg:col-span-1 relative">
                <label className="text-xs text-slate-400 uppercase font-black tracking-widest">Albanian</label>
                <input required type="text" value={formData.albanian} onChange={e => setFormData({ ...formData, albanian: e.target.value })} className="bg-slate-50 border-2 border-slate-200 rounded-[1.25rem] px-4 py-3 text-base font-bold text-slate-700 outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner" placeholder="e.g. Bukur" />
                {duplicateMatch && (
                  <div className="absolute top-[calc(100%+4px)] left-2 text-[10px] font-black text-amber-500 z-10 bg-amber-50/90 px-2 py-0.5 rounded-md backdrop-blur-md border border-amber-100 whitespace-nowrap shadow-sm pointer-events-none">
                    ⚠️ {duplicateMatch}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1.5 lg:col-span-1">
                <label className="text-xs text-slate-400 uppercase font-black tracking-widest">English</label>
                <input required type="text" value={formData.english} onChange={e => setFormData({ ...formData, english: e.target.value })} className="bg-slate-50 border-2 border-slate-200 rounded-[1.25rem] px-4 py-3 text-base font-bold text-slate-700 outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner" placeholder="e.g. Beautiful" />
              </div>
              <div className="flex flex-col gap-1.5 relative">
                <label className="text-xs text-slate-400 uppercase font-black tracking-widest">Type</label>
                <div className="relative">
                  <button ref={typeDropdownButtonRef} type="button" onClick={handleOpenTypeDropdown} className="w-full bg-slate-50 border-2 border-slate-200 rounded-[1.25rem] px-4 py-3 text-base font-bold text-slate-700 outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner text-left flex justify-between items-center">
                    <span className="truncate">{formData.type}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`text-slate-400 transition-transform duration-200 ${isTypeDropdownOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-slate-400 uppercase font-black tracking-widest">Priority</label>
                <input type="number" min="1" max="10" value={formData.usefulness} onChange={e => setFormData({ ...formData, usefulness: e.target.value })} className="bg-slate-50 border-2 border-slate-200 rounded-[1.25rem] px-4 py-3 text-base font-bold text-slate-700 outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner" placeholder="1-10" />
              </div>
              <button type="submit" disabled={isAdding} className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-black py-3 sm:py-3.5 rounded-[1.25rem] transition-colors shadow-md active:scale-95 text-lg disabled:opacity-50 flex items-center justify-center gap-2">
                {isAdding ? <><div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>Adding...</> : "Add"}
              </button>
            </form>
          </section>
        )}

        {/* Search Bar */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
          <div className="relative w-full md:max-w-md">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input type="text" placeholder="Search vocabulary & conjugations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/80 backdrop-blur-md border-2 border-white rounded-[1.5rem] pl-12 pr-4 py-4 text-base font-bold text-slate-700 outline-none focus:border-indigo-400 focus:bg-white shadow-sm transition-all" />
          </div>
          <p className="text-sm font-black text-slate-400 bg-white/60 px-4 py-2 rounded-full border border-white">
            Showing <span className="text-indigo-500">{processedVocab.length}</span> of {vocabList.length}
          </p>
        </div>

        {/* Mobile/Tablet: Card View */}
        <div className="block lg:hidden space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : !loading && processedVocab.length === 0 ? (
            <div className="text-center py-10 px-4 text-slate-500 font-bold bg-white/60 rounded-[2rem] border-2 border-white flex flex-col items-center justify-center gap-3 shadow-sm">
              {searchQuery ? (
                <>
                  <p>No words match "{searchQuery}".</p>
                  {!isDemoMode && (
                    <button onClick={handleSearchToAdd} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 px-5 py-2.5 rounded-xl text-sm transition-all active:scale-95 flex items-center gap-2 font-black mt-2">
                       <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg> Add "{searchQuery}"
                    </button>
                  )}
                </>
              ) : "No vocabulary found."}
            </div>
          ) : (
            processedVocab.map(item => (
              <div key={item.id} onClick={() => setSelectedWord(item)} className="cursor-pointer p-5 sm:p-6 rounded-[2rem] border-2 border-white bg-white/80 backdrop-blur-md shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">{item.albanian}</div>
                    {item.matchReason && <div className="text-xs font-bold text-indigo-400 mt-0.5">{item.matchReason}</div>}
                    <div className="text-base sm:text-lg font-bold text-slate-500 mt-1">{item.english}</div>
                  </div>
                  {!isDemoMode && (
                    <button onClick={(e) => handleDeleteClick(item.id, e)} className="text-slate-300 hover:text-rose-500 transition-colors p-2.5 rounded-xl hover:bg-rose-50 bg-white" title="Delete word">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <span className="bg-slate-100 px-3 py-1.5 rounded-lg text-xs font-black text-slate-500 uppercase tracking-wider">{item.type || "Unknown"}</span>
                  <span className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm ${item.confidence === "Mastered" ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : item.confidence === "Almost" ? "bg-amber-50 text-amber-600 border border-amber-200" : item.confidence === "Improvement" ? "bg-orange-50 text-orange-600 border border-orange-200" : "bg-indigo-50 text-indigo-600 border border-indigo-200"}`}>{item.confidence || "New"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t-2 border-slate-100">
                  <div className="text-sm font-bold text-slate-500 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>{formatDue(item.next_review)}</div>
                  <div className="flex items-center gap-3"><span className="text-sm text-slate-400 font-black">{Math.round((item.mastery_score || 0) * 100)}%</span><MiniTrend logs={item.review_logs} /></div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Large Desktop: Table View */}
        <div className="hidden lg:block bg-white/80 backdrop-blur-xl rounded-[2.5rem] border-2 border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50/80 border-b-2 border-slate-200 text-xs text-slate-400 uppercase tracking-widest">
                  <th className="px-6 py-5 font-black cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap" onClick={() => handleSort("albanian")}>Albanian <SortIcon columnKey="albanian" /></th>
                  <th className="px-6 py-5 font-black cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap" onClick={() => handleSort("english")}>English <SortIcon columnKey="english" /></th>
                  <th className="px-6 py-5 font-black cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap" onClick={() => handleSort("type")}>Type <SortIcon columnKey="type" /></th>
                  <th className="px-6 py-5 font-black cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap" onClick={() => handleSort("next_review")}>Next Review <SortIcon columnKey="next_review" /></th>
                  <th className="px-6 py-5 font-black cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap" onClick={() => handleSort("confidence")}>Status <SortIcon columnKey="confidence" /></th>
                  <th className="px-6 py-5 font-black cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap" onClick={() => handleSort("mastery_score")}>Trend <SortIcon columnKey="mastery_score" /></th>
                  {!isDemoMode && <th className="px-6 py-5 font-black text-right whitespace-nowrap">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-100 text-sm">
                {loading && (<tr><td colSpan={7} className="p-12 text-center text-slate-400 font-bold bg-white/50"><div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3"></div>Syncing database...</td></tr>)}
                {!loading && processedVocab.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-16 text-center text-slate-500 font-bold text-lg bg-white/50">
                      {searchQuery ? (
                        <div className="flex flex-col items-center justify-center gap-4">
                          <p>No words match "{searchQuery}".</p>
                          {!isDemoMode && (
                            <button onClick={handleSearchToAdd} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 px-6 py-3 rounded-xl text-sm transition-all active:scale-95 flex items-center gap-2 font-black">
                               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg> Add "{searchQuery}"
                            </button>
                          )}
                        </div>
                      ) : "No vocabulary found."}
                    </td>
                  </tr>
                )}
                {!loading && processedVocab.map(item => (
                  <tr key={item.id} onClick={() => setSelectedWord(item)} className="hover:bg-slate-50/80 transition-colors group cursor-pointer bg-white/40">
                    <td className="px-6 py-5 font-black text-slate-800 text-base group-hover:text-indigo-600 transition-colors">{item.albanian}{item.matchReason && <span className="block text-xs font-bold text-indigo-400 mt-1">{item.matchReason}</span>}</td>
                    <td className="px-6 py-5 font-bold text-slate-500 text-base">{item.english}</td>
                    <td className="px-6 py-5"><span className="bg-slate-100 px-3 py-1.5 rounded-lg text-xs font-black text-slate-500 uppercase tracking-wider">{item.type || "Unknown"}</span></td>
                    <td className="px-6 py-5 text-slate-600 font-bold whitespace-nowrap">{formatDue(item.next_review)}</td>
                    <td className="px-6 py-5"><span className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm ${item.confidence === 'Mastered' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : item.confidence === 'Almost' ? 'bg-amber-50 text-amber-600 border border-amber-200' : item.confidence === 'Improvement' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-indigo-50 text-indigo-600 border border-indigo-200'}`}>{item.confidence || "New"}</span></td>
                    <td className="px-6 py-5"><div className="flex items-center gap-3"><span className="text-sm text-slate-400 font-black w-8">{Math.round((item.mastery_score || 0) * 100)}%</span><MiniTrend logs={item.review_logs} /></div></td>
                    {!isDemoMode && (
                      <td className="px-6 py-5 text-right">
                        <button onClick={(e) => handleDeleteClick(item.id, e)} className="text-slate-300 hover:text-rose-500 transition-colors p-2.5 rounded-xl hover:bg-rose-50 opacity-0 group-hover:opacity-100 focus:opacity-100 bg-white" title="Delete word">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isTypeDropdownOpen && dropdownRect && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setIsTypeDropdownOpen(false)} />
          <div ref={typeDropdownListRef} className="fixed z-[201] bg-white/90 backdrop-blur-xl border-2 border-white rounded-[1.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.1)] overflow-hidden py-2 flex flex-col max-h-64 overflow-y-auto" style={{ top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width }}>
            {mockCategories.map(cat => (
              <button key={cat} type="button" onClick={() => { setFormData(prev => ({ ...prev, type: cat })); setIsTypeDropdownOpen(false); }} className={`px-5 py-3 text-left text-sm transition-colors ${formData.type === cat ? 'bg-indigo-50/80 text-indigo-600 font-black' : 'text-slate-600 font-bold hover:bg-slate-50 hover:text-indigo-500'}`}>
                {cat}
              </button>
            ))}
          </div>
        </>
      )}

      <DictionaryModal word={selectedWord} onClose={() => setSelectedWord(null)} onUpdate={(updatedWord) => { setVocabList(prev => prev.map(w => w.id === updatedWord.id ? { ...w, ...updatedWord } : w)); setSelectedWord({ ...selectedWord, ...updatedWord } as VocabType); }} />

      {isPromptModalOpen && !isDemoMode && (
        <div className="fixed inset-0 z-[150] bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6" onClick={() => !isEditingPrompt && setIsPromptModalOpen(false)}>
          <div className="bg-white/90 backdrop-blur-xl border-2 border-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.1)]" onClick={e => e.stopPropagation()}>
            <header className="flex justify-between items-center p-6 sm:p-8 border-b-2 border-slate-100">
              <h3 className="text-2xl font-black flex items-center gap-3 text-slate-700 tracking-tight">
                <div className="bg-indigo-100 p-2 rounded-xl text-indigo-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" /></svg>
                </div>
                Data Pipeline Prompt
              </h3>
              <button onClick={() => setIsPromptModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors" title="Close">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </header>

            <div className="px-6 sm:px-8 pt-4 pb-2 border-b-2 border-slate-100">
               <div className="bg-slate-100 p-1.5 rounded-2xl flex w-full max-w-xl shadow-inner">
                  {PROMPT_TYPES.map(type => (
                    <button
                      key={type.id}
                      onClick={() => handlePromptTabChange(type.id)}
                      className={`flex-1 text-sm font-bold py-2.5 rounded-xl transition-all ${activePromptKey === type.id ? 'bg-white text-indigo-500 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {type.label}
                    </button>
                  ))}
               </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col p-6 sm:p-8 bg-slate-50/50">
              {isEditingPrompt ? (
                <textarea value={editedPrompt} onChange={e => setEditedPrompt(e.target.value)} spellCheck={false} className="flex-1 w-full bg-white border-2 border-indigo-200 focus:border-indigo-400 outline-none rounded-[1.5rem] p-6 font-mono text-sm sm:text-base text-slate-700 resize-none transition-all shadow-inner" />
              ) : (
                <div className="flex-1 w-full bg-white border-2 border-slate-200 rounded-[1.5rem] p-6 overflow-auto font-mono text-sm sm:text-base text-slate-600 whitespace-pre-wrap shadow-inner leading-relaxed">
                  {promptsDict[activePromptKey] || "Loading prompt..."}
                </div>
              )}
            </div>

            <footer className="p-6 sm:p-8 border-t-2 border-slate-100 flex flex-wrap justify-end gap-3 bg-white rounded-b-[2.5rem]">
              {isEditingPrompt ? (
                <>
                  <button onClick={() => { setIsEditingPrompt(false); setEditedPrompt(promptsDict[activePromptKey] || ""); }} className="px-6 py-3.5 rounded-xl font-black bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors active:scale-95">Cancel</button>
                  <button onClick={handleSavePrompt} disabled={isSavingPrompt} className="px-6 py-3.5 rounded-xl font-black bg-indigo-500 hover:bg-indigo-400 text-white transition-all flex items-center gap-2 shadow-[0_4px_14px_rgba(99,102,241,0.3)] active:scale-95 disabled:opacity-50">
                    {isSavingPrompt ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>}
                    {isSavingPrompt ? "Saving..." : "Save Changes"}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setIsEditingPrompt(true)} className="px-6 py-3.5 rounded-xl font-black bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors flex items-center gap-2 active:scale-95">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg> Edit
                  </button>
                  <button onClick={handleCopyPrompt} className="px-6 py-3.5 rounded-xl font-black bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors flex items-center gap-2 active:scale-95">
                    {copySuccess ? "Copied!" : "Copy Prompt"}
                  </button>
                </>
              )}
            </footer>
          </div>
        </div>
      )}

      {isAdding && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] bg-zinc-900/90 backdrop-blur-md text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-300">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
          <span className="font-bold tracking-wide">Adding "{formData.albanian}" to database...</span>
        </div>
      )}

      {deleteConfirmId && !isDemoMode && (
        <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !isDeleting && setDeleteConfirmId(null)}>
          <div className="bg-white/90 backdrop-blur-xl border-2 border-white rounded-[2rem] p-6 sm:p-8 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.15)] flex flex-col items-center text-center animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mb-6 shadow-inner">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
            </div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Delete Word?</h3>
            <p className="text-slate-500 font-bold mb-8">This action cannot be undone. It will be permanently removed from your library.</p>
            <div className="flex w-full gap-3">
              <button onClick={() => setDeleteConfirmId(null)} disabled={isDeleting} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-3.5 rounded-xl transition-colors active:scale-95 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={isDeleting} className="flex-1 bg-rose-500 hover:bg-rose-400 text-white font-black py-3.5 rounded-xl transition-all shadow-[0_4px_14px_rgba(244,63,94,0.4)] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50">
                {isDeleting ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}