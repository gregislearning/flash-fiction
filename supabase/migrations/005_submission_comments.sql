-- Create submission_comments table
CREATE TABLE submission_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_email TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for loading all comments on a submission
CREATE INDEX idx_submission_comments_submission_id ON submission_comments(submission_id);

-- Enable Row Level Security
ALTER TABLE submission_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments
CREATE POLICY "Anyone can view comments"
  ON submission_comments FOR SELECT
  USING (true);

-- Authenticated users can comment after voting ends
CREATE POLICY "Authenticated users can comment after voting ends"
  ON submission_comments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM submissions
      JOIN prompts ON prompts.id = submissions.prompt_id
      WHERE submissions.id = submission_id
      AND NOW() >= prompts.voting_end
    )
  );

-- Users can edit their own comments
CREATE POLICY "Users can update their own comments"
  ON submission_comments FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete their own comments
CREATE POLICY "Users can delete their own comments"
  ON submission_comments FOR DELETE
  USING (user_id = auth.uid());
