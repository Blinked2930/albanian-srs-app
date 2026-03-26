"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import DictionaryModal from "@/components/DictionaryModal";

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!url || !key) return null;
  return createClient(url, key);
};

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
}

const mockCategories = ["Unknown", "Phrase", "Adjective", "Verb", "Adverb", "Noun (M)", "Noun (F)", "Command", "Preposition"];
const mockConfidences = ["New", "Improvement", "Almost", "Mastered"];

type SortKey = "albanian" | "english" | "type" | "next_review" | "confidence" | "mastery_score";

// ────────────────────────────────────────────────────────────────
// UI Component: MiniTrend (Operational Sparkline)
// ────────────────────────────────────────────────────────────────
const MiniTrend = ({ logs }: { logs?: ReviewLog[] }) => {
  if (!logs || logs.length === 0) {
    return (
      <div className="flex gap-[2px] items-end h-4 w-12 opacity-30" title="No review history">
        {[1, 2, 3, 4, 5].map((_, i) => (
          <div key={i} className="w-[6px] rounded-sm bg-white/20 h-[20%]"></div>
        ))}
      </div>
    );
  }

  const recent = [...logs]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-5);

  return (
    <div className="flex gap-[2px] items-end h-4 w-12" title="Last 5 reviews">
      {Array.from({ length: 5 - recent.length }).map((_, i) => (
        <div key={`empty-${i}`} className="w-[6px] rounded-sm bg-white/10 h-[20%]"></div>
      ))}
      {recent.map((log, i) => {
        const height = log.score === 1.0 ? '100%' : log.score === 0.5 ? '50%' : '20%';
        const bg = log.score === 1.0 ? 'bg-emerald-400' : log.score === 0.5 ? 'bg-amber-400' : 'bg-rose-400';
        return <div key={`log-${i}`} className={`w-[6px] rounded-sm ${bg} opacity-80`} style={{ height }}></div>;
      })}
    </div>
  );
};

export default function ManageVocab() {
  const [vocabList, setVocabList] = useState<VocabType[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "next_review",
    direction: "asc"
  });

  const [isImporting, setIsImporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // App Settings / Prompt Modal State
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [editedPrompt, setEditedPrompt] = useState("");
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Word Modal State
  const [selectedWord, setSelectedWord] = useState<VocabType | null>(null);

  useEffect(() => {
    fetchVocab();
    fetchSystemPrompt();
  }, []);

  async function fetchVocab() {
    setLoading(true);
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data, error } = await supabase
        .from("vocab")
        .select("*, review_logs(score, created_at)")
        .order("next_review", { ascending: true, nullsFirst: true });

      if (error) {
        console.error("Error fetching vocab:", error);
        return;
      }

      if (data) {
        setVocabList(data as VocabType[]);
      }
    } catch (err) {
      console.error("Failed to load vocab:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchSystemPrompt() {
    try {
      const supabase = getSupabase();
      if (!supabase) return;

      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "gemini_sql_prompt")
        .single();

      if (data) {
        setSystemPrompt(data.value);
        setEditedPrompt(data.value);
      }
    } catch (err) {
      console.error("Failed to load system prompt:", err);
    }
  }

  const [formData, setFormData] = useState({
    albanian: "",
    english: "",
    type: "Unknown",
    confidence: "New",
    usefulness: ""
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.albanian || !formData.english) return;

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

    const supabase = getSupabase();
    if (!supabase) {
      alert("Missing Supabase credentials in .env.local");
      return;
    }

    const { data, error } = await supabase
      .from('vocab')
      .insert([newVocab])
      .select();

    if (error) {
      console.error("Failed to insert word:", error);
      alert("Failed to save word.");
      return;
    }

    if (data && data.length > 0) {
      setVocabList(prev => [data[0] as VocabType, ...prev]);
    }

    setFormData({ albanian: "", english: "", type: "Unknown", confidence: "New", usefulness: "" });
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this word? This action cannot be undone.")) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase.from('vocab').delete().eq('id', id);

    if (error) {
      console.error("Failed to delete word:", error);
      alert("Failed to delete word.");
    } else {
      setVocabList(prev => prev.filter(v => v.id !== id));
    }
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

        if (albIdx === -1 || engIdx === -1) {
          throw new Error("CSV must contain columns with 'Albanian' and 'English' in the header.");
        }

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
          const supabase = getSupabase();
          if (!supabase) return;

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
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate-sentences', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        alert(data.message || "Sentences generated successfully!");
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

  // --- Prompt Modal Handlers ---
  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(systemPrompt);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleSavePrompt = async () => {
    setIsSavingPrompt(true);
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase
      .from("app_settings")
      .update({ value: editedPrompt, updated_at: new Date().toISOString() })
      .eq("key", "gemini_sql_prompt");

    if (error) {
      alert("Failed to save prompt: " + error.message);
    } else {
      setSystemPrompt(editedPrompt);
      setIsEditingPrompt(false);
    }
    setIsSavingPrompt(false);
  };
  // -----------------------------

  const formatDue = (dateStr: string | null) => {
    if (!dateStr) return <span className="text-emerald-400 font-bold">Due Now</span>;
    const date = new Date(dateStr);
    const now = new Date();
    if (date <= now) return <span className="text-emerald-400 font-bold">Due Now</span>;

    const diffHours = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60));
    if (diffHours < 24) return <span className="text-white/60">in {diffHours} hr{diffHours !== 1 ? 's' : ''}</span>;

    const diffDays = Math.round(diffHours / 24);
    return <span className="text-white/40">in {diffDays} day{diffDays !== 1 ? 's' : ''}</span>;
  };

  const handleSort = (key: SortKey) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc"
    }));
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortConfig.key !== columnKey) return <span className="text-white/20 ml-1">↕</span>;
    return <span className="text-indigo-400 ml-1">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>;
  };

  const processedVocab = [...vocabList]
    .filter(item => {
      const q = searchQuery.toLowerCase();
      return item.albanian.toLowerCase().includes(q) || item.english.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let aVal: any = a[sortConfig.key];
      let bVal: any = b[sortConfig.key];

      if (sortConfig.key === "next_review") {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      if (sortConfig.key === "type") {
        aVal = aVal || "Unknown";
        bVal = bVal || "Unknown";
      }

      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

  return (
    <main className="min-h-screen p-6 pt-12 pb-24 relative">
      <div className="max-w-5xl mx-auto z-10 relative">
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 gap-4 pl-2">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-slate-700">Manage Vocab</h1>
          </div>

          <div className="flex gap-3 flex-wrap sm:flex-nowrap">
            {/* Prompt Config Button */}
            <button
              onClick={() => setIsPromptModalOpen(true)}
              className="bg-indigo-100 hover:bg-indigo-200 text-indigo-600 font-bold p-3 rounded-[1rem] transition-colors flex items-center justify-center shadow-sm active:scale-95 border border-indigo-200"
              title="Data Pipeline Prompt"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" /></svg>
            </button>

            <button
              onClick={handleGenerateSentences}
              disabled={isGenerating}
              className="bg-emerald-100 hover:bg-emerald-200 text-emerald-600 border border-emerald-300 font-bold py-2 px-4 rounded-[1rem] transition-colors flex items-center gap-2 active:scale-95 disabled:opacity-50 shadow-sm"
              title="Generate example sentences via AI"
            >
              {isGenerating ? (
                <div className="w-4 h-4 border-2 border-emerald-400 border-t-emerald-600 rounded-full animate-spin"></div>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" /></svg>
              )}
              {isGenerating ? "Generating..." : "Generate Sentences"}
            </button>

            <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleImport} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 font-bold py-2 px-4 rounded-[1rem] transition-colors flex items-center gap-2 active:scale-95 disabled:opacity-50 shadow-sm"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
              {isImporting ? "Importing..." : "Import CSV"}
            </button>

            <button
              onClick={handleExport}
              className="bg-indigo-500 hover:bg-indigo-400 text-white font-black py-2 px-5 rounded-[1rem] transition-colors flex items-center gap-2 shadow-[0_4px_14px_rgba(99,102,241,0.4)] active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
              Export
            </button>
          </div>
        </header>

        <section className="cutesy-glass p-6 rounded-[2rem] border-2 border-white/80 shadow-md mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-700">
            <div className="bg-indigo-100 p-1.5 rounded-lg text-indigo-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
            </div>
            Add Single Word
          </h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="flex flex-col gap-1 lg:col-span-1">
              <label className="text-xs text-slate-500 uppercase font-black tracking-wider">Albanian</label>
              <input required type="text" value={formData.albanian} onChange={e => setFormData({ ...formData, albanian: e.target.value })} className="bg-white/60 border-2 border-slate-200 rounded-[1rem] px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all shadow-inner" placeholder="e.g. Bukur" />
            </div>
            <div className="flex flex-col gap-1 lg:col-span-1">
              <label className="text-xs text-slate-500 uppercase font-black tracking-wider">English</label>
              <input required type="text" value={formData.english} onChange={e => setFormData({ ...formData, english: e.target.value })} className="bg-white/60 border-2 border-slate-200 rounded-[1rem] px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all shadow-inner" placeholder="e.g. Beautiful" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 uppercase font-black tracking-wider">Type</label>
              <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="bg-white/60 border-2 border-slate-200 rounded-[1rem] px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all shadow-inner">
                {mockCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500 uppercase font-black tracking-wider">Priority (1-10)</label>
              <input type="number" min="1" max="10" value={formData.usefulness} onChange={e => setFormData({ ...formData, usefulness: e.target.value })} className="bg-white/60 border-2 border-slate-200 rounded-[1rem] px-4 py-2 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all shadow-inner" placeholder="5" />
            </div>
            <button type="submit" className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-black py-2.5 rounded-[1rem] transition-colors shadow-md active:scale-95">
              Add to Queue
            </button>
          </form>
        </section>

        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4 px-2">
          <div className="relative w-full sm:w-80">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              type="text"
              placeholder="Search vocabulary..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/60 border-2 border-slate-200 rounded-[1.5rem] pl-11 pr-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all shadow-sm"
            />
          </div>
          <p className="text-sm font-bold text-slate-400">
            Showing <span className="text-indigo-500">{processedVocab.length}</span> of {vocabList.length} words
          </p>
        </div>

        <section className="cutesy-glass rounded-[2.5rem] border-2 border-white/80 shadow-md overflow-hidden bg-white/40">
          {/* Mobile: card list (much easier to scan/tap than the full table) */}
          <div className="md:hidden px-4 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-7 h-7 border-4 border-slate-200 border-t-indigo-400 rounded-full animate-spin" />
              </div>
            ) : !loading && processedVocab.length === 0 ? (
              <div className="text-center py-10 px-2 text-slate-400 font-bold text-sm">
                {searchQuery ? "No words match your search." : "No vocabulary found. Add your first word or import a CSV!"}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {processedVocab.map(item => (
                  <div
                    key={item.id}
                    onClick={() => setSelectedWord(item)}
                    className="cursor-pointer p-4 rounded-[1.5rem] border-2 border-white/60 bg-white/30 shadow-sm hover:bg-white/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-black text-slate-700">{item.albanian}</div>
                        <div className="text-sm font-bold text-slate-500">{item.english}</div>
                      </div>
                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        className="text-slate-300 hover:text-rose-500 transition-colors p-2 rounded-xl hover:bg-rose-50"
                        title="Delete word"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          <line x1="10" x2="10" y1="11" y2="17" />
                          <line x1="14" x2="14" y1="11" y2="17" />
                        </svg>
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className="bg-slate-100 px-3 py-1 rounded-lg border-2 border-slate-200 text-xs font-bold text-slate-600">
                        {item.type || "Unknown"}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-xl border-2 text-xs font-black whitespace-nowrap shadow-sm ${
                          item.confidence === "Mastered"
                            ? "bg-emerald-50 text-emerald-500 border-emerald-200"
                            : item.confidence === "Almost"
                              ? "bg-amber-50 text-amber-500 border-amber-200"
                              : item.confidence === "Improvement"
                                ? "bg-orange-50 text-orange-500 border-orange-200"
                                : "bg-indigo-50 text-indigo-500 border-indigo-200"
                        }`}
                      >
                        {item.confidence || "New"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-3">
                      <div className="text-xs font-bold text-slate-500">{formatDue(item.next_review)}</div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 font-black w-10 text-right">
                          {Math.round((item.mastery_score || 0) * 100)}%
                        </span>
                        <MiniTrend logs={item.review_logs} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop/tablet: keep the existing table */}
          <div className="overflow-x-auto hidden md:block">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/50 border-b-2 border-slate-200/50 text-xs text-slate-500 uppercase tracking-widest">
                  <th className="p-6 font-black cursor-pointer hover:bg-slate-200/50 transition-colors" onClick={() => handleSort("albanian")}>
                    Albanian <SortIcon columnKey="albanian" />
                  </th>
                  <th className="p-6 font-black cursor-pointer hover:bg-slate-200/50 transition-colors" onClick={() => handleSort("english")}>
                    English <SortIcon columnKey="english" />
                  </th>
                  <th className="p-6 font-black cursor-pointer hover:bg-slate-200/50 transition-colors" onClick={() => handleSort("type")}>
                    Type <SortIcon columnKey="type" />
                  </th>
                  <th className="p-6 font-black cursor-pointer hover:bg-slate-200/50 transition-colors whitespace-nowrap" onClick={() => handleSort("next_review")}>
                    Next Review <SortIcon columnKey="next_review" />
                  </th>
                  <th className="p-6 font-black cursor-pointer hover:bg-slate-200/50 transition-colors" onClick={() => handleSort("confidence")}>
                    Status <SortIcon columnKey="confidence" />
                  </th>
                  <th className="p-6 font-black cursor-pointer hover:bg-slate-200/50 transition-colors whitespace-nowrap" onClick={() => handleSort("mastery_score")}>
                    Mastery & Trend <SortIcon columnKey="mastery_score" />
                  </th>
                  <th className="p-6 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/50 text-sm">
                {loading && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                      <div className="w-6 h-6 border-4 border-slate-200 border-t-indigo-400 rounded-full animate-spin mx-auto mb-2"></div>
                      Syncing database...
                    </td>
                  </tr>
                )}
                {!loading && processedVocab.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-400 font-bold">
                      {searchQuery ? "No words match your search." : "No vocabulary found. Add your first word or import a CSV!"}
                    </td>
                  </tr>
                )}
                {!loading && processedVocab.map(item => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedWord(item)}
                    className="hover:bg-white/60 transition-colors group cursor-pointer"
                  >
                    <td className="p-6 font-black text-slate-700 group-hover:text-indigo-500 transition-colors text-base">
                      {item.albanian}
                    </td>
                    <td className="p-6 font-bold text-slate-500 text-base">{item.english}</td>
                    <td className="p-6">
                      <span className="bg-slate-100 px-3 py-1.5 rounded-lg border-2 border-slate-200 text-xs font-bold text-slate-600">
                        {item.type || "Unknown"}
                      </span>
                    </td>
                    <td className="p-6 text-slate-500 font-bold">
                      {formatDue(item.next_review)}
                    </td>
                    <td className="p-6">
                      <span className={`px-3 py-1.5 rounded-xl border-2 text-xs font-black whitespace-nowrap shadow-sm
                        ${item.confidence === 'Mastered' ? 'bg-emerald-50 text-emerald-500 border-emerald-200' :
                          item.confidence === 'Almost' ? 'bg-amber-50 text-amber-500 border-amber-200' :
                            item.confidence === 'Improvement' ? 'bg-orange-50 text-orange-500 border-orange-200' :
                              'bg-indigo-50 text-indigo-500 border-indigo-200'
                        }
                       `}>
                        {item.confidence || "New"}
                      </span>
                    </td>
                    <td className="p-6">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 font-black w-8">{Math.round((item.mastery_score || 0) * 100)}%</span>
                        <MiniTrend logs={item.review_logs} />
                      </div>
                    </td>
                    <td className="p-6 text-right">
                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        className="text-slate-300 hover:text-rose-500 transition-colors p-2.5 rounded-xl hover:bg-rose-50 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Delete word"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <DictionaryModal
        word={selectedWord}
        onClose={() => setSelectedWord(null)}
        onUpdate={(updatedWord) => {
          setVocabList(prev => prev.map(w => w.id === updatedWord.id ? { ...w, ...updatedWord } : w));
          setSelectedWord({ ...selectedWord, ...updatedWord } as VocabType);
        }}
      />

      {/* Prompt Modal Overlay */}
      {isPromptModalOpen && (
        <div
          className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
          onClick={() => !isEditingPrompt && setIsPromptModalOpen(false)}
        >
          <div
            className="bg-white border-4 border-slate-100 rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <header className="flex justify-between items-center p-6 border-b-2 border-slate-100">
              <h3 className="text-xl font-black flex items-center gap-3 text-slate-700">
                <div className="bg-emerald-100 p-2 rounded-xl text-emerald-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" /></svg>
                </div>
                Data Pipeline Prompt
              </h3>
              <button
                onClick={() => setIsPromptModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-xl hover:bg-slate-100 transition-colors"
                title="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </header>

            <div className="flex-1 overflow-hidden flex flex-col p-6 bg-slate-50/50">
              {isEditingPrompt ? (
                <textarea
                  value={editedPrompt}
                  onChange={e => setEditedPrompt(e.target.value)}
                  spellCheck={false}
                  className="flex-1 w-full bg-white border-2 border-indigo-200 focus:border-indigo-400 outline-none rounded-[1.5rem] p-5 font-mono text-sm text-slate-700 resize-none transition-all shadow-inner focus:ring-4 focus:ring-indigo-50"
                />
              ) : (
                <div className="flex-1 w-full bg-white border-2 border-slate-200 rounded-[1.5rem] p-5 overflow-auto font-mono text-sm text-slate-600 whitespace-pre-wrap shadow-inner leading-relaxed">
                  {systemPrompt || "Loading prompt..."}
                </div>
              )}
            </div>

            <footer className="p-6 border-t-2 border-slate-100 flex justify-end gap-3 bg-white rounded-b-[2.5rem]">
              {isEditingPrompt ? (
                <>
                  <button
                    onClick={() => { setIsEditingPrompt(false); setEditedPrompt(systemPrompt); }}
                    className="px-5 py-3 rounded-[1.5rem] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSavePrompt}
                    disabled={isSavingPrompt}
                    className="px-5 py-3 rounded-[1.5rem] font-black bg-indigo-500 hover:bg-indigo-400 text-white transition-all flex items-center gap-2 shadow-md active:scale-95 disabled:opacity-50"
                  >
                    {isSavingPrompt ? (
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                    )}
                    {isSavingPrompt ? "Saving..." : "Save Changes"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsEditingPrompt(true)}
                    className="px-5 py-3 rounded-[1.5rem] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors flex items-center gap-2 active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    Edit
                  </button>
                  <button
                    onClick={handleCopyPrompt}
                    className="px-5 py-3 rounded-[1.5rem] font-bold bg-emerald-100 hover:bg-emerald-200 border-2 border-emerald-200 text-emerald-600 transition-colors flex items-center gap-2 active:scale-95"
                  >
                    {copySuccess ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        Copy to Clipboard
                      </>
                    )}
                  </button>
                </>
              )}
            </footer>
          </div>
        </div>
      )}

    </main>
  );
}