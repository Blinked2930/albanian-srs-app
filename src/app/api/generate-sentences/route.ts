import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''; 
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: Request) {
  try {
    // 1. Fetch vocab and join with the sentences table
    const { data: allVocab, error: fetchError } = await supabase
      .from('vocab')
      .select('id, albanian, english, type, sentences(id)');

    if (fetchError) throw fetchError;

    // 2. Filter out words that already have sentences, take the first 5
    const vocabToProcess = allVocab
      .filter((v: any) => !v.sentences || v.sentences.length === 0)
      .slice(0, 5);

    if (!vocabToProcess || vocabToProcess.length === 0) {
      return NextResponse.json({ message: "All words have sentences! You are fully stocked." });
    }

    // 3. Construct the Tier 1 Prompt for Gemini
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

    // 4. Ping Gemini 1.5 Flash
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // 5. Parse the AI response cleanly
    const cleanJsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const generatedSentences = JSON.parse(cleanJsonString);

    // 6. Map the AI response back to your Database IDs
    const insertPayload = generatedSentences.map((aiSentence: any) => {
      const parentVocab = vocabToProcess.find(v => v.albanian.toLowerCase() === aiSentence.albanian_word.toLowerCase());
      return {
        vocab_id: parentVocab?.id,
        grammar_type: null, 
        grammar_value: null,
        blanked_albanian: aiSentence.blanked_albanian,
        target_albanian: aiSentence.target_albanian,
        target_english: aiSentence.target_english,
        english_translation: aiSentence.english_translation
      };
    }).filter((payload: any) => payload.vocab_id); 

    // 7. Inject into Supabase
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