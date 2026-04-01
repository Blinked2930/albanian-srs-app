import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 1. KILL THE CACHE
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: Request) {
  try {
    const { data: allVocab, error: fetchError } = await supabase.from('vocab').select('id, albanian, english, type, mastery_score, sentences(id)');
    if (fetchError) throw fetchError;

    const needsSentences = allVocab.filter((v: any) => !v.sentences || v.sentences.length === 0);
    if (!needsSentences || needsSentences.length === 0) return NextResponse.json({ message: "All words have sentences!" });

    needsSentences.sort((a, b) => (a.mastery_score || 0) - (b.mastery_score || 0));

    const verbs = needsSentences.filter((v: any) => v.type === 'Verb' || v.type === 'Command');
    const nonVerbs = needsSentences.filter((v: any) => v.type !== 'Verb' && v.type !== 'Command');

    const targetVerbCount = Math.min(6, verbs.length);
    const selectedVerbs = verbs.slice(0, targetVerbCount);
    const selectedNonVerbs = nonVerbs.slice(0, 12 - targetVerbCount);

    const vocabToProcess = [...selectedVerbs, ...selectedNonVerbs].sort(() => 0.5 - Math.random());

    const { data: midTierVocab } = await supabase.from('vocab').select('albanian, english').gte('mastery_score', 0.4).lte('mastery_score', 0.8).limit(50);
    const getRandomMidTierWords = () => {
      if (!midTierVocab || midTierVocab.length === 0) return null;
      return [...midTierVocab].sort(() => 0.5 - Math.random()).slice(0, 3).map(w => `${w.albanian} (${w.english})`).join(', ');
    };

    const { data: weakGrammar } = await supabase.from('grammar_metrics').select('dimension_type, dimension_value, mastery_score').order('mastery_score', { ascending: true }).limit(15);

    let grammarPrioritiesText = "";
    if (weakGrammar && weakGrammar.length > 0) {
      const weakTenses = weakGrammar.filter(g => g.dimension_type === 'tense').map(g => g.dimension_value);
      const weakPronouns = weakGrammar.filter(g => g.dimension_type === 'pronoun').map(g => g.dimension_value);
      const weakCases = weakGrammar.filter(g => g.dimension_type === 'noun_case').map(g => g.dimension_value);

      grammarPrioritiesText = `
      STUDENT'S WEAKEST GRAMMAR POINTS:
      You MUST prioritize using these exact forms for the TARGET words whenever grammatically and logically possible:
      ${weakTenses.length > 0 ? `- Target these Verb Tenses: ${weakTenses.slice(0, 3).join(', ')}` : ''}
      ${weakPronouns.length > 0 ? `- Target these Pronouns: ${weakPronouns.slice(0, 3).join(', ')}` : ''}
      ${weakCases.length > 0 ? `- Target these Noun Cases: ${weakCases.slice(0, 3).join(', ')}` : ''}
      `;
    }

    const promptInstructions = vocabToProcess.map(v => {
      const secondaryWords = getRandomMidTierWords();
      let instruction = `- TARGET WORD: ${v.albanian} (English: ${v.english}, Type: ${v.type || 'Unknown'})`;
      if (secondaryWords) instruction += `\n    -> SECONDARY GOAL: Try to naturally incorporate 1 or 2 of these review words: [${secondaryWords}]`;
      return instruction;
    }).join('\n\n');

    // Fetch the dynamic prompt from Supabase
    const { data: promptData, error: promptError } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "gemini_sentence_prompt")
      .single();

    if (promptError) console.warn("Supabase Error in Sentence API:", promptError);

    // Log it to terminal
    console.log("Fetched Sentence Prompt from DB:", promptData?.value);

    const basePrompt = promptData?.value || `
      You are an expert Albanian language curriculum designer. 
      The student is a Peace Corps Volunteer in Albania at the ACTFL Intermediate Low (CEFR A2) level.
      I will provide a list of TARGET Albanian words. For each word, generate a highly contextual, everyday practice sentence suitable for an A2 speaker.
      
      RULES:
      1. Replace ONLY the TARGET Albanian word in the sentence with "___".
      2. IMPORTANT GRAMMAR: Conjugate verbs and decline nouns to specifically target the "WEAKEST GRAMMAR POINTS" listed above. Do NOT just use the exact dictionary form I provide.
      3. If I provide "SECONDARY GOAL" words, try to include them in the sentence for passive reading practice. Do NOT blank out the secondary words.
      4. The sentence context MUST provide enough clues to figure out the missing target word.
      5. Use simple, everyday A2 vocabulary for the rest of the sentence.
      6. GRAMMAR TRACKING: You MUST identify the specific grammatical form of the TARGET word used in the sentence and output it using EXACTLY these strict formats:
         - IF VERB: "grammar_type": "conjugation", "grammar_value": "{tense}:{pronoun}"
         - IF NOUN: "grammar_type": "noun_declension", "grammar_value": "{case}:{definiteness}:{plurality}"
         - IF ADJECTIVE: "grammar_type": "adjective_agreement", "grammar_value": "{gender}:{plurality}"
         - IF OTHER: "grammar_type": null, "grammar_value": null
      7. Output STRICTLY in JSON array format. Do not include markdown blocks like \`\`\`json.
      
      EXPECTED JSON FORMAT:
      [
        {
          "albanian_word": "the exact TARGET albanian word from my list (dictionary form)",
          "blanked_albanian": "Dje, unë ___ një mollë.",
          "target_albanian": "hëngra",
          "target_english": "ate",
          "english_translation": "Yesterday, I ate an apple.",
          "grammar_type": "conjugation",
          "grammar_value": "indicative_aorist:Unë"
        }
      ]
    `;

    const finalPrompt = `
      ${basePrompt}
      
      ${grammarPrioritiesText}
      
      Words to process:
      ${promptInstructions}
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    const result = await model.generateContent(finalPrompt);

    const cleanJsonString = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
    const generatedSentences = JSON.parse(cleanJsonString);

    const insertPayload = generatedSentences.map((aiSentence: any) => {
      const parentVocab = vocabToProcess.find(v => v.albanian.toLowerCase() === aiSentence.albanian_word.toLowerCase());
      return {
        vocab_id: parentVocab?.id, grammar_type: aiSentence.grammar_type || null, grammar_value: aiSentence.grammar_value || null,
        blanked_albanian: aiSentence.blanked_albanian, target_albanian: aiSentence.target_albanian,
        target_english: aiSentence.target_english, english_translation: aiSentence.english_translation
      };
    }).filter((payload: any) => payload.vocab_id);

    const { error: insertError } = await supabase.from('sentences').insert(insertPayload);
    if (insertError) throw insertError;

    return NextResponse.json({ success: true, message: `Successfully generated and saved ${insertPayload.length} new sentences.`, data: insertPayload });

  } catch (error: any) {
    console.error("Sentence Generation API Error:", error);
    return NextResponse.json({ error: "Failed to generate sentences.", details: error.message }, { status: 500 });
  }
}