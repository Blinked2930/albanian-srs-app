# Technical Design Document

## 1. Tech Stack
- **Frontend:** Next.js 15+ (App Router), Tailwind CSS, Framer Motion (for smooth transitions).
- **Backend:** Supabase (Auth & PostgreSQL).
- **Deployment:** Vercel (Free Tier).

## 2. Database Schema (Table: `vocab`)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | UUID | Primary Key |
| `english` | Text | The prompt word/phrase |
| `albanian` | Text | The correct answer |
| `type` | Enum | [Phrase, Adj, Verb, Adv, Noun_M, Noun_F] |
| `usefulness` | Int | 1-10 User-defined priority |
| `confidence` | Text | [New, Improvement, Almost, Mastered] |
| `mastery_score`| Float | 0.0 to 1.0 for SRS calculations |
| `last_seen` | Timestamp | For interval scheduling |

## 3. Algorithm: Convergent SRS
The Importance Factor (I) determines selection frequency:
`I = 1 + ((usefulness - 5) / 5) * (1 - mastery_score)`

## 4. Integration
- **CSV Export:** Must export data with headers: `Albanian (Standardized), English, Type, Confidence, Usefulness, Date Learned`.