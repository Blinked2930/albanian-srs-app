"use client";

import React, { useState } from 'react';
import { Smartphone, Apple, Share, PlusSquare, MoreVertical, MoreHorizontal, X, Check, Download } from 'lucide-react';

export default function InstallScreen({ onBypass }: { onBypass: () => void }) {
    const [device, setDevice] = useState<'ios' | 'android' | null>(null);

    return (
        <div className="min-h-[100dvh] w-full bg-[#fafafa] flex flex-col items-center justify-center p-6 relative overflow-hidden">
            
            {/* Soft floating background blobs (matching the app's aesthetic) */}
            <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-pink-100/40 via-purple-50/20 to-indigo-100/40 z-0 pointer-events-none"></div>

            <div className="max-w-md w-full z-10 p-8 md:p-10 rounded-[2.5rem] border-2 border-white/80 shadow-[0_12px_40px_rgba(255,182,193,0.3)] bg-white/60 backdrop-blur-xl relative overflow-hidden transition-all duration-300">
                
                {/* Soft pastel header border */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300 opacity-90"></div>

                {!device ? (
                    <div className="flex flex-col items-center animate-in fade-in duration-300">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-pink-100 rounded-full mb-6 text-pink-500 shadow-sm border-2 border-white">
                            <Download size={36} strokeWidth={2.5} />
                        </div>
                        
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-black mb-2 text-slate-700 tracking-tight">
                                Install App
                            </h1>
                            <p className="text-sm text-slate-500 font-bold leading-relaxed px-2">
                                To ensure maximum reliability offline and preserve your session, install this tool directly to your device.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 w-full">
                            <button 
                                onClick={() => setDevice('ios')}
                                className="w-full bg-white border-2 border-pink-100 hover:border-pink-300 hover:bg-pink-50 text-slate-700 font-black py-4 px-4 rounded-2xl transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-3 text-base"
                            >
                                <Apple size={22} className="text-slate-600" /> I have an iPhone
                            </button>
                            <button 
                                onClick={() => setDevice('android')}
                                className="w-full bg-white border-2 border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50 text-slate-700 font-black py-4 px-4 rounded-2xl transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-3 text-base"
                            >
                                <Smartphone size={22} className="text-slate-600" /> I have an Android
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="w-full relative animate-in slide-in-from-right-4 duration-300">
                        <button 
                            onClick={() => setDevice(null)}
                            className="absolute -top-2 -right-2 w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full flex items-center justify-center active:scale-95 transition-colors border-2 border-white"
                        >
                            <X size={20} strokeWidth={3} />
                        </button>
                        
                        <h2 className="text-2xl font-black text-slate-800 mb-2 mt-2">
                            {device === 'ios' ? 'iOS Protocol' : 'Android Protocol'}
                        </h2>
                        
                        {device === 'ios' ? (
                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-6 border-2 border-rose-200 bg-rose-50 inline-block px-3 py-1.5 rounded-xl">
                                Must be in Safari Browser
                            </p>
                        ) : (
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-6 border-2 border-emerald-200 bg-emerald-50 inline-block px-3 py-1.5 rounded-xl">
                                Must be in Chrome Browser
                            </p>
                        )}

                        <div className="space-y-5 text-slate-600 text-sm font-bold mb-8 bg-white/50 p-5 rounded-3xl border-2 border-white shadow-sm">
                            {device === 'ios' ? (
                                <>
                                    <div className="flex items-start gap-4">
                                        <MoreHorizontal size={20} className="text-pink-500 shrink-0 mt-0.5" strokeWidth={2.5} />
                                        <p className="leading-snug">Tap the <strong className="text-slate-800 font-black">3-dot menu</strong>.</p>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <Share size={20} className="text-pink-500 shrink-0 mt-0.5" strokeWidth={2.5} />
                                        <p className="leading-snug">Tap the <strong className="text-slate-800 font-black">Share icon</strong>.</p>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <PlusSquare size={20} className="text-pink-500 shrink-0 mt-0.5" strokeWidth={2.5} />
                                        <p className="leading-snug">Scroll down and tap <strong className="text-slate-800 font-black">Add to Home Screen</strong>.</p>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <Check size={20} className="text-pink-500 shrink-0 mt-0.5" strokeWidth={2.5} />
                                        <p className="leading-snug">Tap <strong className="text-slate-800 font-black">Add</strong> in the top right corner.</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex items-start gap-4">
                                        <MoreVertical size={20} className="text-indigo-500 shrink-0 mt-0.5" strokeWidth={2.5} />
                                        <p className="leading-snug">Tap the <strong className="text-slate-800 font-black">3-dot menu</strong> in the top right corner.</p>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <PlusSquare size={20} className="text-indigo-500 shrink-0 mt-0.5" strokeWidth={2.5} />
                                        <p className="leading-snug">Scroll down and tap <strong className="text-slate-800 font-black">Add to Home screen</strong>.</p>
                                    </div>
                                    <div className="flex items-start gap-4">
                                        <Check size={20} className="text-indigo-500 shrink-0 mt-0.5" strokeWidth={2.5} />
                                        <p className="leading-snug">Tap <strong className="text-slate-800 font-black">Install</strong> on the popup.</p>
                                    </div>
                                </>
                            )}
                        </div>

                        <button 
                            onClick={() => setDevice(null)}
                            className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-[1.5rem] font-black transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                            Back
                        </button>
                    </div>
                )}
            </div>

            <button 
                onClick={onBypass}
                className="mt-8 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors underline underline-offset-4 uppercase tracking-widest z-10"
            >
                Continue in browser (Not Recommended)
            </button>
        </div>
    );
}