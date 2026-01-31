-- Create prompts table
CREATE TABLE prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  word_limit INTEGER NOT NULL DEFAULT 300,
  submission_start TIMESTAMPTZ NOT NULL,
  submission_end TIMESTAMPTZ NOT NULL,
  voting_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create submissions table
CREATE TABLE submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  word_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Each user can only submit once per prompt
  UNIQUE(prompt_id, user_id)
);

-- Create votes table
CREATE TABLE votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prompt_id UUID NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Each user can only vote once per prompt
  UNIQUE(prompt_id, user_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_submissions_prompt_id ON submissions(prompt_id);
CREATE INDEX idx_submissions_user_id ON submissions(user_id);
CREATE INDEX idx_votes_prompt_id ON votes(prompt_id);
CREATE INDEX idx_votes_submission_id ON votes(submission_id);
CREATE INDEX idx_votes_user_id ON votes(user_id);

-- Enable Row Level Security
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Prompts: Anyone can read, only admins can create/update/delete
CREATE POLICY "Anyone can view prompts"
  ON prompts FOR SELECT
  USING (true);

CREATE POLICY "Admins can create prompts"
  ON prompts FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    (SELECT (raw_user_meta_data->>'is_admin')::boolean FROM auth.users WHERE id = auth.uid()) = true
  );

CREATE POLICY "Admins can update prompts"
  ON prompts FOR UPDATE
  USING (
    auth.uid() IS NOT NULL AND
    (SELECT (raw_user_meta_data->>'is_admin')::boolean FROM auth.users WHERE id = auth.uid()) = true
  );

CREATE POLICY "Admins can delete prompts"
  ON prompts FOR DELETE
  USING (
    auth.uid() IS NOT NULL AND
    (SELECT (raw_user_meta_data->>'is_admin')::boolean FROM auth.users WHERE id = auth.uid()) = true
  );

-- Submissions: Complex visibility rules based on prompt phase
-- During writing: users see only their own
-- During voting: all submissions visible (but user_id hidden via API)
-- After voting: all submissions with authors revealed

CREATE POLICY "Users can view submissions based on phase"
  ON submissions FOR SELECT
  USING (
    -- User can always see their own submission
    user_id = auth.uid()
    OR
    -- Anyone can see submissions after submission_end (voting or results phase)
    EXISTS (
      SELECT 1 FROM prompts 
      WHERE prompts.id = submissions.prompt_id 
      AND NOW() >= prompts.submission_end
    )
  );

CREATE POLICY "Authenticated users can create submissions during writing phase"
  ON submissions FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM prompts 
      WHERE prompts.id = prompt_id 
      AND NOW() >= prompts.submission_start 
      AND NOW() < prompts.submission_end
    )
  );

CREATE POLICY "Users can update their own submissions during writing phase"
  ON submissions FOR UPDATE
  USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM prompts 
      WHERE prompts.id = prompt_id 
      AND NOW() >= submission_start 
      AND NOW() < submission_end
    )
  );

CREATE POLICY "Users can delete their own submissions during writing phase"
  ON submissions FOR DELETE
  USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM prompts 
      WHERE prompts.id = prompt_id 
      AND NOW() >= submission_start 
      AND NOW() < submission_end
    )
  );

-- Votes: One vote per user per prompt, only during voting phase
CREATE POLICY "Users can view votes after voting ends"
  ON votes FOR SELECT
  USING (
    -- Users can see their own vote
    user_id = auth.uid()
    OR
    -- Anyone can see all votes after voting_end
    EXISTS (
      SELECT 1 FROM prompts 
      WHERE prompts.id = votes.prompt_id 
      AND NOW() >= prompts.voting_end
    )
  );

CREATE POLICY "Authenticated users can vote during voting phase"
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
    )
  );

CREATE POLICY "Users can delete their vote during voting phase"
  ON votes FOR DELETE
  USING (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM prompts 
      WHERE prompts.id = prompt_id 
      AND NOW() >= submission_end 
      AND NOW() < voting_end
    )
  );

-- Helper function to get vote counts for submissions
CREATE OR REPLACE FUNCTION get_submission_vote_count(submission_uuid UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM votes WHERE submission_id = submission_uuid;
$$ LANGUAGE SQL SECURITY DEFINER;
