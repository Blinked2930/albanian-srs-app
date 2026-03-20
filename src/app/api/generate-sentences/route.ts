import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''; // Use Service Role key in production if bypassing RLS
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Gemini (Requires GEMINI_API_KEY in your .env.local)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: Request) {
  try {
    // 1. Fetch 5 words that currently have NO sentences associated with them
    const { data: vocabToProcess, error: fetchError } = await supabase
      .from('vocab')
      .select('id, albanian, english, type')
      .not('id', 'in', (
          supabase.from('sentences').select('vocab_id')
      ))
      .limit(5);

    if (fetchError) throw fetchError;
    if (!vocabToProcess || vocabToProcess.length === 0) {
      return NextResponse.json({ message: "All words have sentences! You are fully stocked." });
    }

    // 2. Construct the Tier 1 Prompt for Gemini
    const prompt = `
      You are an expert Albanian language curriculum designer. 
      The student is a Peace Corps Volunteer in Albania at the ACTFL Intermediate Low (CEFR A2) level.
      
      I will provide a list of Albanian words. For each word, generate a highly contextual, everyday practice sentence suitable for an A2 speaker.
      
      RULES:
      1. Replace the target Albanian word in the sentence with "___".
      2. The sentence context MUST provide enough clues to figure out the missing word.
      3. Use simple, everyday A2 vocabulary for the surrounding sentence.
      4. Output STRICTLY in JSON array format. Do not include markdown blocks like \`\`\`json.
      
      Words to process:
      ${vocabToProcess.map(v => `- ${v.albanian} (English: ${v.english}, Type: ${v.type || 'Unknown'})`).join('\n')}
      
      EXPECTED JSON FORMAT:
      [
        {
          "albanian_word": "the exact albanian word from my list",
          "blanked_albanian": "Unë ___ një mollë çdo ditë.",
          "target_albanian": "ha",
          "target_english": "eat",
          "english_translation": "I eat an apple every day."
        }
      ]
    `;

    // 3. Ping Gemini 1.5 Flash (Fast, cheap, perfect for this)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // 4. Parse the AI response cleanly
    // (Strip potential markdown code block artifacts)
    const cleanJsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const generatedSentences = JSON.parse(cleanJsonString);

    // 5. Map the AI response back to your Database IDs and prepare for insertion
    const insertPayload = generatedSentences.map((aiSentence: any) => {
      const parentVocab = vocabToProcess.find(v => v.albanian === aiSentence.albanian_word);
      return {
        vocab_id: parentVocab?.id,
        grammar_type: null, // We will tackle specific grammar rules in V2
        grammar_value: null,
        blanked_albanian: aiSentence.blanked_albanian,
        target_albanian: aiSentence.target_albanian,
        target_english: aiSentence.target_english,
        english_translation: aiSentence.english_translation
      };
    }).filter((payload: any) => payload.vocab_id); // Ensure we don't insert broken mappings

    // 6. Inject into Supabase
    const { error: insertError } = await supabase.from('sentences').insert(insertPayload);
    if (insertError) throw insertError;

    return NextResponse.json({ 
      success: true, 
      message: `Successfully generated and saved ${insertPayload.length} new sentences.`,
      data: insertPayload
    });

  } catch (error: any) {
    console.error("Sentence Generation Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}