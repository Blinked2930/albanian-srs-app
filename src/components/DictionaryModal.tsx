"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const getSupabase = () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    if (!url || !key) return null;
    return createClient(url, key);
};

const mockCategories = ["Unknown", "Phrase", "Adjective", "Verb", "Adverb", "Noun (M)", "Noun (F)", "Command", "Preposition"];

export default function DictionaryModal({ word, onClose, onUpdate }: { word: any | null; onClose: () => void; onUpdate?: (updatedWord: any) => void }) {
    const [grammarData, setGrammarData] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(false);

    // Edit Mode State
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editForm, setEditForm] = useState({ albanian: "", english: "", type: "Unknown" });

    const fetchGrammar = async () => {
        if (!word) return;
        setLoading(true);
        const supabase = getSupabase();
        if (!supabase) return;

        try {
            if (word.type === "Verb" || word.type === "Command") {
                const { data } = await supabase.from('conjugations').select('*').eq('vocab_id', word.id);
                if (data) {
                    const verbTenseOrder = [
                        "indicative_present",
                        "indicative_aorist",
                        "indicative_imperfect",
                        "subjunctive_present",
                        "imperative_present",
                        "participle"
                    ];
                    data.sort((a, b) => {
                        const aIdx = verbTenseOrder.indexOf(a.mood_tense);
                        const bIdx = verbTenseOrder.indexOf(b.mood_tense);
                        if (aIdx === -1 && bIdx === -1) return 0;
                        if (aIdx === -1) return 1;
                        if (bIdx === -1) return -1;
                        return aIdx - bIdx;
                    });
                }
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

    useEffect(() => {
        if (!word) {
            setIsEditing(false);
            return;
        }

        // Sync edit form with current word
        setEditForm({
            albanian: word.albanian || "",
            english: word.english || "",
            type: word.type || "Unknown"
        });

        fetchGrammar();
    }, [word]);

    const handleSave = async () => {
        if (!word || isSaving) return;
        setIsSaving(true);
        const supabase = getSupabase();
        if (!supabase) return;

        // 1. Update Base Vocab Row
        const updatedData = {
            albanian: editForm.albanian.trim(),
            english: editForm.english.trim(),
            type: editForm.type === "Unknown" ? null : editForm.type,
        };

        try {
            const { error: vocabError } = await supabase
                .from('vocab')
                .update(updatedData)
                .eq('id', word.id);

            if (vocabError) throw vocabError;

            // 2. Bulk Update Grammar Matrices (if they exist)
            if (grammarData && grammarData.length > 0) {
                let table = "";
                if (word.type === "Verb" || word.type === "Command") table = 'conjugations';
                else if (word.type === "Adjective") table = 'adjective_agreements';
                else if (word.type?.startsWith("Noun")) table = 'noun_declensions';

                if (table) {
                    // upsert handles updating rows based on their existing primary IDs
                    const { error: grammarError } = await supabase.from(table).upsert(grammarData);
                    if (grammarError) throw grammarError;
                }
            }

            setIsEditing(false);
            if (onUpdate) {
                onUpdate({ ...word, ...updatedData });
            }
        } catch (err) {
            console.error("Failed to update word or grammar", err);
            alert("Failed to save changes.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        // Reset base word form
        setEditForm({ albanian: word.albanian || "", english: word.english || "", type: word.type || "Unknown" });
        // Re-fetch grammar to undo any unsaved cell typing
        fetchGrammar();
    };

    // Close when clicking the dark backdrop outside the modal (if not editing)
    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && !isEditing) {
            onClose();
        }
    };

    // Save when Cmd+Enter or Ctrl+Enter is pressed
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (isEditing && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSave();
        }
    };

    // Helper function to render a grammar cell (switches to an input when editing)
    const renderCell = (label: string, value: string, field: string, idx: number) => (
        <div className="flex items-center justify-between md:block gap-2">
            <span className="text-white/40 md:block md:mb-1 whitespace-nowrap">{label}</span>
            {isEditing ? (
                <input
                    type="text"
                    value={value || ""}
                    onChange={(e) => {
                        const newData = [...(grammarData || [])];
                        newData[idx][field] = e.target.value;
                        setGrammarData(newData);
                    }}
                    className="w-full min-w-[80px] bg-black/50 border border-white/20 rounded px-2 py-1 text-sm outline-none focus:border-indigo-400 font-medium text-right md:text-left transition-colors"
                    placeholder="—"
                />
            ) : (
                <span className="font-medium text-right md:text-left">{value || "—"}</span>
            )}
        </div>
    );

    if (!word) return null;

    const participleObj = (word.type === "Verb" || word.type === "Command") && grammarData
        ? grammarData.find(d => d.mood_tense?.toLowerCase() === 'participle')
        : null;
    const participleText = participleObj ? (participleObj.ata_ato || participleObj.une || "") : "";

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={handleBackdropClick}
        >
            <div
                className="glassmorphism w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 shadow-2xl relative text-left"
                onKeyDown={handleKeyDown}
            >

                <div className="absolute top-4 right-4 flex gap-2 z-10">
                    {!isEditing && (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="text-white/50 hover:text-white transition-colors p-2 bg-white/5 hover:bg-white/10 rounded-full"
                            title="Edit Word & Grammar"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="text-white/50 hover:text-white transition-colors p-2 bg-white/5 hover:bg-white/10 rounded-full"
                        title="Close"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                    </button>
                </div>

                <div className="p-6 md:p-8">
                    <div className="mb-6 relative">
                        {isEditing ? (
                            <div className="w-full pr-16 space-y-3 animate-in fade-in">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-white/50 uppercase font-semibold tracking-wider">Type</label>
                                    <select
                                        value={editForm.type}
                                        onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                                        className="bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-indigo-300 outline-none focus:border-indigo-500 transition-colors w-1/2"
                                    >
                                        {mockCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-white/50 uppercase font-semibold tracking-wider">Albanian</label>
                                    <input
                                        type="text"
                                        value={editForm.albanian}
                                        onChange={(e) => setEditForm({ ...editForm, albanian: e.target.value })}
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-2xl font-black text-white outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs text-white/50 uppercase font-semibold tracking-wider">English</label>
                                    <input
                                        type="text"
                                        value={editForm.english}
                                        onChange={(e) => setEditForm({ ...editForm, english: e.target.value })}
                                        className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-lg text-white/60 outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>
                                <div className="flex flex-wrap gap-3 pt-2">
                                    <button
                                        onClick={handleSave}
                                        disabled={isSaving}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold py-2 px-6 rounded-lg transition-colors shadow-lg shadow-indigo-500/20 active:scale-95 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : null}
                                        {isSaving ? "Saving..." : "Save (Cmd+Enter)"}
                                    </button>
                                    <button
                                        onClick={handleCancel}
                                        className="bg-white/10 hover:bg-white/20 text-white text-sm font-bold py-2 px-6 rounded-lg transition-colors active:scale-95"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="pr-16 animate-in fade-in">
                                <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-1 block">
                                    {word.type || "Uncategorized"}
                                </span>
                                <h2 className="text-3xl font-black text-white flex items-baseline gap-3">
                                    {word.albanian}
                                    {participleText && (
                                        <span className="text-xl font-normal text-white/50">
                                            ({participleText})
                                        </span>
                                    )}
                                </h2>
                                <p className="text-lg text-white/60 mt-1">{word.english}</p>
                            </div>
                        )}
                    </div>

                    <div className={`border-t border-white/10 pt-6 transition-opacity ${isEditing ? 'opacity-100' : 'opacity-100'}`}>
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-10 opacity-50">
                                <div className="w-6 h-6 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin mb-2"></div>
                                <p className="text-sm">Fetching grammar matrices...</p>
                            </div>
                        ) : grammarData && grammarData.length > 0 ? (

                            // ── VERB TABLES ──
                            word.type === "Verb" || word.type === "Command" ? (
                                <div className="space-y-6">
                                    {grammarData.map((conj, idx) => {
                                        if (!isEditing && conj.mood_tense?.toLowerCase() === 'participle') {
                                            return null;
                                        }
                                        return (
                                            <div key={idx} className={`rounded-xl border overflow-hidden transition-colors ${isEditing ? 'bg-indigo-900/10 border-indigo-500/30' : 'bg-black/30 border-white/5'}`}>
                                                <div className={`px-4 py-2 border-b font-semibold text-sm ${isEditing ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-200' : 'bg-white/5 border-white/5 text-indigo-300'}`}>
                                                    {conj.mood_tense?.replace(/_/g, ' ')?.toUpperCase() || "UNKNOWN TENSE"}
                                                </div>
                                                {conj.mood_tense?.toLowerCase() === 'participle' ? (
                                                    <div className="p-4 text-sm w-full md:w-1/2">
                                                        {renderCell("Form", conj.ata_ato || conj.une, "ata_ato", idx)}
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-4 p-4 text-sm">
                                                        {renderCell("Unë", conj.une, "une", idx)}
                                                        {renderCell("Ti", conj.ti, "ti", idx)}
                                                        {renderCell("Ai/Ajo", conj.ai_ajo, "ai_ajo", idx)}
                                                        {renderCell("Ne", conj.ne, "ne", idx)}
                                                        {renderCell("Ju", conj.ju, "ju", idx)}
                                                        {renderCell("Ata/Ato", conj.ata_ato, "ata_ato", idx)}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) :

                                // ── NOUN TABLES ──
                                word.type?.startsWith("Noun") ? (
                                    <div className="space-y-6">
                                        {grammarData.map((decl, idx) => (
                                            <div key={idx} className={`rounded-xl border overflow-hidden transition-colors ${isEditing ? 'bg-sky-900/10 border-sky-500/30' : 'bg-black/30 border-white/5'}`}>
                                                <div className={`px-4 py-2 border-b font-semibold text-sm ${isEditing ? 'bg-sky-500/20 border-sky-500/30 text-sky-200' : 'bg-white/5 border-white/5 text-sky-300'}`}>
                                                    {decl.n_case?.toUpperCase() || "UNKNOWN CASE"}
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 text-sm">
                                                    <div className="space-y-3">
                                                        <div className="text-xs text-white/30 uppercase tracking-widest font-bold">Singular</div>
                                                        <div className="border-b border-white/5 pb-2">{renderCell("Indefinite", decl.indef_sg, "indef_sg", idx)}</div>
                                                        <div className="pt-1">{renderCell("Definite", decl.def_sg, "def_sg", idx)}</div>
                                                    </div>
                                                    <div className="space-y-3">
                                                        <div className="text-xs text-white/30 uppercase tracking-widest font-bold mt-2 md:mt-0">Plural</div>
                                                        <div className="border-b border-white/5 pb-2">{renderCell("Indefinite", decl.indef_pl, "indef_pl", idx)}</div>
                                                        <div className="pt-1">{renderCell("Definite", decl.def_pl, "def_pl", idx)}</div>
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
                                                <div key={idx} className={`rounded-xl border overflow-hidden transition-colors ${isEditing ? 'bg-emerald-900/10 border-emerald-500/30' : 'bg-black/30 border-white/5'}`}>
                                                    <div className={`px-4 py-2 border-b font-semibold text-sm ${isEditing ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-200' : 'bg-white/5 border-white/5 text-emerald-300'}`}>
                                                        {agr.adj_case?.toUpperCase() || "UNKNOWN CASE"}
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 text-sm">
                                                        <div className="space-y-3">
                                                            <div className="text-xs text-white/30 uppercase tracking-widest font-bold">Singular</div>
                                                            <div className="border-b border-white/5 pb-2">{renderCell("Indef. Masc.", agr.indef_masc_sg, "indef_masc_sg", idx)}</div>
                                                            <div className="border-b border-white/5 pb-2 pt-1">{renderCell("Def. Masc.", agr.def_masc_sg, "def_masc_sg", idx)}</div>
                                                            <div className="border-b border-white/5 pb-2 pt-1">{renderCell("Indef. Fem.", agr.indef_fem_sg, "indef_fem_sg", idx)}</div>
                                                            <div className="pt-1">{renderCell("Def. Fem.", agr.def_fem_sg, "def_fem_sg", idx)}</div>
                                                        </div>
                                                        <div className="space-y-3">
                                                            <div className="text-xs text-white/30 uppercase tracking-widest font-bold mt-2 md:mt-0">Plural</div>
                                                            <div className="border-b border-white/5 pb-2">{renderCell("Indef. Masc.", agr.indef_masc_pl, "indef_masc_pl", idx)}</div>
                                                            <div className="border-b border-white/5 pb-2 pt-1">{renderCell("Def. Masc.", agr.def_masc_pl, "def_masc_pl", idx)}</div>
                                                            <div className="border-b border-white/5 pb-2 pt-1">{renderCell("Indef. Fem.", agr.indef_fem_pl, "indef_fem_pl", idx)}</div>
                                                            <div className="pt-1">{renderCell("Def. Fem.", agr.def_fem_pl, "def_fem_pl", idx)}</div>
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
}