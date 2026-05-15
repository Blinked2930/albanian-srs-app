import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''; 
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: weakWords, error } = await supabase
      .from('vocab')
      .select('id, albanian, english, type')
      .order('mastery_score', { ascending: true })
      .limit(10);

    if (error || !weakWords || weakWords.length === 0) {
      return NextResponse.json({ error: "Could not fetch weak vocabulary." }, { status: 500 });
    }

    const vocabListString = weakWords.map(w => `${w.albanian} (${w.english})`).join(", ");
    const vocabIds = weakWords.map(w => w.id);

    const prompt = `
      You are an expert Albanian storyteller and linguist. Your task is to write a piece of compelling, emotionally resonant flash fiction (roughly 400-500 words) in Albanian.

      TARGET AUDIENCE: 
      The reader is at an "Intermediate-Low" level of Albanian (based on Peace Corps language testing standards). 
      - Keep sentence structures relatively simple and clear.
      - Use high-frequency, everyday vocabulary for the non-target words.
      - Stick primarily to present, simple past (e kryera e thjeshtë / e pakryera), and basic future tenses. Avoid overly complex nested clauses or obscure idioms.

      CRITICAL THEMATIC INSTRUCTIONS:
      Do not write a generic children's story. The narrative should center around a moment of social catalysis. Write about characters fighting against human disconnection, experiencing a sudden, sharp shift in awareness, or confronting the misuse of power. It should feel unexpected, authentic, and touching.

      VOCABULARY REQUIREMENT:
      You MUST naturally weave the following 10 Albanian words into the story:
      [ ${vocabListString} ]
      
      CRITICAL: DO NOT wrap the target words in asterisks, quotes, or bolding. Weave them in invisibly and naturally as plain text.

      FORMATTING:
      Return your response strictly as a JSON object with the following structure, and absolutely no markdown formatting outside the JSON:
      {
        "title_albanian": "A captivating title in Albanian",
        "title_english": "The title translated to English",
        "content_albanian": "The full story in Albanian. Use paragraph breaks (\\n\\n) naturally.",
        "content_english": "A highly accurate, natural-sounding English translation of the story."
      }
    `;

    // Using the incredibly stable, 1M token limit Gemini 2.5 Flash
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const storyData = JSON.parse(text);

    const { error: insertError } = await supabase
      .from('stories')
      .insert({
        title_albanian: storyData.title_albanian,
        title_english: storyData.title_english,
        content_albanian: storyData.content_albanian,
        content_english: storyData.content_english,
        target_vocab_ids: vocabIds
      });

    if (insertError) {
      console.error("Database Insert Error:", insertError);
      return NextResponse.json({ error: "Failed to save story to database." }, { status: 500 });
    }

    return NextResponse.json({ message: "Story generated successfully!", story: storyData });

  } catch (error: any) {
    console.error("Story Generation Error:", error);
    return NextResponse.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
  }
}