import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 1. THIS IS THE MAGIC LINE. It forces Next.js to NEVER cache this API route.
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: Request) {
    try {
        const { albanian, english } = await request.json();

        if (!albanian || !english) {
            return NextResponse.json({ error: "Missing words for mnemonic generation." }, { status: 400 });
        }

        // Fetch the dynamic prompt from Supabase
        const { data: promptData, error: promptError } = await supabase
            .from("app_settings")
            .select("value")
            .eq("key", "gemini_mnemonic_prompt")
            .single();

        if (promptError) {
            console.warn("Supabase Error in Mnemonic API:", promptError);
        }

        // Log it to your terminal so you can verify it's working!
        console.log("Fetched Prompt from DB:", promptData?.value);

        const basePrompt = promptData?.value || `
            You are an expert memory coach utilizing the "Keyword Method" and advanced visual memory techniques. 
            Your goal is to help an English speaker memorize an Albanian word.
            Create a vivid, bizarre, and highly memorable visual mnemonic. 
            Follow these exact steps:
            1. Sound-Alike (Keyword): Find an English word or phrase that sounds similar to the Albanian word.
            2. The Visual Link: Create a crazy, action-packed, or emotionally charged mental scene that forcibly links the sound-alike to the English meaning. 
            Keep it short, punchy, and highly visual. Do not explain the science, just give the memory trick.
            Format the output beautifully using markdown. For example:
            **Sound-Alike:** [English sounding words]
            **The Scene:** [The vivid 1-2 sentence story]
        `;

        const finalPrompt = `
            ${basePrompt}
            
            TARGET ALBANIAN WORD: "${albanian}"
            ENGLISH MEANING: "${english}"
        `;

        const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
        const result = await model.generateContent(finalPrompt);

        return NextResponse.json({ mnemonic: result.response.text() });
    } catch (error: any) {
        console.error("Mnemonic Generation API Error:", error);
        return NextResponse.json({ 
            error: "Failed to generate mnemonic.",
            details: error.message 
        }, { status: 500 });
    }
}