-- Drop the old unique constraint (1 vote per user per prompt)
ALTER TABLE votes DROP CONSTRAINT votes_prompt_id_user_id_key;

-- Add new unique constraint (prevent voting for same submission twice)
ALTER TABLE votes ADD CONSTRAINT votes_prompt_id_user_id_submission_id_key UNIQUE(prompt_id, user_id, submission_id);

-- SECURITY DEFINER function to count user votes without triggering RLS recursion
CREATE OR REPLACE FUNCTION get_user_vote_count_for_prompt(p_prompt_id UUID, p_user_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM votes
  WHERE prompt_id = p_prompt_id AND user_id = p_user_id;
$$ LANGUAGE SQL SECURITY DEFINER;

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
    get_user_vote_count_for_prompt(prompt_id, auth.uid()) < 2
  );
