"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

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

// ────────────────────────────────────────────────────────────────
// UI Component: Interactive Dictionary Modal
// ────────────────────────────────────────────────────────────────
const DictionaryModal = ({ word, onClose }: { word: VocabType | null; onClose: () => void }) => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="glassmorphism w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 shadow-2xl relative">
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
              
              // ── VERB TABLES ──
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

              // ── NOUN TABLES ──
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

              // ── ADJECTIVE TABLES ──
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal State
  const [selectedWord, setSelectedWord] = useState<VocabType | null>(null);

  useEffect(() => {
    fetchVocab();
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
    e.stopPropagation(); // Prevents the row click from triggering the modal
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
        let cc = str[i], nc = str[i+1];
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
      return `"${v.albanian}","${v.english}","${v.type || 'Unknown'}","${v.confidence}",${v.usefulness},${v.mastery_score},${v.streak},"${v.next_review || ''}"`;
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

  // ────────────────────────────────────────────────────────────────
  // Sorting and Filtering Logic
  // ────────────────────────────────────────────────────────────────
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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              Back to Hub
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Manage Vocab</h1>
          </div>
          
          <div className="flex gap-3">
            <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleImport} />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="bg-white/10 hover:bg-white/20 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2 active:scale-95 disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              {isImporting ? "Importing..." : "Import CSV"}
            </button>

            <button 
              onClick={handleExport}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20 active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              Export
            </button>
          </div>
        </header>

        {/* Add Form */}
        <section className="glassmorphism p-6 rounded-2xl border border-white/10 mb-8">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" className="text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            Add Single Word
          </h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
            <div className="flex flex-col gap-1 lg:col-span-1">
              <label className="text-xs text-white/50 uppercase font-semibold tracking-wider">Albanian</label>
              <input required type="text" value={formData.albanian} onChange={e => setFormData({...formData, albanian: e.target.value})} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Bukur" />
            </div>
            <div className="flex flex-col gap-1 lg:col-span-1">
              <label className="text-xs text-white/50 uppercase font-semibold tracking-wider">English</label>
              <input required type="text" value={formData.english} onChange={e => setFormData({...formData, english: e.target.value})} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" placeholder="e.g. Beautiful" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50 uppercase font-semibold tracking-wider">Type</label>
              <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="bg-[#1e293b] border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors">
                {mockCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-white/50 uppercase font-semibold tracking-wider">Priority (1-10)</label>
              <input type="number" min="1" max="10" value={formData.usefulness} onChange={e => setFormData({...formData, usefulness: e.target.value})} className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 transition-colors" placeholder="5" />
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg transition-colors shadow-lg active:scale-95 h-[38px]">
              Add to Queue
            </button>
          </form>
        </section>

        {/* Toolbar (Search & Stats) */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
          <div className="relative w-full sm:w-72">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
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

        {/* List View */}
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
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Render the interactive dictionary modal if a word is clicked */}
      <DictionaryModal word={selectedWord} onClose={() => setSelectedWord(null)} />

    </main>
  );
}