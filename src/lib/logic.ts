export function calculateImportanceFactor(usefulness: number, masteryScore: number): number {
    return 1 + ((usefulness - 5) / 5) * (1 - masteryScore);
}

function levenshteinDistance(a: string, b: string): number {
    const matrix = [];
    let i;
    for (i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    let j;
    for (j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

export function evaluateAnswer(expected: string, answer: string, threshold: number = 0.8): number {
    const cleanExpected = expected.trim().toLowerCase();
    const cleanAnswer = answer.trim().toLowerCase();
    if (cleanExpected === cleanAnswer) return 1.0;

    const distance = levenshteinDistance(cleanExpected, cleanAnswer);
    const maxLength = Math.max(cleanExpected.length, cleanAnswer.length);
    const accuracy = (maxLength - distance) / maxLength;
    return accuracy > threshold ? 0.5 : 0.0;
}

export interface SRSSchedule {
  newInterval: number;    
  newEaseFactor: number;  
  newStreak: number;      
  nextReview: string;     
  newMastery: number;     
  newConfidence: string;  
}

const MIN_EASE = 1.3;
const MAX_EASE = 4.0;
const MAX_INTERVAL_BY_USEFULNESS = (u: number) => Math.max(30, 210 - u * 18);

export function scheduleSRS(score: number, currentInterval: number, easeFactor: number, streak: number, usefulness: number): SRSSchedule {
    let newStreak = streak;
    let newEaseFactor = easeFactor;
    let newInterval = currentInterval;

    if (score === 1.0) {
        newStreak = streak + 1;
        if (newStreak === 1) newInterval = 1;
        else if (newStreak === 2) newInterval = 6;
        else newInterval = Math.round(currentInterval * easeFactor);
        newEaseFactor = Math.min(MAX_EASE, easeFactor + 0.1);
    } else if (score === 0.5) {
        newStreak = 0;
        newEaseFactor = Math.max(MIN_EASE, easeFactor - 0.15);
        newInterval = 1;
    } else {
        newStreak = 0;
        newEaseFactor = Math.max(MIN_EASE, easeFactor - 0.20);
        newInterval = 0;
    }

    const maxInterval = MAX_INTERVAL_BY_USEFULNESS(usefulness);
    const adjustedInterval = Math.min(maxInterval, Math.max(0, newInterval));
    const nextReviewDate = new Date();
    
    if (adjustedInterval === 0) {
        nextReviewDate.setMinutes(nextReviewDate.getMinutes() + 10);
    } else {
        nextReviewDate.setDate(nextReviewDate.getDate() + adjustedInterval);
    }

    const newMastery = Math.min(1.0, adjustedInterval / 50);
    const newConfidence = newMastery >= 0.75 ? "Mastered" : newMastery >= 0.50 ? "Almost" : newMastery >= 0.25 ? "Improvement" : "New";

    return { newInterval: adjustedInterval, newEaseFactor, newStreak, nextReview: nextReviewDate.toISOString(), newMastery, newConfidence };
}

export function pickDueWord(vocab: any[], lastWordId?: string): any | null {
    const now = new Date();
    let dueWords = vocab.filter(w => (!w.next_review || new Date(w.next_review) <= now) && w.id !== lastWordId);
    if (dueWords.length === 0) return null; 

    dueWords.sort((a, b) => {
        const aIsNew = !a.next_review;
        const bIsNew = !b.next_review;
        if (aIsNew && !bIsNew) return -1;
        if (!aIsNew && bIsNew) return 1;
        if (aIsNew && bIsNew) return (b.usefulness ?? 5) - (a.usefulness ?? 5);

        const timeDiff = new Date(a.next_review).getTime() - new Date(b.next_review).getTime();
        if (timeDiff !== 0) return timeDiff;
        return (b.usefulness ?? 5) - (a.usefulness ?? 5);
    });
    return dueWords[0];
}

export interface GrammarMetric {
    id: string;
    dimension_type: string;
    dimension_value: string;
    mastery_score: number;
    total_reviews: number;
    importance: number; 
}

// THE FIX: Safe fallback for importance, plus a random tie-breaker.
export function getUrgency(type: string, value: string, grammarMetrics: GrammarMetric[]): number {
    const metric = grammarMetrics.find(m => m.dimension_type === type && m.dimension_value === value);
    if (!metric) return 5 * (1 - 0.5) + (Math.random() * 0.2); 
    const importance = metric.importance || 5; 
    return importance * (1 - metric.mastery_score) + (Math.random() * 0.2);
}

export function determineWeakestConjugation(availableTenses: string[], availablePronouns: string[], grammarMetrics: GrammarMetric[]): { targetTense: string, targetPronoun: string } {
    const targetTense = availableTenses.reduce((mostUrgent, current) => getUrgency('tense', current, grammarMetrics) > getUrgency('tense', mostUrgent, grammarMetrics) ? current : mostUrgent);
    const targetPronoun = availablePronouns.reduce((mostUrgent, current) => getUrgency('pronoun', current, grammarMetrics) > getUrgency('pronoun', mostUrgent, grammarMetrics) ? current : mostUrgent);
    return { targetTense, targetPronoun };
}

export function determineWeakestNounForm(grammarMetrics: GrammarMetric[]): { targetCase: string, targetNumber: string, targetDefiniteness: string } {
    const cases = ['Nominative', 'Accusative', 'Genitive', 'Dative', 'Ablative'];
    const numbers = ['Singular', 'Plural'];
    const definiteness = ['Indefinite', 'Definite'];

    const targetCase = cases.reduce((mostUrgent, current) => getUrgency('case', current, grammarMetrics) > getUrgency('case', mostUrgent, grammarMetrics) ? current : mostUrgent);
    const targetNumber = numbers.reduce((mostUrgent, current) => getUrgency('number', current, grammarMetrics) > getUrgency('number', mostUrgent, grammarMetrics) ? current : mostUrgent);
    const targetDefiniteness = definiteness.reduce((mostUrgent, current) => getUrgency('definiteness', current, grammarMetrics) > getUrgency('definiteness', mostUrgent, grammarMetrics) ? current : mostUrgent);

    return { targetCase, targetNumber, targetDefiniteness };
}

export function determineWeakestAdjectiveForm(grammarMetrics: GrammarMetric[]): { targetCase: string, targetNumber: string, targetDefiniteness: string, targetGender: string } {
    const nounForm = determineWeakestNounForm(grammarMetrics);
    const genders = ['Masculine', 'Feminine'];
    const targetGender = genders.reduce((mostUrgent, current) => getUrgency('gender', current, grammarMetrics) > getUrgency('gender', mostUrgent, grammarMetrics) ? current : mostUrgent);
    return { ...nounForm, targetGender };
}

export function updateGlobalGrammarStat(currentScore: number, answerScore: number, totalReviews: number): number {
    const alpha = totalReviews < 10 ? 0.3 : 0.1; 
    const newScore = (answerScore * alpha) + (currentScore * (1 - alpha));
    return Math.max(0.0, Math.min(1.0, Number(newScore.toFixed(3))));
}