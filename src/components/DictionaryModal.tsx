"use client";

import { useState, useEffect } from "react";
import { supabase, isDemoMode } from "@/lib/supabaseClient";

const mockCategories = ["Unknown", "Phrase", "Adjective", "Verb", "Adverb", "Noun (M)", "Noun (F)", "Command", "Preposition"];

export default function DictionaryModal({ word, onClose, onUpdate }: { word: any | null; onClose: () => void; onUpdate?: (updatedWord: any) => void }) {
    const [grammarData, setGrammarData] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editForm, setEditForm] = useState({ albanian: "", english: "", type: "Unknown" });

    const [highlightValue, setHighlightValue] = useState<string>("");

    useEffect(() => {
        if (word?.matchReason) {
            const match = word.matchReason.match(/↳ Matches:\s+(.+)/i);
            if (match) setHighlightValue(match[1].trim().toLowerCase());
        } else {
            setHighlightValue("");
        }
    }, [word]);

    const fetchGrammar = async () => {
        // Skip grammar fetch for temporary or loading words
        if (!word || word.isTemp || word.isLoadingTemp) return;
        setLoading(true);

        try {
            if (word.type === "Verb" || word.type === "Command") {
                const { data } = await supabase.from('conjugations').select('*').eq('vocab_id', word.id);
                if (data) {
                    const verbTenseOrder = ["indicative_present", "indicative_aorist", "indicative_imperfect", "subjunctive_present", "imperative_present", "participle"];
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
        if (!word || word.isTemp || word.isLoadingTemp) { 
            setIsEditing(false); 
            return; 
        }
        setEditForm({ albanian: word.albanian || "", english: word.english || "", type: word.type || "Unknown" });
        fetchGrammar();
    }, [word]);

    useEffect(() => {
        if (!loading && highlightValue && !word?.isTemp && !word?.isLoadingTemp) {
            setTimeout(() => {
                const el = document.getElementById("highlighted-grammar-cell");
                if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 300); 
        }
    }, [loading, highlightValue, word]);

    const handleSave = async () => {
        if (!word || isSaving || isDemoMode || word.isLoadingTemp) return;
        setIsSaving(true);

        const updatedData = { 
            albanian: (word.isTemp ? word.albanian : editForm.albanian).trim(), 
            english: (word.isTemp ? word.english : editForm.english).trim(), 
            type: (word.isTemp ? word.type : editForm.type) === "Unknown" ? null : (word.isTemp ? word.type : editForm.type) 
        };

        try {
            if (word.isTemp) {
                // If it's a temporary word, INSERT it into the database
                const newVocab = {
                    ...updatedData,
                    confidence: "New",
                    usefulness: 5,
                    mastery_score: 0.0,
                    streak: 0,
                    ease_factor: 2.5,
                    interval: 0,
                    next_review: new Date().toISOString()
                };

                const { data, error } = await supabase.from('vocab').insert([newVocab]).select().single();
                if (error) throw error;
                
                if (onUpdate && data) {
                    onUpdate(data); // Pass back the real DB object to the Immersion UI
                }
                onClose(); // Close the modal after adding
            } else {
                // Regular update flow
                const { error: vocabError } = await supabase.from('vocab').update(updatedData).eq('id', word.id);
                if (vocabError) throw vocabError;

                if (grammarData && grammarData.length > 0) {
                    let table = "";
                    if (word.type === "Verb" || word.type === "Command") table = 'conjugations';
                    else if (word.type === "Adjective") table = 'adjective_agreements';
                    else if (word.type?.startsWith("Noun")) table = 'noun_declensions';

                    if (table) {
                        const { error: grammarError } = await supabase.from(table).upsert(grammarData);
                        if (grammarError) throw grammarError;
                    }
                }
                setIsEditing(false);
                if (onUpdate) onUpdate({ ...word, ...updatedData });
            }
        } catch (err) {
            console.error("Failed to update word", err);
            alert("Failed to save changes.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditForm({ albanian: word.albanian || "", english: word.english || "", type: word.type || "Unknown" });
        fetchGrammar();
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && !isEditing) onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (isEditing && (e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave(); }
    };

    const renderCell = (label: string, value: string, field: string, idx: number) => {
        const isHighlighted = highlightValue && value && value.trim().toLowerCase() === highlightValue && !isEditing;

        return (
            <div 
                id={isHighlighted ? "highlighted-grammar-cell" : undefined}
                className={`flex items-center justify-between md:block gap-2 transition-all duration-700 ${
                    isHighlighted ? 'bg-indigo-100 ring-4 ring-indigo-200 rounded-xl p-3 -mx-3 -my-2 shadow-sm relative z-10' : ''
                }`}
            >
                <span className={`font-bold text-xs uppercase tracking-wider md:block md:mb-1 whitespace-nowrap ${
                    isHighlighted ? 'text-indigo-500' : 'text-slate-400'
                }`}>
                    {label}
                </span>
                {isEditing ? (
                    <input
                        type="text"
                        value={value || ""}
                        onChange={(e) => {
                            const newData = [...(grammarData || [])];
                            newData[idx][field] = e.target.value;
                            setGrammarData(newData);
                        }}
                        className="w-full min-w-[80px] bg-white border-2 border-slate-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-indigo-400 font-black text-right md:text-left transition-colors text-slate-700 shadow-inner"
                        placeholder="—"
                    />
                ) : (
                    <span className={`font-black text-right md:text-left ${
                        isHighlighted ? 'text-indigo-600 text-xl' : 'text-slate-700'
                    }`}>
                        {value || "—"}
                    </span>
                )}
            </div>
        );
    };

    if (!word) return null;

    const participleObj = (word.type === "Verb" || word.type === "Command") && grammarData ? grammarData.find(d => d.mood_tense?.toLowerCase() === 'participle') : null;
    const participleText = participleObj ? (participleObj.ata_ato || participleObj.une || "") : "";

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm animate-in fade-in duration-200" onClick={handleBackdropClick}>
            <div className="bg-white/90 backdrop-blur-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-[2.5rem] border-2 border-white shadow-[0_20px_60px_rgba(0,0,0,0.1)] relative text-left" onKeyDown={handleKeyDown}>
                
                <div className="absolute top-6 right-6 flex gap-2 z-10">
                    {!isEditing && !isDemoMode && !word.isTemp && !word.isLoadingTemp && (
                        <button onClick={() => setIsEditing(true)} className="text-slate-400 hover:text-indigo-500 transition-colors p-2 bg-slate-100 hover:bg-indigo-50 rounded-full" title="Edit Word">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                        </button>
                    )}
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-2 bg-slate-100 hover:bg-slate-200 rounded-full" title="Close">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                    </button>
                </div>

                <div className="p-6 md:p-8">
                    <div className="mb-6 relative">
                        {word.isLoadingTemp ? (
                            <div className="flex flex-col items-center justify-center py-8">
                                <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                                <p className="text-slate-400 font-bold animate-pulse">Defining "{word.albanian}"...</p>
                            </div>
                        ) : isEditing ? (
                            <div className="w-full pr-16 space-y-4 animate-in fade-in">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Type</label>
                                    <select value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })} className="bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 outline-none focus:border-indigo-400 font-bold transition-colors w-1/2">
                                        {mockCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">Albanian</label>
                                    <input type="text" value={editForm.albanian} onChange={(e) => setEditForm({ ...editForm, albanian: e.target.value })} className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-2xl font-black text-slate-800 outline-none focus:border-indigo-400 transition-colors" />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs text-slate-400 uppercase font-bold tracking-wider">English</label>
                                    <input type="text" value={editForm.english} onChange={(e) => setEditForm({ ...editForm, english: e.target.value })} className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-lg font-bold text-slate-500 outline-none focus:border-indigo-400 transition-colors" />
                                </div>
                                <div className="flex flex-wrap gap-3 pt-4">
                                    <button onClick={handleSave} disabled={isSaving} className="bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-black py-3 px-6 rounded-xl transition-all shadow-[0_4px_14px_rgba(99,102,241,0.3)] active:scale-95 disabled:opacity-50 flex items-center gap-2">
                                        {isSaving ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : "Save Changes"}
                                    </button>
                                    <button onClick={handleCancel} className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-black py-3 px-6 rounded-xl transition-colors active:scale-95">Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div className="pr-16 animate-in fade-in">
                                {word.isTemp && <span className="text-xs font-black uppercase tracking-widest text-emerald-500 mb-2 block bg-emerald-50 inline-block px-3 py-1 rounded-full">Quick Definition</span>}
                                {!word.isTemp && <span className="text-xs font-black uppercase tracking-widest text-indigo-500 mb-2 block bg-indigo-50 inline-block px-3 py-1 rounded-full">{word.type || "Uncategorized"}</span>}
                                <h2 className="text-4xl font-black text-slate-800 flex flex-wrap items-baseline gap-3 tracking-tight">
                                    {word.albanian}
                                    {participleText && <span className="text-xl font-bold text-slate-400">({participleText})</span>}
                                </h2>
                                <p className="text-xl font-bold text-slate-500 mt-2">{word.english}</p>
                            </div>
                        )}
                    </div>

                    {!word.isTemp && !word.isLoadingTemp && (
                        <div className={`border-t-2 border-slate-100 pt-8 transition-opacity ${isEditing ? 'opacity-100' : 'opacity-100'}`}>
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-10 opacity-50">
                                    <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-400 rounded-full animate-spin mb-4"></div>
                                    <p className="text-sm font-bold text-slate-400">Loading grammar rules...</p>
                                </div>
                            ) : grammarData && grammarData.length > 0 ? (
                                word.type === "Verb" || word.type === "Command" ? (
                                    <div className="space-y-6">
                                        {grammarData.map((conj, idx) => {
                                            if (!isEditing && conj.mood_tense?.toLowerCase() === 'participle') return null;
                                            return (
                                                <div key={idx} className={`rounded-[1.5rem] border-2 overflow-hidden transition-colors ${isEditing ? 'bg-indigo-50/50 border-indigo-200' : 'bg-white border-slate-100 shadow-sm'}`}>
                                                    <div className={`px-5 py-3 border-b-2 font-black text-sm tracking-wide ${isEditing ? 'bg-indigo-100/50 border-indigo-100 text-indigo-600' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                                                        {conj.mood_tense?.replace(/_/g, ' ')?.toUpperCase() || "UNKNOWN TENSE"}
                                                    </div>
                                                    {conj.mood_tense?.toLowerCase() === 'participle' ? (
                                                        <div className="p-5 text-sm w-full md:w-1/2">{renderCell("Form", conj.ata_ato || conj.une, "ata_ato", idx)}</div>
                                                    ) : (
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-6 p-5 text-sm">
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
                                ) : word.type?.startsWith("Noun") ? (
                                        <div className="space-y-6">
                                            {grammarData.map((decl, idx) => (
                                                <div key={idx} className={`rounded-[1.5rem] border-2 overflow-hidden transition-colors ${isEditing ? 'bg-sky-50/50 border-sky-200' : 'bg-white border-slate-100 shadow-sm'}`}>
                                                    <div className={`px-5 py-3 border-b-2 font-black text-sm tracking-wide ${isEditing ? 'bg-sky-100/50 border-sky-100 text-sky-600' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                                                        {decl.n_case?.toUpperCase() || "UNKNOWN CASE"}
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-5 text-sm">
                                                        <div className="space-y-4">
                                                            <div className="text-xs text-slate-400 uppercase tracking-widest font-black">Singular</div>
                                                            <div className="border-b-2 border-slate-50 pb-3">{renderCell("Indefinite", decl.indef_sg, "indef_sg", idx)}</div>
                                                            <div className="pt-1">{renderCell("Definite", decl.def_sg, "def_sg", idx)}</div>
                                                        </div>
                                                        <div className="space-y-4">
                                                            <div className="text-xs text-slate-400 uppercase tracking-widest font-black mt-4 md:mt-0">Plural</div>
                                                            <div className="border-b-2 border-slate-50 pb-3">{renderCell("Indefinite", decl.indef_pl, "indef_pl", idx)}</div>
                                                            <div className="pt-1">{renderCell("Definite", decl.def_pl, "def_pl", idx)}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : word.type === "Adjective" ? (
                                            <div className="space-y-6">
                                                {grammarData.map((agr, idx) => (
                                                    <div key={idx} className={`rounded-[1.5rem] border-2 overflow-hidden transition-colors ${isEditing ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-slate-100 shadow-sm'}`}>
                                                        <div className={`px-5 py-3 border-b-2 font-black text-sm tracking-wide ${isEditing ? 'bg-emerald-100/50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                                                            {agr.adj_case?.toUpperCase() || "UNKNOWN CASE"}
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-5 text-sm">
                                                            <div className="space-y-4">
                                                                <div className="text-xs text-slate-400 uppercase tracking-widest font-black">Singular</div>
                                                                <div className="border-b-2 border-slate-50 pb-3">{renderCell("Indef. Masc.", agr.indef_masc_sg, "indef_masc_sg", idx)}</div>
                                                                <div className="border-b-2 border-slate-50 pb-3 pt-1">{renderCell("Def. Masc.", agr.def_masc_sg, "def_masc_sg", idx)}</div>
                                                                <div className="border-b-2 border-slate-50 pb-3 pt-1">{renderCell("Indef. Fem.", agr.indef_fem_sg, "indef_fem_sg", idx)}</div>
                                                                <div className="pt-1">{renderCell("Def. Fem.", agr.def_fem_sg, "def_fem_sg", idx)}</div>
                                                            </div>
                                                            <div className="space-y-4">
                                                                <div className="text-xs text-slate-400 uppercase tracking-widest font-black mt-4 md:mt-0">Plural</div>
                                                                <div className="border-b-2 border-slate-50 pb-3">{renderCell("Indef. Masc.", agr.indef_masc_pl, "indef_masc_pl", idx)}</div>
                                                                <div className="border-b-2 border-slate-50 pb-3 pt-1">{renderCell("Def. Masc.", agr.def_masc_pl, "def_masc_pl", idx)}</div>
                                                                <div className="border-b-2 border-slate-50 pb-3 pt-1">{renderCell("Indef. Fem.", agr.indef_fem_pl, "indef_fem_pl", idx)}</div>
                                                                <div className="pt-1">{renderCell("Def. Fem.", agr.def_fem_pl, "def_fem_pl", idx)}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null
                            ) : (
                                <div className="text-center py-12">
                                    <p className="text-slate-400 font-bold">No grammar matrices available for this word.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {word.isTemp && !isDemoMode && (
                        <div className="mt-6 pt-6 border-t-2 border-slate-100 flex justify-center animate-in fade-in">
                            <button 
                                onClick={handleSave} 
                                disabled={isSaving}
                                className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 px-8 rounded-2xl shadow-[0_8px_20px_rgba(16,185,129,0.3)] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSaving ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : "➕ Add to SRS Library"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}