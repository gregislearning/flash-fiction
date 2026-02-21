-- Add claiming support: authors can optionally reveal their identity after voting ends
ALTER TABLE submissions
  ADD COLUMN claimed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN author_email TEXT;

-- Allow users to toggle claim status on their own submissions once results are in.
-- This is a second UPDATE policy (OR'd with the existing writing-phase policy).
CREATE POLICY "Users can claim own submissions after voting ends"
  ON submissions FOR UPDATE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM prompts
      WHERE prompts.id = submissions.prompt_id
      AND NOW() >= prompts.voting_end
    )
  );
