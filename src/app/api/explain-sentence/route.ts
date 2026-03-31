import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Force Next.js to NEVER cache this API route.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { albanian_sentence, english_translation } = await req.json();

    if (!albanian_sentence || !english_translation) {
      return NextResponse.json({ error: 'Missing sentence parameters in request' }, { status: 400 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY is missing from environment variables' }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: promptData, error: promptError } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'gemini_sentence_explanation_prompt')
      .maybeSingle();

    if (promptError) {
      console.warn("Supabase Error in Explanation API:", promptError);
    }

    const basePrompt = promptData?.value || `
      You are an expert Albanian linguist. 
      The user will provide an Albanian sentence and its English translation. Your job is to break down the grammar of the sentence so the user understands exactly how the Albanian maps to the English.
      - Output a short, bulleted list. 
      - Break the sentence into 3 to 5 logical chunks.
      - For each chunk, provide the English meaning and a VERY BRIEF grammatical note (e.g., tense, case, gender).
      - Do not use markdown code blocks. Just use standard text with **bolding** for the Albanian words. 
      Keep it extremely concise and easy to scan.
    `;

    const finalPrompt = `
      ${basePrompt}

      Albanian Sentence: "${albanian_sentence}"
      English Translation: "${english_translation}"
    `;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    // USING THE EXACT WORKING MODEL STRING FROM YOUR MNEMONIC API
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

    const result = await model.generateContent(finalPrompt);

    return NextResponse.json({ explanation: result.response.text() });

  } catch (error: any) {
    console.error("Sentence Explanation Error:", error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}