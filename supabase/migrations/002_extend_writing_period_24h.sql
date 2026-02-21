-- Extend writing period by 24 hours for active/upcoming prompts
-- Shift voting_end equally to preserve voting duration
UPDATE prompts
SET
  submission_end = submission_end + INTERVAL '24 hours',
  voting_end = voting_end + INTERVAL '24 hours'
WHERE submission_end >= NOW();
