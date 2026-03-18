require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('GEMINI_API_KEY loaded:', !!process.env.GEMINI_API_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// SWITCHED TO 1.5-FLASH: Has a massive 1,500 requests/day free tier!
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const TARGET_TENSES = 6;

async function main() {
  try {
    console.log('Starting Gemini conjugation process...');

    const verbs = await fetchVerbsFromSupabase();
    console.log(`Found ${verbs.length} verbs in vocab table.`);

    const { data: existing, error: existingError } = await supabase
      .from('conjugations')
      .select('vocab_id');
    if (existingError) throw new Error(`Error fetching existing: ${existingError.message}`);

    const countMap = {};
    for (const row of existing || []) {
      countMap[row.vocab_id] = (countMap[row.vocab_id] || 0) + 1;
    }

    const toProcess = verbs.filter(v => !countMap[v.id] || countMap[v.id] < TARGET_TENSES);
    console.log(`Skipping ${verbs.length - toProcess.length} verbs already fully processed.`);
    console.log(`Processing ${toProcess.length} remaining verbs with Gemini 1.5 Flash.`);

    if (toProcess.length === 0) {
      console.log('Nothing to do — all verbs are fully conjugated!');
      return;
    }

    for (const verb of toProcess) {
      await processVerbWithRetry(verb);
      // Give the API a nice 5-second breather between words
      await sleep(5000); 
    }

    console.log('\nAll verbs processed successfully!');
  } catch (error) {
    console.error('Fatal error:', error);
  }
}

async function fetchVerbsFromSupabase() {
  const { data, error } = await supabase
    .from('vocab')
    .select('id, albanian')
    .eq('type', 'Verb');

  if (error) throw new Error(`Supabase fetch error: ${error.message}`);
  return data;
}

// Added an automatic retry wrapper so it doesn't crash on a single 429
async function processVerbWithRetry(verb, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await processVerb(verb);
      return; // Success, break out of retry loop
    } catch (error) {
      if (attempt === maxRetries) {
        console.error(`  ✗ Giving up on "${verb.albanian}" after ${maxRetries} attempts.`);
      } else {
        console.warn(`  ! Attempt ${attempt} failed for "${verb.albanian}". Retrying in 10 seconds...`);
        await sleep(10000);
      }
    }
  }
}

async function processVerb(verb) {
  const word = verb.albanian.toLowerCase().trim();
  console.log(`\nProcessing: ${word}`);

  const conjugations = await getConjugationsFromGemini(word);
  if (!conjugations) {
    throw new Error("Failed to parse conjugations");
  }

  await storeConjugations(verb.id, word, conjugations);
  console.log(`  ✓ Gemini: Stored ${Object.keys(conjugations).length} tense forms for "${word}".`);
}

async function getConjugationsFromGemini(word) {
  const prompt = `Provide a JSON object for the Albanian verb "${word}". Include ONLY these exact keys:
"indicative_present", "indicative_imperfect", "indicative_aorist", "subjunctive_present", "imperative_present", "participle"

Each key should contain an object with exactly these keys: "une", "ti", "ai_ajo", "ne", "ju", "ata_ato".
For "participle", just use a single "form" key with the participle form as the value.
For "imperative_present", only "ti" and "ju" are needed, set others to null.
Use plain ASCII keys only - no special characters in the keys.
If "${word}" is reflexive (ends in -hem), provide reflexive endings.
If "${word}" is a conjugated form and not an infinitive, find the correct infinitive first and conjugate that instead.
Return ONLY the raw JSON object. No explanation, no markdown, no backticks.`;

  const result = await model.generateContent(prompt);
  let raw = result.response.text();

  // Strip out the markdown ```json blocks that cause JSON.parse to crash
  raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in Gemini response');

  const parsed = JSON.parse(match[0]);

  const conjugations = {};
  for (const [moodTense, forms] of Object.entries(parsed)) {
    conjugations[moodTense] = {
      'unë': forms['une'] || null,
      'ti': forms['ti'] || null,
      'ai/ajo': forms['ai_ajo'] || null,
      'ne': forms['ne'] || null,
      'ju': forms['ju'] || null,
      'ata/ato': forms['ata_ato'] || forms['form'] || null,
    };
  }

  return conjugations;
}

async function storeConjugations(vocabId, albanian, conjugations) {
  await supabase
    .from('conjugations')
    .delete()
    .eq('vocab_id', vocabId);

  const rows = Object.entries(conjugations).map(([moodTense, forms]) => ({
    vocab_id: vocabId,
    albanian: albanian,
    mood_tense: moodTense,
    une: forms['unë'] || forms['une'] || null,
    ti: forms['ti'] || null,
    ai_ajo: forms['ai/ajo'] || forms['ai_ajo'] || null,
    ne: forms['ne'] || null,
    ju: forms['ju'] || null,
    ata_ato: forms['ata/ato'] || forms['ata_ato'] || null,
  }));

  const { error } = await supabase.from('conjugations').insert(rows);
  if (error) throw new Error(`Supabase insert error: ${error.message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();