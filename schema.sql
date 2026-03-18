-- Enum types
CREATE TYPE vocab_type AS ENUM ('Phrase', 'Adjective', 'Verb', 'Adverb', 'Noun (M)', 'Noun (F)', 'Command', 'Preposition');
CREATE TYPE vocab_confidence AS ENUM ('New', 'Improvement', 'Almost', 'Mastered');

-- Vocab table
CREATE TABLE vocab (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  english TEXT NOT NULL,
  albanian TEXT NOT NULL,
  type vocab_type NOT NULL,
  usefulness INTEGER NOT NULL CHECK (usefulness >= 1 AND usefulness <= 10),
  confidence vocab_confidence NOT NULL,
  mastery_score FLOAT NOT NULL CHECK (mastery_score >= 0.0 AND mastery_score <= 1.0),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grammar Mastery table (tracks SRS progress per grammatical feature)
CREATE TABLE grammar_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vocab_id UUID REFERENCES vocab(id) ON DELETE CASCADE,
  grammar_type TEXT NOT NULL, -- e.g., 'Tense', 'Case', 'Mood', 'Pronoun'
  grammar_value TEXT NOT NULL, -- e.g., 'Aorist', 'Nominative', 'Subjunctive', 'Unë'
  mastery_score FLOAT NOT NULL DEFAULT 0.0 CHECK (mastery_score >= 0.0 AND mastery_score <= 1.0),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(vocab_id, grammar_type, grammar_value)
);

-- Review Logs table (For progress dashboard)
CREATE TABLE review_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vocab_id UUID REFERENCES vocab(id) ON DELETE SET NULL,
  grammar_mastery_id UUID REFERENCES grammar_mastery(id) ON DELETE SET NULL, -- Can be null if it was just a word drill
  score FLOAT NOT NULL, -- 0.0 to 1.0
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS (Optional depending on auth setup)
ALTER TABLE vocab ENABLE ROW LEVEL SECURITY;
ALTER TABLE grammar_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_logs ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read/write access (for local development prior to active auth integration)
CREATE POLICY "Allow public all access on vocab" ON vocab FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access on grammar_mastery" ON grammar_mastery FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access on review_logs" ON review_logs FOR ALL USING (true) WITH CHECK (true);
