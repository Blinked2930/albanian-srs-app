import OpenAI from 'openai';
import grammarRules from './grammar_rules.json';

// Initialize OpenAI conditionally
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

export async function generateSentencePrompt(wordEnglish: string, wordAlbanian: string, type: string, constraints: string[]) {
  if (!openai) {
    console.warn("OPENAI_API_KEY is not set. Falling back to mocked generation.");
    // Fallback logic could go here
    return {
      english: `[Mock] I see the ${wordEnglish}.`,
      albanian: `[Mock] Unë shoh ${wordAlbanian}.`
    };
  }

  const prompt = `
  You are an expert Albanian Language educator. Generate ONE simple practice sentence for a student learning Albanian.
  
  Target Vocabulary Word:
  English: ${wordEnglish}
  Albanian: ${wordAlbanian}
  Word Type: ${type}
  
  Grammatical Constraints to enforce in the sentence:
  ${constraints.join(", ")}
  
  Output ONLY valid JSON with two keys:
  {
    "english": "The English translation of the sentence.",
    "albanian": "The Albanian sentence."
  }
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // fast and capable
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    return parsed;
  } catch (error) {
    console.error("LLM Generation Error:", error);
    throw error;
  }
}

/**
 * SRS Algorithm adjustment based on the new requirements.
 * Maps 1-10 usefulness to an acceleration factor.
 */
export function calculateNextReviewInterval(currentInterval: number, usefulness: number, score: number): number {
  let multiplier = 1.0;
  
  // High usefulness (6-10) -> shorter intervals (show more often)
  // Low usefulness (1-5) -> longer intervals (show less often)
  if (usefulness > 5) {
     multiplier = 1.0 - ((usefulness - 5) * 0.1); // e.g. 10 -> 0.5x interval
  } else if (usefulness < 5) {
     multiplier = 1.0 + ((5 - usefulness) * 0.2); // e.g. 1 -> 1.8x interval
  }

  // Base SRS math (simplified SM2)
  let nextInterval = currentInterval;
  if (score === 1.0) {
    nextInterval = currentInterval === 0 ? 1 : currentInterval * 2.5;
  } else if (score > 0) {
    nextInterval = currentInterval === 0 ? 1 : currentInterval * 1.5;
  } else {
    nextInterval = 1; // Reset on failure
  }

  return Math.max(1, nextInterval * multiplier);
}
