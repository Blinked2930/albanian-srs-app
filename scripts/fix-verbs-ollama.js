require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function getVerbWord(item) {
  try {
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3.1:8b',
      prompt: `Provide a JSON object for the Albanian verb "${item.albanian}". Include ALL of the following moods and tenses as keys:
"indicative_present", "indicative_imperfect", "indicative_aorist", "indicative_perfect", "indicative_pluperfect",
"subjunctive_present", "subjunctive_imperfect", "subjunctive_perfect",
"optative_present", "optative_perfect",
"admirative_present", "admirative_imperfect", "admirative_perfect",
"conditional_imperfect"

Each key should contain an object with exactly these keys: "une", "ti", "ai_ajo", "ne", "ju", "ata_ato".
Use plain ASCII keys only - no special characters in the keys.
If "${item.albanian}" is reflexive (ends in -hem), provide reflexive endings.
If "${item.albanian}" is a conjugated form, find the infinitive and conjugate that instead.
Return ONLY the raw JSON object. No explanation, no markdown, no backticks.`,
      stream: false
    });

    let raw = response.data.response;
    console.log('RAW OLLAMA OUTPUT:', raw);

    raw = raw.replace(/```json|```/g, '').trim();

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in response');

    return JSON.parse(match[0]);
  } catch (error) {
    console.error(`  Error fetching from Ollama for "${item.albanian}":`, error.message);
    return null;
  }
}

async function processVerbWord(item) {
  try {
    const { data: existing, error: countError } = await supabase
      .from('conjugations')
      .select('id')
      .eq('vocab_id', item.id);

    if (countError) throw new Error(countError.message);

    const rowCount = existing ? existing.length : 0;

    if (rowCount >= 13) {
      console.log(`  Skipping "${item.albanian}" — already has ${rowCount} tenses.`);
      return;
    }

    if (rowCount > 0) {
      console.log(`\nRe-processing "${item.albanian}" — only has ${rowCount} tenses, needs 13.`);
      await supabase.from('conjugations').delete().eq('vocab_id', item.id);
    } else {
      console.log(`\nProcessing: ${item.albanian}`);
    }

    const wordData = await getVerbWord(item);

    if (!wordData || typeof wordData !== 'object') {
      console.error(`  Invalid response for "${item.albanian}"`);
      return;
    }

    const rows = Object.entries(wordData).map(([moodTense, forms]) => ({
      vocab_id: item.id,
      albanian: item.albanian.toLowerCase().trim(),
      mood_tense: moodTense,
      une: forms['une'] || null,
      ti: forms['ti'] || null,
      ai_ajo: forms['ai_ajo'] || null,
      ne: forms['ne'] || null,
      ju: forms['ju'] || null,
      ata_ato: forms['ata_ato'] || null,
    }));

    if (rows.length === 0) {
      console.error(`  No rows to insert for "${item.albanian}"`);
      return;
    }

    const { error: insertError } = await supabase.from('conjugations').insert(rows);
    if (insertError) {
      console.error(`  Failed to insert conjugations for "${item.albanian}":`, insertError.message);
    } else {
      console.log(`  Stored ${rows.length} tense forms for "${item.albanian}".`);
    }

  } catch (error) {
    console.error(`  Error processing "${item.albanian}":`, error.message);
  }
}

async function populateConjugationsTable() {
  const { data, error } = await supabase
    .from('vocab')
    .select('*')
    .eq('type', 'Verb');

  if (error) {
    console.error('Failed to fetch verbs:', error.message);
    return;
  }

  console.log(`Found ${data.length} verbs to process.`);

  const { data: allConjugations } = await supabase
    .from('conjugations')
    .select('vocab_id');

  const countMap = {};
  for (const row of allConjugations || []) {
    countMap[row.vocab_id] = (countMap[row.vocab_id] || 0) + 1;
  }

  const testVerb = data.find(v => !countMap[v.id] || countMap[v.id] < 13);
  if (!testVerb) {
    console.log('No verbs found with fewer than 13 tenses.');
    return;
  }

  console.log(`Test verb: ${testVerb.albanian}`);
  await processVerbWord(testVerb);

  console.log('\nTest run complete.');
}

populateConjugationsTable();