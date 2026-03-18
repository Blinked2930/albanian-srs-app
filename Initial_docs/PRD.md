# Albanian Language Lab - Product Requirements Document

## 1. Goal
A high-friction, "Tier 1" learning tool designed for deep vocabulary and grammar acquisition. It replaces digital numbing with conscious, active engagement.

## 2. Core Features
- **Synthetic Sentence Generator:** Randomly pairs vocabulary with grammatical constraints (Tense, Mood, Case, Gender).
- **Convergent SRS:** Frequency is controlled by a 'Usefulness' score (1-10) that yields to standard SRS intervals as 'Mastery' increases.
- **Partial Credit Engine:** Uses string similarity (Levenshtein distance) to award 0.5 credit for >80% accuracy.
- **Universal Vocab Support:** Handles Phrase, Adjective, Verb, Adverb, Noun (Male), and Noun (Female).

## 3. The "Tier 1" Logic
- **Friction-First:** No hints. No Albanian in prompts. 
- **One-at-a-Time:** The UI is a single focused question.
- **Mobile-First:** A Progressive Web App (PWA) that works on a phone via a private Vercel URL.

## 4. Mastery Mapping
The tool maps existing spreadsheet categories to starting Mastery (M) scores:
- New: 0.0
- Needs Improvement: 0.3
- Almost There: 0.7
- Mastered: 1.0