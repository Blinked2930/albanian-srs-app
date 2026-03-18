/**
 * Calculates the Importance Factor (I) for the Convergent SRS algorithm.
 * @param usefulness Int 1-10 User-defined priority
 * @param masteryScore Float 0.0 to 1.0 for SRS calculations
 * @returns {number} The Importance Factor
 */
export function calculateImportanceFactor(usefulness: number, masteryScore: number): number {
    return 1 + ((usefulness - 5) / 5) * (1 - masteryScore);
}

/**
 * Calculates the Levenshtein distance between two strings
 * (DO NOT MODIFY — core evaluation mechanic)
 */
function levenshteinDistance(a: string, b: string): number {
    const matrix = [];
    let i;
    for (i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    let j;
    for (j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    )
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

/**
 * Evaluates the answer to determine correctness or partial credit.
 * (DO NOT MODIFY — core evaluation mechanic)
 * @param expected The correct expected answer
 * @param answer The user's given answer
 * @param threshold The similarity threshold (default from grammar_rules.json is 0.8)
 * @returns A score: 1.0 for exact, 0.5 for > threshold accuracy, 0.0 for less
 */
export function evaluateAnswer(expected: string, answer: string, threshold: number = 0.8): number {
    const cleanExpected = expected.trim().toLowerCase();
    const cleanAnswer = answer.trim().toLowerCase();

    if (cleanExpected === cleanAnswer) {
        return 1.0;
    }

    const distance = levenshteinDistance(cleanExpected, cleanAnswer);
    const maxLength = Math.max(cleanExpected.length, cleanAnswer.length);
    const accuracy = (maxLength - distance) / maxLength;

    return accuracy > threshold ? 0.5 : 0.0;
}

// ────────────────────────────────────────────────────────────────
// SM-2 Spaced Repetition Scheduling
// Based on the SuperMemo SM-2 algorithm (Wozniak, 1987)
// with a usefulness-weighted interval cap inspired by the
// Ebbinghaus forgetting curve.
// ────────────────────────────────────────────────────────────────

export interface SRSSchedule {
  newInterval: number;    // days until next review
  newEaseFactor: number;  // interval multiplier
  newStreak: number;      // consecutive correct answers
  nextReview: string;     // ISO timestamp
  newMastery: number;     // 0.0-1.0 (mapped from interval)
  newConfidence: string;  // ENUM label
}

const MIN_EASE = 1.3;
const MAX_EASE = 4.0;
// High-usefulness words are capped at a shorter max interval to
// ensure they stay fresh. e.g. usefulness=10 → max 30 days;
// usefulness=5 → max 180 days.
const MAX_INTERVAL_BY_USEFULNESS = (u: number) => Math.max(30, 210 - u * 18);

/**
 * SM-2 scheduling: computes the next review schedule based on the
 * answer score, current state, and user-defined usefulness priority.
 *
 * Score → action:
 *   1.0 (Perfect) → extend interval, maintain/boost ease
 *   0.5 (Partial) → reset streak, shrink ease, review in 1 day
 *   0.0 (Fail)    → reset streak, shrink ease more, review today
 */
export function scheduleSRS(
    score: number,
    currentInterval: number,
    easeFactor: number,
    streak: number,
    usefulness: number
): SRSSchedule {
    let newStreak = streak;
    let newEaseFactor = easeFactor;
    let newInterval = currentInterval;

    if (score === 1.0) {
        // Perfect: increase streak and compute new interval (SM-2 steps)
        newStreak = streak + 1;
        if (newStreak === 1) {
            newInterval = 1;
        } else if (newStreak === 2) {
            newInterval = 6;
        } else {
            // Subsequent reps: interval × ease_factor
            newInterval = Math.round(currentInterval * easeFactor);
        }
        // Slight ease boost for perfect recall (optional, keeps it dynamic)
        newEaseFactor = Math.min(MAX_EASE, easeFactor + 0.1);

    } else if (score === 0.5) {
        // Partial credit: review tomorrow, slightly penalise ease
        newStreak = 0;
        newEaseFactor = Math.max(MIN_EASE, easeFactor - 0.15);
        newInterval = 1;

    } else {
        // Total fail: review again today (10-min cooldown), penalise ease more
        newStreak = 0;
        newEaseFactor = Math.max(MIN_EASE, easeFactor - 0.20);
        newInterval = 0;
    }

    // Apply usefulness multiplier: high-priority words get shorter intervals
    // so they surface more frequently (never let a critical word slip away)
    const maxInterval = MAX_INTERVAL_BY_USEFULNESS(usefulness);
    const adjustedInterval = Math.min(maxInterval, Math.max(0, newInterval));

    // Calculate next_review timestamp
    const nextReviewDate = new Date();
    if (adjustedInterval === 0) {
        // Fail → review in 10 minutes (prevents immediate back-to-back spam)
        nextReviewDate.setMinutes(nextReviewDate.getMinutes() + 10);
    } else {
        nextReviewDate.setDate(nextReviewDate.getDate() + adjustedInterval);
    }

    // Map interval → mastery_score (0→0.0, 50 days→1.0, capped)
    const newMastery = Math.min(1.0, adjustedInterval / 50);
    const newConfidence =
        newMastery >= 0.75 ? "Mastered" :
        newMastery >= 0.50 ? "Almost" :
        newMastery >= 0.25 ? "Improvement" : "New";

    return {
        newInterval: adjustedInterval,
        newEaseFactor,
        newStreak,
        nextReview: nextReviewDate.toISOString(),
        newMastery,
        newConfidence,
    };
}

/**
 * Priority-queue selector: returns the single most-urgent due word,
 * or null if nothing is due yet.
 *
 * Priority order:
 *   1. New words (no next_review) — sorted by usefulness desc
 *   2. Overdue words — sorted by how long ago they were due (desc),
 *      then by usefulness as a tiebreaker
 */
export function pickDueWord(vocab: any[]): any | null {
    const now = new Date();

    const dueWords = vocab.filter(w =>
        !w.next_review || new Date(w.next_review) <= now
    );

    if (dueWords.length === 0) return null;

    dueWords.sort((a, b) => {
        const aIsNew = !a.next_review;
        const bIsNew = !b.next_review;

        // New words get top priority so they enter the rotation immediately
        if (aIsNew && !bIsNew) return -1;
        if (!aIsNew && bIsNew) return 1;
        if (aIsNew && bIsNew) {
            // Both new: higher usefulness first
            return (b.usefulness ?? 5) - (a.usefulness ?? 5);
        }

        // Both overdue: most overdue (earliest next_review) first
        const timeDiff = new Date(a.next_review).getTime() - new Date(b.next_review).getTime();
        if (timeDiff !== 0) return timeDiff;

        // Tiebreaker: higher usefulness first
        return (b.usefulness ?? 5) - (a.usefulness ?? 5);
    });

    return dueWords[0];
}

// ────────────────────────────────────────────────────────────────
// Dimensional Metrics Tracking
// Tracks mastery of abstract grammatical concepts (e.g., tenses, pronouns)
// ────────────────────────────────────────────────────────────────

export interface GrammarMetric {
    id: string;
    dimension_type: string;
    dimension_value: string;
    mastery_score: number;
    total_reviews: number;
}

/**
 * Determines WHICH tense and pronoun to test for a due verb
 * based on the user's global weaknesses in the grammar_metrics table.
 * 
 * @param availableTenses Array of tenses available for this verb (e.g., ['present', 'aorist'])
 * @param availablePronouns Array of pronouns (e.g., ['unë', 'ti', 'ai/ajo', 'ne', 'ju', 'ata/ato'])
 * @param grammarMetrics Array of rows fetched from the grammar_metrics table
 * @returns Object with the selected targetTense and targetPronoun
 */
export function determineWeakestConjugation(
    availableTenses: string[], 
    availablePronouns: string[], 
    grammarMetrics: GrammarMetric[]
): { targetTense: string, targetPronoun: string } {
    
    // Helper to extract score, defaulting to 0.5 if we haven't tracked it yet
    const getScore = (type: string, value: string) => {
        const metric = grammarMetrics.find(m => m.dimension_type === type && m.dimension_value === value);
        return metric ? metric.mastery_score : 0.5; // Default to mid-level mastery for new concepts
    };

    // Find the tense with the lowest mastery score
    const targetTense = availableTenses.reduce((weakest, current) => {
        return getScore('tense', current) < getScore('tense', weakest) ? current : weakest;
    });

    // Find the pronoun with the lowest mastery score
    const targetPronoun = availablePronouns.reduce((weakest, current) => {
        return getScore('pronoun', current) < getScore('pronoun', weakest) ? current : weakest;
    });

    return { targetTense, targetPronoun };
}

/**
 * Calculates the new global mastery score for a grammar dimension.
 * Uses an Exponential Moving Average (EMA) to smooth out typos.
 * 
 * @param currentScore The score from grammar_metrics (0.0 to 1.0)
 * @param answerScore The score from evaluateAnswer (0.0, 0.5, or 1.0)
 * @param totalReviews How many times this has been tested
 * @returns {number} The new mastery score
 */
export function updateGlobalGrammarStat(
    currentScore: number, 
    answerScore: number, 
    totalReviews: number
): number {
    // The "weight" of the new answer. 
    // Higher alpha = new answers change the score faster.
    // Lower alpha = it takes more answers to move the needle.
    // We make it slightly more volatile when you have few reviews.
    const alpha = totalReviews < 10 ? 0.3 : 0.1; 

    const newScore = (answerScore * alpha) + (currentScore * (1 - alpha));
    
    // Ensure it stays cleanly bounded between 0.0 and 1.0
    return Math.max(0.0, Math.min(1.0, Number(newScore.toFixed(3))));
}