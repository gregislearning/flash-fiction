-- Add object and location fields to prompts
ALTER TABLE prompts
  ADD COLUMN object TEXT,
  ADD COLUMN location TEXT;
