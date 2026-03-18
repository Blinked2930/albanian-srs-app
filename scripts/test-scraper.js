require('dotenv').config({ path: '.env.local' });

const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log('SUPABASE_SERVICE_KEY loaded:', !!process.env.SUPABASE_SERVICE_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const KEEP_TENSES = [
  'indicative_present',
  'indicative_imperfect',
  'indicative_aorist',
  'subjunctive_present',
  'imperative_present',
  'participle'
];

async function main() {
  try {
    console.log('Starting conjugation scraping process...');

    const verbs = await fetchVerbsFromSupabase();
    console.log(`Found ${verbs.length} verbs to process.`);

    const { data: existing, error: existingError } = await supabase
      .from('conjugations')
      .select('vocab_id');
    if (existingError) throw new Error(`Error fetching existing conjugations: ${existingError.message}`);

    const alreadyProcessed = new Set(existing.map(r => r.vocab_id));
    console.log(`Skipping ${alreadyProcessed.size} verbs already in conjugations table.`);

    const toProcess = verbs.filter(v => !alreadyProcessed.has(v.id));
    console.log(`Processing ${toProcess.length} remaining verbs.`);

    for (const verb of toProcess) {
      await processVerb(verb);
      await sleep(1000);
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
  if (!data.length) console.warn('No verbs found in vocab table.');
  return data;
}

async function processVerb(verb) {
  const word = verb.albanian.toLowerCase().trim();
  console.log(`\nProcessing: ${word}`);

  try {
    const url = `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
    const html = await fetchWiktionaryHTML(url);
    const conjugations = extractConjugationData(html, word);

    if (Object.keys(conjugations).length === 0) {
      console.warn(`  No matching tenses found for "${word}", skipping.`);
      return;
    }

    await storeConjugations(verb.id, word, conjugations);
    console.log(`  ✓ Stored ${Object.keys(conjugations).length} tense forms for "${word}".`);
  } catch (error) {
    console.error(`  ✗ Failed for "${word}": ${error.message}`);
  }
}

async function fetchWiktionaryHTML(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return await response.text();
}

function extractConjugationData(html, word) {
  const $ = cheerio.load(html);

  const table = $('table.inflection-table').first();
  if (!table.length) {
    throw new Error(`No inflection table found for "${word}"`);
  }

  const pronouns = ['unë', 'ti', 'ai/ajo', 'ne', 'ju', 'ata/ato'];
  const allConjugations = {};
  let currentMood = null;

  // Extract participle from the header row of the table
  table.find('tr').first().find('td, th').each(function() {
    const cell = $(this);
    const text = cell.text().trim().toLowerCase();
    if (text === 'participle') {
      const participleForm = cell.next().text().trim();
      if (participleForm) {
        allConjugations['participle'] = {
          'unë': participleForm,
          'ti': null,
          'ai/ajo': null,
          'ne': null,
          'ju': null,
          'ata/ato': null,
        };
      }
    }
  });

  // Also check all header rows for participle
  table.find('tr').each(function(rowIndex) {
    const row = $(this);
    const cells = row.find('th, td');

    cells.each(function() {
      const cell = $(this);
      const text = cell.text().trim().toLowerCase();
      if (text === 'participle') {
        const next = cell.next();
        if (next.length) {
          const participleForm = next.find('a').first().text().trim() || next.text().trim();
          if (participleForm && participleForm.toLowerCase() !== 'participle') {
            allConjugations['participle'] = {
              'unë': participleForm,
              'ti': null,
              'ai/ajo': null,
              'ne': null,
              'ju': null,
              'ata/ato': null,
            };
          }
        }
      }
    });

    // Track mood from rowspan headers
    const firstCell = cells.first();
    const hasMoodRowspan = parseInt(firstCell.attr('rowspan') || '1') > 1;
    if (hasMoodRowspan) {
      currentMood = firstCell.text().trim().toLowerCase();
    }

    // Check for imperative row
    cells.each(function() {
      const cell = $(this);
      const text = cell.text().trim().toLowerCase();
      if (text === 'imperative') {
        currentMood = 'imperative';
      }
    });

    let tenseCell = null;
    let tenseCellIndex = -1;

    cells.each(function(i) {
      const text = $(this).text().trim().toLowerCase();
      const tenses = ['present', 'aorist', 'imperfect', 'perfect', 'pluperfect'];
      if (tenses.includes(text)) {
        tenseCell = text;
        tenseCellIndex = i;
      }
    });

    if (!tenseCell || tenseCellIndex === -1) return;

    const key = currentMood ? `${currentMood}_${tenseCell}` : tenseCell;
    allConjugations[key] = {};

    let verbIndex = 0;
    cells.each(function(i) {
      if (i <= tenseCellIndex) return;
      const verbForm = $(this).text().replace(/\s+/g, ' ').trim();
      if (verbIndex < pronouns.length) {
        allConjugations[key][pronouns[verbIndex]] = verbForm;
        verbIndex++;
      }
    });
  });

  // Filter to only the 6 tenses we want
  const filtered = {};
  for (const tense of KEEP_TENSES) {
    if (allConjugations[tense]) {
      filtered[tense] = allConjugations[tense];
    }
  }

  return filtered;
}

const cleanForm = (val) => {
  if (!val || val === '—' || val === '-' || val.trim() === '') return null;
  return val.trim();
};

async function storeConjugations(vocabId, albanian, conjugations) {
  await supabase
    .from('conjugations')
    .delete()
    .eq('vocab_id', vocabId);

  const rows = Object.entries(conjugations).map(([moodTense, forms]) => ({
    vocab_id: vocabId,
    albanian: albanian,
    mood_tense: moodTense,
    une: cleanForm(forms['unë'] || forms['une']),
    ti: cleanForm(forms['ti']),
    ai_ajo: cleanForm(forms['ai/ajo'] || forms['ai_ajo']),
    ne: cleanForm(forms['ne']),
    ju: cleanForm(forms['ju']),
    ata_ato: cleanForm(forms['ata/ato'] || forms['ata_ato']),
  }));

  const { error } = await supabase
    .from('conjugations')
    .insert(rows);

  if (error) throw new Error(`Supabase insert error: ${error.message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main();