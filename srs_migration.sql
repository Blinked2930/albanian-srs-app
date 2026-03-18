-- SM-2 SRS columns migration
-- Run this in your Supabase SQL Editor to add the scheduling fields

ALTER TABLE vocab
  ADD COLUMN IF NOT EXISTS next_review  TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS interval     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ease_factor  FLOAT   NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS streak       INTEGER NOT NULL DEFAULT 0;

-- Index: fast lookup of due words ordered by priority
CREATE INDEX IF NOT EXISTS idx_vocab_next_review ON vocab (next_review ASC NULLS FIRST);
