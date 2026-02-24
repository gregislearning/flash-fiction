-- Drop the old unique constraint (1 vote per user per prompt)
ALTER TABLE votes DROP CONSTRAINT votes_prompt_id_user_id_key;

-- Add new unique constraint (prevent voting for same submission twice)
ALTER TABLE votes ADD CONSTRAINT votes_prompt_id_user_id_submission_id_key UNIQUE(prompt_id, user_id, submission_id);

-- Drop the old insert policy
DROP POLICY "Authenticated users can vote during voting phase" ON votes;

-- Create new insert policy with 2-vote limit
CREATE POLICY "Authenticated users can vote for up to 2 submissions"
  ON votes FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    user_id = auth.uid() AND
    -- Must be during voting phase
    EXISTS (
      SELECT 1 FROM prompts 
      WHERE prompts.id = prompt_id 
      AND NOW() >= prompts.submission_end 
      AND NOW() < prompts.voting_end
    ) AND
    -- Cannot vote for own submission
    NOT EXISTS (
      SELECT 1 FROM submissions 
      WHERE submissions.id = submission_id 
      AND submissions.user_id = auth.uid()
    ) AND
    -- Limit to 2 votes per user per prompt
    (SELECT COUNT(*) FROM votes v WHERE v.prompt_id = prompt_id AND v.user_id = auth.uid()) < 2
  );
