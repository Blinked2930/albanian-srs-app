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
    <main className="min-h-screen bg-[#0F172A] text-white p-6 pb-24 relative">
      <div className="max-w-5xl mx-auto z-10 relative">
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end mb-8 gap-4">
          <div>
            <Link href="/" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium transition-colors inline-flex items-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
              Back to Hub
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Manage Vocab</h1>
          </div>

          <div className="flex gap-3 flex-wrap sm:flex-nowrap">
            {/* Prompt Config Button */}
            <button
              onClick={() => setIsPromptModalOpen(true)}
              className="bg-white/10 hover:bg-white/20 text-white font-medium p-2 rounded-lg transition-colors flex items-center justify-center shadow-sm active:scale-95"
              title="Data Pipeline Prompt"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" /></svg>
            </button>

            <button
              onClick={handleGenerateSentences}
              disabled={isGenerating}
              className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2 active:scale-95 disabled:opacity-50"
              title="Generate example sentences via AI"
            >
              {isGenerating ? (
                <div className="w-4 h-4 border-2 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin"></div>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" /></svg>
              )}
              {isGenerating ? "Generating..." : "Generate Sentences"}
            </button>

            <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleImport} />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="bg-white/10 hover:bg-white/20 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2 active:scale-95 disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>
              {isImporting ? "Importing..." : "Import CSV"}
            </button>

            <button
              onClick={handleExport}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
              Export
            </button>
          </div>
        </header>

        <section className="glassmorphism p-6 rounded-2xl border border-white/10 mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" className="text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
            Add Single Word
          </h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="flex flex-col gap-1 lg:col-span-1">
              <label className="text-xs text-white/50 uppercase font-semibold tracking-wider">Albanian</label>
              <input required type="text" value={formData.albanian} onChange={e => setFormData({ ...formData, albanian: e.target.value })} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Bukur" />
            </div>
            <div className="flex flex-col gap-1 lg:col-span-1">
              <label className="text-xs text-white/50 uppercase font-semibold tracking-wider">English</label>
              <input required type="text" value={formData.english} onChange={e => setFormData({ ...formData, english: e.target.value })} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Beautiful" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50 uppercase font-semibold tracking-wider">Type</label>
              <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="bg-[#1e293b] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors">
                {mockCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50 uppercase font-semibold tracking-wider">Priority (1-10)</label>
              <input type="number" min="1" max="10" value={formData.usefulness} onChange={e => setFormData({ ...formData, usefulness: e.target.value })} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" placeholder="5" />
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg transition-colors shadow-lg active:scale-95 h-[38px]">
              Add to Queue
            </button>
          </form>
        </section>

        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
          <div className="relative w-full sm:w-72">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              type="text"
              placeholder="Search vocabulary..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <p className="text-sm text-white/50">
            Showing <span className="text-white">{processedVocab.length}</span> of {vocabList.length} words
          </p>
        </div>

        <section className="glassmorphism rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/5 border-b border-white/10 text-xs uppercase tracking-wider text-white/50">
                  <th className="p-4 font-semibold cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleSort("albanian")}>
                    Albanian <SortIcon columnKey="albanian" />
                  </th>
                  <th className="p-4 font-semibold cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleSort("english")}>
                    English <SortIcon columnKey="english" />
                  </th>
                  <th className="p-4 font-semibold cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleSort("type")}>
                    Type <SortIcon columnKey="type" />
                  </th>
                  <th className="p-4 font-semibold cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleSort("next_review")}>
                    Next Review <SortIcon columnKey="next_review" />
                  </th>
                  <th className="p-4 font-semibold cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleSort("confidence")}>
                    Status <SortIcon columnKey="confidence" />
                  </th>
                  <th className="p-4 font-semibold cursor-pointer hover:bg-white/5 transition-colors" onClick={() => handleSort("mastery_score")}>
                    Mastery & Trend <SortIcon columnKey="mastery_score" />
                  </th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {loading && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-white/50">
                      <div className="w-6 h-6 border-2 border-white/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-2"></div>
                      Syncing database...
                    </td>
                  </tr>
                )}
                {!loading && processedVocab.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-white/50">
                      {searchQuery ? "No words match your search." : "No vocabulary found. Add your first word or import a CSV!"}
                    </td>
                  </tr>
                )}
                {!loading && processedVocab.map(item => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedWord(item)}
                    className="hover:bg-white/10 transition-colors group cursor-pointer"
                  >
                    <td className="p-4 font-bold text-white group-hover:text-indigo-300 transition-colors">
                      {item.albanian}
                    </td>
                    <td className="p-4 text-white/70">{item.english}</td>
                    <td className="p-4">
                      <span className="bg-white/5 px-2 py-1 rounded border border-white/10 text-xs text-white/70">
                        {item.type || "Unknown"}
                      </span>
                    </td>
                    <td className="p-4">
                      {formatDue(item.next_review)}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded border text-xs font-semibold whitespace-nowrap
                        ${item.confidence === 'Mastered' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          item.confidence === 'Almost' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            item.confidence === 'Improvement' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                              'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                        }
                      `}>
                        {item.confidence || "New"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-white/50 font-mono w-8">{Math.round((item.mastery_score || 0) * 100)}%</span>
                        <MiniTrend logs={item.review_logs} />
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={(e) => handleDelete(item.id, e)}
                        className="text-white/30 hover:text-rose-400 transition-colors p-2 rounded-lg hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title="Delete word"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
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
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
          onClick={() => !isEditingPrompt && setIsPromptModalOpen(false)}
        >
          <div
            className="bg-[#0F172A] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <header className="flex justify-between items-center p-4 sm:px-6 sm:py-4 border-b border-white/10">
              <h3 className="text-lg font-bold flex items-center gap-2 text-white">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" className="text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" /></svg>
                Data Pipeline Prompt
              </h3>
              <button
                onClick={() => setIsPromptModalOpen(false)}
                className="text-white/50 hover:text-white p-2 rounded-lg hover:bg-white/5 transition-colors"
                title="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </header>

            <div className="flex-1 overflow-hidden flex flex-col p-4 sm:p-6 bg-black/20">
              {isEditingPrompt ? (
                <textarea
                  value={editedPrompt}
                  onChange={e => setEditedPrompt(e.target.value)}
                  spellCheck={false}
                  className="flex-1 w-full bg-black/50 border border-indigo-500/50 focus:border-indigo-400 outline-none rounded-xl p-4 font-mono text-xs sm:text-sm text-emerald-300 resize-none transition-colors shadow-inner"
                />
              ) : (
                <div className="flex-1 w-full bg-black/50 border border-white/10 rounded-xl p-4 overflow-auto font-mono text-xs sm:text-sm text-emerald-300/80 whitespace-pre-wrap shadow-inner leading-relaxed">
                  {systemPrompt || "Loading prompt..."}
                </div>
              )}
            </div>

            <footer className="p-4 sm:px-6 sm:py-4 border-t border-white/10 flex justify-end gap-3 bg-white/5 rounded-b-2xl">
              {isEditingPrompt ? (
                <>
                  <button
                    onClick={() => { setIsEditingPrompt(false); setEditedPrompt(systemPrompt); }}
                    className="px-4 py-2 rounded-lg font-medium bg-white/5 hover:bg-white/10 text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSavePrompt}
                    disabled={isSavingPrompt}
                    className="px-4 py-2 rounded-lg font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-2 shadow-lg active:scale-95 disabled:opacity-50"
                  >
                    {isSavingPrompt ? (
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                    )}
                    {isSavingPrompt ? "Saving..." : "Save Changes"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setIsEditingPrompt(true)}
                    className="px-4 py-2 rounded-lg font-medium bg-white/5 hover:bg-white/10 text-white transition-colors flex items-center gap-2 active:scale-95"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    Edit
                  </button>
                  <button
                    onClick={handleCopyPrompt}
                    className="px-4 py-2 rounded-lg font-medium bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 transition-colors flex items-center gap-2 active:scale-95"
                  >
                    {copySuccess ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
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