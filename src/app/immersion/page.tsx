"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { supabase, isDemoMode } from "@/lib/supabaseClient";
import DictionaryModal from "@/components/DictionaryModal";
import { useTimeTracker } from "@/hooks/useTimeTracker";

interface Story {
  id: string;
  title_albanian: string;
  title_english: string;
  content_albanian: string;
  content_english: string;
  target_vocab_ids: string[];
  created_at: string;
}

type AudioState = 'idle' | 'loading' | 'playing' | 'paused';

export default function ImmersionReader() {
  useTimeTracker("immersion");

  const [stories, setStories] = useState<Story[]>([]);
  const [currentStory, setCurrentStory] = useState<Story | null>(null);
  const [vocabMap, setVocabMap] = useState<Record<string, any>>({});
  
  const [allConjugations, setAllConjugations] = useState<any[]>([]);
  const [allNouns, setAllNouns] = useState<any[]>([]);
  const [allAdjectives, setAllAdjectives] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);

  const [storyToDelete, setStoryToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeletingStory, setIsDeletingStory] = useState(false);

  const [modalWord, setModalWord] = useState<any | null>(null);
  const [toast, setToast] = useState<{ message: string, emoji: string } | null>(null);

  const [selectionText, setSelectionText] = useState("");
  const [tooltipPos, setTooltipPos] = useState<{ x: number, y: number } | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);

  // --- NEW: Advanced Audio States & Refs ---
  const [audioState, setAudioState] = useState<AudioState>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const readerRef = useRef<HTMLDivElement>(null);

  // Stop audio if user leaves the page
  useEffect(() => {
    return () => { 
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  const handleSetCurrentStory = (story: Story | null) => {
    setCurrentStory(story);
    if (audioRef.current) {
      audioRef.current.pause();
      setAudioState('idle');
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    
    if (story) {
      sessionStorage.setItem('immersion_current_story_id', story.id);
      const savedScroll = sessionStorage.getItem(`immersion_scroll_${story.id}`);
      if (savedScroll) {
        setTimeout(() => window.scrollTo({ top: parseInt(savedScroll), behavior: 'instant' }), 50);
      } else {
        window.scrollTo(0, 0);
      }
    } else {
      sessionStorage.removeItem('immersion_current_story_id');
      window.scrollTo(0, 0);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      if (currentStory) {
        sessionStorage.setItem(`immersion_scroll_${currentStory.id}`, window.scrollY.toString());
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [currentStory]);

  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !readerRef.current) {
        setTooltipPos(null);
        return;
      }

      if (readerRef.current.contains(selection.anchorNode)) {
        const text = selection.toString().trim();
        if (text.length > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setSelectionText(text);
          setTooltipPos({
            x: rect.left + rect.width / 2,
            y: rect.top - 10 
          });
        }
      }
    };

    document.addEventListener("selectionchange", handleSelection);
    return () => document.removeEventListener("selectionchange", handleSelection);
  }, []);

  const showToast = (message: string, emoji: string) => {
    setToast({ message, emoji });
    setTimeout(() => setToast(null), 3000);
  };

  // --- SMART TEXT TO SPEECH (Tooltips) ---
  const speakText = async (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    if (isDemoMode) {
      if (!('speechSynthesis' in window)) {
        showToast("Audio not supported on this browser.", "🔇");
        return;
      }
      window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'sq-AL';
      utterance.rate = 0.85; 
      window.speechSynthesis.speak(utterance);
      return;
    }

    try {
      if (audioRef.current) audioRef.current.pause();

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!res.ok) {
        if (res.status === 429) {
          showToast("Azure audio quota reached for this month!", "🛑");
          return;
        }
        throw new Error('Failed to fetch audio');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioRef.current = new Audio(url);
      audioRef.current.play();

    } catch (error) {
      console.error("Audio playback error:", error);
      showToast("Failed to play audio. Check Azure keys.", "🔇");
    }
  };

  // --- ADVANCED AUDIO CONTROLS (Story Playback) ---
  const playStoryAudio = async () => {
    if (isDemoMode) {
      if (!('speechSynthesis' in window)) {
        showToast("Audio not supported on this browser.", "🔇");
        return;
      }
      if (audioState === 'paused') {
        window.speechSynthesis.resume();
        setAudioState('playing');
      } else if (currentStory) {
        window.speechSynthesis.cancel();
        const fullText = `${currentStory.title_albanian}. ${currentStory.content_albanian.replace(/\*/g, '')}`;
        const utterance = new SpeechSynthesisUtterance(fullText);
        utterance.lang = 'sq-AL';
        utterance.rate = 0.85;
        utterance.onend = () => setAudioState('idle');
        window.speechSynthesis.speak(utterance);
        setAudioState('playing');
      }
      return;
    }

    if (audioState === 'paused' && audioRef.current) {
      audioRef.current.play();
      setAudioState('playing');
      return;
    } 
    
    if (currentStory) {
      setAudioState('loading');
      try {
        const fullText = `${currentStory.title_albanian}. ${currentStory.content_albanian.replace(/\*/g, '')}`;
        
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: fullText })
        });

        if (!res.ok) {
          if (res.status === 429) {
            showToast("Azure audio quota reached for this month!", "🛑");
            setAudioState('idle');
            return;
          }
          throw new Error('Failed to fetch audio');
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        
        if (audioRef.current) audioRef.current.pause();
        audioRef.current = new Audio(url);
        audioRef.current.onended = () => setAudioState('idle');
        audioRef.current.play();
        setAudioState('playing');
        
      } catch (error) {
        console.error("Audio playback error:", error);
        setAudioState('idle');
        showToast("Failed to load story audio.", "🔇");
      }
    }
  };

  const pauseStoryAudio = () => {
    if (audioRef.current) audioRef.current.pause();
    if (isDemoMode && 'speechSynthesis' in window) window.speechSynthesis.pause();
    setAudioState('paused');
  };

  const stopStoryAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (isDemoMode && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    setAudioState('idle');
  };

  async function fetchData() {
    setLoading(true);
    try {
      const [storyRes, vocabRes, conjRes, nounRes, adjRes] = await Promise.all([
        supabase.from("stories").select("*").order("created_at", { ascending: false }),
        supabase.from("vocab").select("*"),
        supabase.from("conjugations").select("*"),
        supabase.from("noun_declensions").select("*"),
        supabase.from("adjective_agreements").select("*")
      ]);

      if (storyRes.data) {
        setStories(storyRes.data);
        const savedStoryId = sessionStorage.getItem('immersion_current_story_id');
        if (savedStoryId) {
          const found = storyRes.data.find(s => s.id === savedStoryId);
          if (found) {
            setCurrentStory(found);
            const savedScroll = sessionStorage.getItem(`immersion_scroll_${found.id}`);
            if (savedScroll) {
              setTimeout(() => window.scrollTo({ top: parseInt(savedScroll), behavior: 'instant' }), 50);
            }
          }
        }
      }

      if (vocabRes.data) {
        const map: Record<string, any> = {};
        vocabRes.data.forEach(v => {
          map[v.albanian.toLowerCase()] = v;
        });
        setVocabMap(map);
      }

      if (conjRes.data) setAllConjugations(conjRes.data);
      if (nounRes.data) setAllNouns(nounRes.data);
      if (adjRes.data) setAllAdjectives(adjRes.data);

    } catch (error) {
      console.error("Error fetching immersion data:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleGenerateStory = async () => {
    if (isDemoMode) {
      showToast("Ghost Mode: Story generation is disabled for guests.", "👻");
      return;
    }

    setIsGeneratingStory(true);
    try {
      const res = await fetch('/api/generate-story', { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        showToast("New story generated successfully!", "✨");
        await fetchData(); 
      } else {
        showToast(data.error || "Failed to generate story.", "❌");
      }
    } catch (err) {
      console.error(err);
      showToast("Network error while generating.", "🌐");
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const promptDeleteStory = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDemoMode) {
      showToast("Deleting stories is disabled for guests.", "👻");
      return;
    }
    setStoryToDelete({ id, title });
  };

  const confirmDeleteStory = async () => {
    if (!storyToDelete) return;
    setIsDeletingStory(true);
    
    try {
      const res = await fetch('/api/delete-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: storyToDelete.id })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete story");
      }
      
      setStories(prev => prev.filter(s => s.id !== storyToDelete.id));
      
      if (currentStory?.id === storyToDelete.id) {
        handleSetCurrentStory(null);
      }

      showToast("Story deleted.", "🗑️");
    } catch (err: any) {
      console.error("Error deleting story:", err);
      showToast(err.message || "Failed to delete story.", "❌");
    } finally {
      setIsDeletingStory(false);
      setStoryToDelete(null);
    }
  };

  const handleWordClick = async (rawWord: string) => {
    const cleanWord = rawWord.replace(/[^\w\sëçËÇ]/gi, '').toLowerCase().trim();
    if (!cleanWord) return;

    const exactMatch = vocabMap[cleanWord];
    if (exactMatch) {
      setModalWord(exactMatch);
      return;
    }

    if (cleanWord.length >= 2) {
      const phraseMatch = Object.values(vocabMap).find(v => {
        const target = v.albanian.toLowerCase();
        return target.includes(' ') && target.split(' ').includes(cleanWord);
      });
      if (phraseMatch) {
        setModalWord(phraseMatch);
        return;
      }
    }

    let deepMatchParentId = null;
    let matchReasonStr = null;

    for (const c of allConjugations) {
      if ([c.une, c.ti, c.ai_ajo, c.ne, c.ju, c.ata_ato].some((v: any) => v && v.toLowerCase() === cleanWord)) {
        deepMatchParentId = c.vocab_id;
        matchReasonStr = `↳ Matches: ${cleanWord}`;
        break;
      }
    }
    
    if (!deepMatchParentId) {
      for (const n of allNouns) {
        if ([n.indef_sg, n.def_sg, n.indef_pl, n.def_pl].some((v: any) => v && v.toLowerCase() === cleanWord)) {
          deepMatchParentId = n.vocab_id;
          matchReasonStr = `↳ Matches: ${cleanWord}`;
          break;
        }
      }
    }

    if (!deepMatchParentId) {
      for (const a of allAdjectives) {
        if ([a.masc_sg, a.fem_sg, a.masc_pl, a.fem_pl].some((v: any) => v && v.toLowerCase() === cleanWord)) {
          deepMatchParentId = a.vocab_id;
          matchReasonStr = `↳ Matches: ${cleanWord}`;
          break;
        }
      }
    }

    if (deepMatchParentId) {
      const parentVocab = Object.values(vocabMap).find(v => v.id === deepMatchParentId);
      if (parentVocab) {
        setModalWord({ ...parentVocab, matchReason: matchReasonStr });
        return;
      }
    }

    setModalWord({ albanian: cleanWord, isLoadingTemp: true });

    if (isDemoMode) {
      setModalWord({ albanian: cleanWord, english: "Ghost Mode Translation", type: "Unknown", isTemp: true });
      return;
    }

    try {
      const res = await fetch('/api/quick-define', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: cleanWord, context: currentStory?.content_albanian })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setModalWord({
          albanian: cleanWord,
          english: data.english,
          type: data.type,
          isTemp: true 
        });
      } else {
        setModalWord(null);
        showToast("Failed to define word.", "❌");
      }
    } catch (err) {
      setModalWord(null);
      showToast("Network error.", "🌐");
    }
  };

  const handleExplainHighlight = async () => {
    if (!selectionText || !currentStory) return;
    
    if (isDemoMode) {
      setExplanation(`✨ **Ghost Mode Breakdown:**\n\nIn the real app, Gemini analyzes the exact grammar, conjugations, and cultural context of "${selectionText}" right here!`);
      return;
    }

    setIsExplaining(true);
    setExplanation(null);

    try {
      const res = await fetch('/api/explain-sentence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          albanian_sentence: selectionText, 
          english_translation: `Context from story: ${currentStory.content_english}` 
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        setExplanation(data.explanation);
      } else {
        showToast("Failed to generate explanation.", "❌");
      }
    } catch (err) {
      showToast("Network error.", "🌐");
    } finally {
      setIsExplaining(false);
    }
  };

  const handleModalUpdate = (updatedWord: any) => {
    setVocabMap(prev => ({ ...prev, [updatedWord.albanian.toLowerCase()]: updatedWord }));
    setModalWord(updatedWord); 
  };

  const renderInteractiveText = (text: string) => {
    const cleanText = text.replace(/\*/g, '');
    const tokens = cleanText.split(/([\s\n]+)/);

    return tokens.map((token, idx) => {
      if (/^[\s\n]+$/.test(token)) {
        return token.includes('\n') ? <br key={idx} /> : <span key={idx}> </span>;
      }

      const cleanWord = token.replace(/[^\w\sëçËÇ]/gi, '').toLowerCase();
      
      const isWeakTarget = currentStory?.target_vocab_ids?.some(id => {
        const v = Object.values(vocabMap).find(vocab => vocab.id === id);
        if (!v) return false;
        
        const target = v.albanian.toLowerCase();
        
        if (target === cleanWord) return true;
        if (target.includes(' ') && cleanWord.length > 2 && target.split(' ').includes(cleanWord)) return true;
        
        if (cleanWord.length >= 4 && target.length >= 4) {
           const root = target.substring(0, target.length - 1);
           if (cleanWord.startsWith(root)) return true;
        }
        
        return false;
      });

      return (
        <span
          key={idx}
          onClick={() => handleWordClick(token)}
          className={`cursor-pointer transition-colors duration-200 active:bg-indigo-100 rounded-sm px-[1px]
            ${isWeakTarget ? 'text-fuchsia-500 font-black border-b-2 border-fuchsia-200' : 'hover:text-indigo-500 hover:bg-indigo-50'}
          `}
        >
          {token}
        </span>
      );
    });
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fafafa] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-fuchsia-500 rounded-full animate-spin"></div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#fafafa] p-4 sm:p-8 pt-8 sm:pt-12 pb-[calc(env(safe-area-inset-bottom)+6rem)] relative overflow-x-hidden">
      <div className="fixed inset-0 w-full h-full bg-gradient-to-br from-indigo-100/40 via-purple-50/20 to-fuchsia-100/40 z-0 pointer-events-none"></div>

      {isDemoMode && (
        <div className="fixed top-4 left-4 z-[400] bg-slate-800 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg tracking-widest uppercase border-2 border-slate-600 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
          Ghost Mode: Read Only
        </div>
      )}

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] animate-in slide-in-from-top-10 fade-in duration-300">
          <div className="bg-slate-800/95 backdrop-blur-xl border-2 border-slate-700 shadow-2xl px-6 py-3.5 rounded-full flex items-center gap-3">
            <span className="text-xl">{toast.emoji}</span>
            <span className="text-white font-bold text-sm tracking-wide">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto w-full z-10 relative">
        
        {!currentStory && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
              <div>
                <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-600 font-bold text-sm mb-4 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                  Dashboard
                </Link>
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-800">Story Library</h1>
              </div>

              {stories.length > 0 && (
                <button 
                  onClick={handleGenerateStory} 
                  disabled={isGeneratingStory}
                  className="bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-black px-6 py-3 sm:py-3.5 rounded-2xl transition-all shadow-[0_4px_14px_rgba(217,70,239,0.3)] active:scale-95 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                >
                  {isGeneratingStory ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : "✨ Generate New Story"}
                </button>
              )}
            </header>

            {stories.length === 0 ? (
              <div className="bg-white/80 backdrop-blur-xl p-8 sm:p-12 rounded-[2.5rem] border-2 border-white shadow-sm text-center flex flex-col items-center">
                <div className="text-6xl mb-6 animate-bounce">📖</div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-700 mb-3">No Stories Yet</h2>
                <p className="text-slate-500 font-bold mb-8 max-w-md">
                  Tap the button below to generate a custom Albanian flash fiction story based on your absolute weakest vocabulary words.
                </p>
                <button 
                  onClick={handleGenerateStory} 
                  disabled={isGeneratingStory}
                  className="w-full sm:w-auto bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-black py-4 px-8 rounded-[1.5rem] transition-all shadow-[0_8px_20px_rgba(217,70,239,0.3)] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 text-lg"
                >
                  {isGeneratingStory ? (
                    <>
                      <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Writing Story...
                    </>
                  ) : (
                    <>✨ Generate First Story</>
                  )}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {stories.map((story) => (
                  <div 
                    key={story.id} 
                    onClick={() => handleSetCurrentStory(story)}
                    className="bg-white/80 backdrop-blur-md p-6 sm:p-8 rounded-[2rem] shadow-sm hover:shadow-md transition-all text-left border-2 border-white hover:border-fuchsia-200 group flex flex-col h-full relative cursor-pointer"
                  >
                    {!isDemoMode && (
                      <button 
                        onClick={(e) => promptDeleteStory(story.id, story.title_english, e)} 
                        className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 transition-colors p-2 rounded-xl hover:bg-rose-50 bg-white opacity-0 group-hover:opacity-100" 
                        title="Delete Story"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                      </button>
                    )}

                    <span className="text-[11px] font-black text-slate-400 mb-3 block uppercase tracking-widest">
                      {new Date(story.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-slate-800 group-hover:text-fuchsia-600 transition-colors mb-1 leading-tight pr-8">
                      {story.title_albanian}
                    </h3>
                    <p className="text-slate-500 font-bold text-sm sm:text-base line-clamp-2 mb-6">
                      {story.title_english}
                    </p>
                    
                    <div className="mt-auto flex items-center gap-2">
                      <span className="text-[10px] sm:text-xs uppercase tracking-wider font-black bg-fuchsia-50 text-fuchsia-500 px-3 py-1.5 rounded-lg border border-fuchsia-100">
                        {story.target_vocab_ids?.length || 0} Target Words
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentStory && (
          <div className="animate-in fade-in zoom-in-[0.98] duration-300">
            <div className="flex justify-between items-center mb-6">
               <button 
                 onClick={() => handleSetCurrentStory(null)} 
                 className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-600 font-bold text-sm transition-colors bg-white/60 px-4 py-2 rounded-full border border-white shadow-sm"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                 Back
               </button>
               
               <div className="flex items-center gap-2">
                 {audioState === 'idle' ? (
                   <button onClick={playStoryAudio} className="inline-flex items-center gap-2 font-bold text-sm px-4 py-2 rounded-full border shadow-sm transition-colors bg-white/60 text-slate-500 hover:text-fuchsia-500 border-white">
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                     Read Aloud
                   </button>
                 ) : (
                   <>
                     <button onClick={audioState === 'playing' ? pauseStoryAudio : playStoryAudio} disabled={audioState === 'loading'} className="bg-fuchsia-100 text-fuchsia-600 border-fuchsia-200 px-4 py-2 rounded-full border shadow-sm font-bold text-sm inline-flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50">
                       {audioState === 'loading' ? (
                         <><div className="w-4 h-4 border-2 border-fuchsia-300 border-t-fuchsia-600 rounded-full animate-spin"></div> Loading...</>
                       ) : audioState === 'playing' ? (
                         <><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause</>
                       ) : (
                         <><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg> Resume</>
                       )}
                     </button>
                     <button onClick={stopStoryAudio} className="bg-slate-200 text-slate-600 hover:bg-rose-100 hover:text-rose-600 px-3 py-2 rounded-full shadow-sm font-bold transition-colors active:scale-95" title="Stop">
                       <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
                     </button>
                   </>
                 )}
               </div>
            </div>

            <div className="space-y-6">
              <article 
                ref={readerRef}
                className="bg-white p-6 sm:p-12 rounded-[2.5rem] border-2 border-slate-100 shadow-md relative transform-gpu"
              >
                <h2 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight mb-8 leading-tight">
                  {currentStory.title_albanian}
                </h2>
                
                <div className="prose prose-lg sm:prose-xl text-slate-700 font-medium leading-relaxed selection:bg-fuchsia-200">
                  {renderInteractiveText(currentStory.content_albanian)}
                </div>
              </article>

              <details className="bg-slate-100/80 backdrop-blur-md rounded-[2.5rem] border-2 border-white shadow-sm group">
                <summary className="px-6 sm:px-8 py-5 sm:py-6 cursor-pointer font-black text-slate-500 hover:text-fuchsia-500 transition-colors list-none flex justify-between items-center outline-none">
                  Show English Translation
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open:rotate-180"><path d="m6 9 6 6 6-6"/></svg>
                </summary>
                <div className="px-6 sm:px-8 pb-8 pt-2 text-slate-600 font-medium leading-relaxed">
                  <h3 className="font-black text-xl mb-4 text-slate-700">{currentStory.title_english}</h3>
                  {currentStory.content_english.split('\n').map((para, idx) => (
                    <p key={idx} className="mb-4 last:mb-0">{para}</p>
                  ))}
                </div>
              </details>
            </div>
          </div>
        )}
      </div>

      {/* FLOATING EXPLAIN TOOLTIP */}
      {tooltipPos && !isExplaining && !explanation && (
        <div 
          className="absolute z-[100] animate-in fade-in zoom-in-95 duration-200 flex"
          style={{ 
            left: `${tooltipPos.x}px`, 
            top: `${tooltipPos.y}px`, 
            transform: 'translate(-50%, -100%)' 
          }}
        >
          <div className="bg-slate-900 rounded-xl shadow-xl flex items-center overflow-hidden pointer-events-auto">
             <button 
               onClick={(e) => speakText(selectionText, e)}
               className="text-white hover:text-fuchsia-400 font-black text-sm px-4 py-2.5 flex items-center gap-2 transition-colors border-r border-slate-700"
               title="Listen and Repeat"
             >
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
             </button>
             <button 
               onClick={handleExplainHighlight}
               className="text-white hover:text-fuchsia-400 font-black text-sm px-4 py-2.5 flex items-center gap-2 transition-colors"
             >
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="12" x2="2" y2="12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
               Explain
             </button>
          </div>
          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-slate-900 absolute left-1/2 -bottom-2 -translate-x-1/2"></div>
        </div>
      )}

      {/* EXPLANATION MODAL */}
      {(isExplaining || explanation) && (
        <div className="fixed inset-0 z-[500] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in" onClick={() => { setExplanation(null); setIsExplaining(false); window.getSelection()?.removeAllRanges(); }}>
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <header className="p-6 sm:p-8 border-b-2 border-slate-100 flex justify-between items-center">
              <div>
                <span className="text-xs uppercase tracking-widest font-black text-fuchsia-400 mb-1 block">Grammar Breakdown</span>
                <h3 className="text-xl font-black text-slate-800 italic">"{selectionText}"</h3>
              </div>
              <button onClick={() => { setExplanation(null); setIsExplaining(false); window.getSelection()?.removeAllRanges(); }} className="bg-slate-100 hover:bg-slate-200 text-slate-500 p-2.5 rounded-full transition-colors">
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </header>
            
            <div className="p-6 sm:p-8 overflow-y-auto">
              {isExplaining ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-fuchsia-100 border-t-fuchsia-500 rounded-full animate-spin mb-4"></div>
                  <p className="text-slate-400 font-bold animate-pulse">Gemini is analyzing the grammar...</p>
                </div>
              ) : (
                <div className="prose prose-sm sm:prose-base leading-relaxed text-slate-700 font-medium"
                  dangerouslySetInnerHTML={{ __html: (explanation || "").replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-fuchsia-600 font-black">$1</strong>') }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {storyToDelete && !isDemoMode && (
        <div className="fixed inset-0 z-[600] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !isDeletingStory && setStoryToDelete(null)}>
          <div className="bg-white rounded-[2rem] p-6 sm:p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mb-6 shadow-inner">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
            </div>
            <h3 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Delete Story?</h3>
            <p className="text-slate-500 font-bold mb-8">Are you sure you want to delete <span className="text-fuchsia-500">"{storyToDelete.title}"</span>? This cannot be undone.</p>
            <div className="flex w-full gap-3">
              <button onClick={() => setStoryToDelete(null)} disabled={isDeletingStory} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black py-3.5 rounded-xl transition-colors active:scale-95 disabled:opacity-50">
                Cancel
              </button>
              <button onClick={confirmDeleteStory} disabled={isDeletingStory} className="flex-1 bg-rose-500 hover:bg-rose-400 text-white font-black py-3.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50">
                {isDeletingStory ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <DictionaryModal word={modalWord} onClose={() => setModalWord(null)} onUpdate={handleModalUpdate} />
    </main>
  );
}