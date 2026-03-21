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
    // 1. Fetch vocab needing sentences, explicitly pulling mastery_score
    const { data: allVocab, error: fetchError } = await supabase
      .from('vocab')
      .select('id, albanian, english, type, mastery_score, sentences(id)');

    if (fetchError) throw fetchError;

    const needsSentences = allVocab.filter((v: any) => !v.sentences || v.sentences.length === 0);

    if (!needsSentences || needsSentences.length === 0) {
      return NextResponse.json({ message: "All words have sentences! You are fully stocked." });
    }

    // 2. Sort ruthlessly by lowest mastery score
    needsSentences.sort((a, b) => (a.mastery_score || 0) - (b.mastery_score || 0));

    // Separate into verbs and non-verbs while maintaining the lowest-first sort order
    const verbs = needsSentences.filter((v: any) => v.type === 'Verb' || v.type === 'Command');
    const nonVerbs = needsSentences.filter((v: any) => v.type !== 'Verb' && v.type !== 'Command');

    // Target the 3 absolute weakest verbs and 2 absolute weakest non-verbs
    const targetVerbCount = Math.min(3, verbs.length);
    const remainingSlots = 5 - targetVerbCount;
    
    const selectedVerbs = verbs.slice(0, targetVerbCount);
    const selectedNonVerbs = nonVerbs.slice(0, remainingSlots);

    // Combine the 5 weakest words and give them a quick shuffle so Gemini doesn't always see verbs first
    const vocabToProcess = [...selectedVerbs, ...selectedNonVerbs].sort(() => 0.5 - Math.random());

    // 3. Fetch "Mid-Tier" words for passive exposure
    const { data: midTierVocab, error: midTierError } = await supabase
      .from('vocab')
      .select('albanian, english')
      .gte('mastery_score', 0.4)
      .lte('mastery_score', 0.8)
      .limit(50);
      
    if (midTierError) console.error("Could not fetch mid-tier vocab, proceeding without it.");

    const getRandomMidTierWords = () => {
      if (!midTierVocab || midTierVocab.length === 0) return null;
      const shuffled = [...midTierVocab].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 3);
      return selected.map(w => `${w.albanian} (${w.english})`).join(', ');
    };

    // 4. Fetch lowest performing grammar metrics to guide Gemini
    const { data: weakGrammar, error: weakGrammarError } = await supabase
      .from('grammar_metrics')
      .select('dimension_type, dimension_value, mastery_score')
      .order('mastery_score', { ascending: true })
      .limit(15);

    let grammarPrioritiesText = "";
    if (!weakGrammarError && weakGrammar && weakGrammar.length > 0) {
      const weakTenses = weakGrammar.filter(g => g.dimension_type === 'tense').map(g => g.dimension_value);
      const weakPronouns = weakGrammar.filter(g => g.dimension_type === 'pronoun').map(g => g.dimension_value);
      const weakCases = weakGrammar.filter(g => g.dimension_type === 'noun_case').map(g => g.dimension_value);

      grammarPrioritiesText = `
      STUDENT'S WEAKEST GRAMMAR POINTS:
      The student is currently struggling with the following grammar rules. You MUST prioritize using these exact forms for the TARGET words whenever grammatically and logically possible:
      ${weakTenses.length > 0 ? `- Target these Verb Tenses: ${weakTenses.slice(0, 3).join(', ')}` : ''}
      ${weakPronouns.length > 0 ? `- Target these Pronouns: ${weakPronouns.slice(0, 3).join(', ')}` : ''}
      ${weakCases.length > 0 ? `- Target these Noun Cases: ${weakCases.slice(0, 3).join(', ')}` : ''}
      `;
    }

    // 5. Construct the dynamic Tier 1 Prompt
    const promptInstructions = vocabToProcess.map(v => {
      const secondaryWords = getRandomMidTierWords();
      let instruction = `- TARGET WORD: ${v.albanian} (English: ${v.english}, Type: ${v.type || 'Unknown'})`;
      if (secondaryWords) {
        instruction += `\n    -> SECONDARY GOAL: Try to naturally incorporate 1 or 2 of these review words into the sentence as well: [${secondaryWords}]`;
      }
      return instruction;
    }).join('\n\n');

    const prompt = `
      You are an expert Albanian language curriculum designer. 
      The student is a Peace Corps Volunteer in Albania at the ACTFL Intermediate Low (CEFR A2) level.
      
      I will provide a list of TARGET Albanian words. For each word, generate a highly contextual, everyday practice sentence suitable for an A2 speaker.
      
      ${grammarPrioritiesText}
      
      RULES:
      1. Replace ONLY the TARGET Albanian word in the sentence with "___".
      2. IMPORTANT GRAMMAR: Conjugate verbs and decline nouns to specifically target the "WEAKEST GRAMMAR POINTS" listed above. Do NOT just use the exact dictionary form I provide.
      3. If I provide "SECONDARY GOAL" words, try to include them in the sentence for passive reading practice. Do NOT blank out the secondary words.
      4. The sentence context MUST provide enough clues to figure out the missing target word.
      5. Use simple, everyday A2 vocabulary for the rest of the sentence.
      6. GRAMMAR TRACKING: You MUST identify the specific grammatical form of the TARGET word used in the sentence and output it using EXACTLY these strict formats:
         - IF VERB: "grammar_type": "conjugation", "grammar_value": "{tense}:{pronoun}"
           (Valid Tenses: indicative_present, indicative_imperfect, indicative_aorist, subjunctive_present, imperative_present, participle)
           (Valid Pronouns: Unë, Ti, Ai/Ajo, Ne, Ju, Ata/Ato)
           Example: "grammar_value": "indicative_aorist:Unë"
         - IF NOUN: "grammar_type": "noun_declension", "grammar_value": "{case}:{definiteness}:{plurality}"
           (Valid Cases: Nominative, Accusative, Dative, Genitive, Ablative)
           (Valid Definiteness: Definite, Indefinite)
           (Valid Plurality: Singular, Plural)
           Example: "grammar_value": "Accusative:Definite:Singular"
         - IF ADJECTIVE: "grammar_type": "adjective_agreement", "grammar_value": "{gender}:{plurality}"
           (Valid Gender: Masculine, Feminine)
           (Valid Plurality: Singular, Plural)
           Example: "grammar_value": "Feminine:Plural"
         - IF OTHER (Adverb, Preposition, Phrase): "grammar_type": null, "grammar_value": null
      7. Output STRICTLY in JSON array format. Do not include markdown blocks like \`\`\`json.
      
      Words to process:
      ${promptInstructions}
      
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

    // 6. Ping Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // 7. Parse the AI response cleanly
    const cleanJsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const generatedSentences = JSON.parse(cleanJsonString);

    // 8. Map the AI response back to your Database IDs
    const insertPayload = generatedSentences.map((aiSentence: any) => {
      const parentVocab = vocabToProcess.find(v => v.albanian.toLowerCase() === aiSentence.albanian_word.toLowerCase());
      return {
        vocab_id: parentVocab?.id,
        grammar_type: aiSentence.grammar_type || null, 
        grammar_value: aiSentence.grammar_value || null,
        blanked_albanian: aiSentence.blanked_albanian,
        target_albanian: aiSentence.target_albanian,
        target_english: aiSentence.target_english,
        english_translation: aiSentence.english_translation
      };
    }).filter((payload: any) => payload.vocab_id); 

    // 9. Inject into Supabase
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