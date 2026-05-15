import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: Request) {
  try {
    let body = {};
    try { body = await request.json(); } catch(e) { }
    const mode = body.mode || 'words'; // 'words' | 'phrases'

    const { data: allVocab, error: fetchError } = await supabase.from('vocab').select('id, albanian, english, type, mastery_score, sentences(id)');
    if (fetchError) throw fetchError;

    const needsSentences = allVocab.filter((v: any) => !v.sentences || v.sentences.length === 0);
    if (!needsSentences || needsSentences.length === 0) return NextResponse.json({ message: "All items currently have sentences!" });

    needsSentences.sort((a, b) => (a.mastery_score || 0) - (b.mastery_score || 0));

    let vocabToProcess = [];
    let promptInstructions = "";
    let finalPrompt = "";

    // ==========================================
    // MODE 1: PERMANENT PHRASE VERIFICATION
    // ==========================================
    if (mode === 'phrases') {
      const phrases = needsSentences.filter((v: any) => v.type === 'Phrase');
      if (phrases.length === 0) return NextResponse.json({ message: "All phrases already have drill sentences!" });
      
      vocabToProcess = phrases.slice(0, 8); // Max 8 to prevent Vercel timeouts
      
      promptInstructions = vocabToProcess.map(v => `- ID: ${v.id}\n  PHRASE: "${v.albanian}"\n  ENGLISH MEANING: "${v.english}"`).join('\n\n');

      finalPrompt = `
      You are an expert Albanian linguist. I am providing a list of phrases that a student has collected.
      
      RULES:
      1. Verify the phrase for natural, conversational Albanian. If it sounds unnatural or has grammatical errors, subtly CORRECT IT into how a native speaker would actually say it.
      2. Use this phrase (or your corrected version) as the practice sentence. Do NOT invent a brand new scenario.
      3. Pick the SINGLE most important or difficult "anchor" word in the phrase.
      4. Replace that anchor word with "___".
      5. Identify the grammar type of that specific blanked word.
      6. Output STRICTLY in the JSON array format below.

      EXPECTED JSON FORMAT:
      [
        {
          "vocab_id": "the exact ID string I provided",
          "blanked_albanian": "Dje, unë ___ një mollë.",
          "target_albanian": "hëngra",
          "target_english": "ate",
          "english_translation": "Yesterday, I ate an apple.",
          "grammar_type": "conjugation",
          "grammar_value": "indicative_aorist:Unë"
        }
      ]
      
      Items to process:
      ${promptInstructions}
      `;
    } 
    // ==========================================
    // MODE 2: TEMPORARY WORD DRILLS (Target Weaknesses)
    // ==========================================
    else {
      const words = needsSentences.filter((v: any) => v.type !== 'Phrase');
      if (words.length === 0) return NextResponse.json({ message: "All words already have drill sentences!" });

      const verbs = words.filter((v: any) => v.type === 'Verb' || v.type === 'Command');
      const nonVerbs = words.filter((v: any) => v.type !== 'Verb' && v.type !== 'Command');

      const targetVerbCount = Math.min(3, verbs.length);
      vocabToProcess = [...verbs.slice(0, targetVerbCount), ...nonVerbs.slice(0, 8 - targetVerbCount)].sort(() => 0.5 - Math.random());

      const { data: weakGrammar } = await supabase.from('grammar_metrics').select('dimension_type, dimension_value, mastery_score').order('mastery_score', { ascending: true }).limit(15);
      let grammarPrioritiesText = "";
      if (weakGrammar && weakGrammar.length > 0) {
        const weakTenses = weakGrammar.filter(g => g.dimension_type === 'tense').map(g => g.dimension_value);
        grammarPrioritiesText = weakTenses.length > 0 ? `STUDENT'S WEAKEST GRAMMAR POINTS:\nTry to conjugate verbs in these specific tenses if possible: ${weakTenses.slice(0, 3).join(', ')}` : "";
      }

      promptInstructions = vocabToProcess.map(v => `- ID: ${v.id}\n  TARGET WORD: ${v.albanian} (English: ${v.english}, Type: ${v.type || 'Unknown'})`).join('\n\n');

      finalPrompt = `
      You are an expert Albanian language curriculum designer. 
      I will provide a list of TARGET Albanian words. For each word, invent a brand new, highly contextual, everyday practice sentence suitable for an A2/B1 speaker.
      
      ${grammarPrioritiesText}

      RULES:
      1. Replace ONLY the TARGET Albanian word in the sentence with "___".
      2. If it is a verb or noun, conjugate/decline it naturally. Do not just blindly use the dictionary form.
      3. Output STRICTLY in the JSON array format below.

      EXPECTED JSON FORMAT:
      [
        {
          "vocab_id": "the exact ID string I provided",
          "blanked_albanian": "Dje, unë ___ një mollë.",
          "target_albanian": "hëngra",
          "target_english": "ate",
          "english_translation": "Yesterday, I ate an apple.",
          "grammar_type": "conjugation",
          "grammar_value": "indicative_aorist:Unë"
        }
      ]
      
      Words to process:
      ${promptInstructions}
      `;
    }

    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
    const result = await model.generateContent(finalPrompt);

    const cleanJsonString = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const generatedSentences = JSON.parse(cleanJsonString);

    const insertPayload = generatedSentences.map((aiSentence: any) => {
      // Find parent vocab using the exact ID, ensuring perfect linking even if AI corrected the phrase!
      const parentVocab = vocabToProcess.find(v => v.id === aiSentence.vocab_id);
      
      return {
        vocab_id: parentVocab?.id, 
        grammar_type: aiSentence.grammar_type || null, 
        grammar_value: aiSentence.grammar_value || null,
        blanked_albanian: aiSentence.blanked_albanian, 
        target_albanian: aiSentence.target_albanian,
        target_english: aiSentence.target_english, 
        english_translation: aiSentence.english_translation,
        // Shield phrases forever. Words get the 14-day execution.
        is_permanent: mode === 'phrases' ? true : false
      };
    }).filter((payload: any) => payload.vocab_id); 

    const { error: insertError } = await supabase.from('sentences').insert(insertPayload);
    if (insertError) throw insertError;

    return NextResponse.json({ success: true, message: `Successfully saved ${insertPayload.length} ${mode === 'phrases' ? 'verified phrases' : 'new sentences'}.`, data: insertPayload });

  } catch (error: any) {
    console.error("Sentence Generation API Error:", error);
    return NextResponse.json({ error: "Failed to generate sentences.", details: error.message }, { status: 500 });
  }
}