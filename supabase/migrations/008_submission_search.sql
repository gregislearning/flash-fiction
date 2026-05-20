-- Add a generated tsvector column on submissions.
-- GENERATED ALWAYS AS ... STORED means Postgres computes and stores it
-- automatically on every insert/update of `content`. No triggers needed.
-- Existing rows are backfilled automatically.
ALTER TABLE submissions
  ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- GIN index for fast @@ lookups.
CREATE INDEX idx_submissions_search_tsv
  ON submissions USING GIN(search_tsv);

-- RPC the frontend will call.
-- SECURITY INVOKER: runs as the calling user, so existing RLS policies still apply.
-- The extra `now() >= p.submission_end` clause aligns with the SELECT policy on
-- submissions, ensuring writing-phase content is never returned.
CREATE OR REPLACE FUNCTION search_submissions(q text, lim int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  prompt_id uuid,
  prompt_title text,
  prompt_phase text,
  snippet text,
  rank real,
  claimed boolean,
  author_email text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    s.id,
    s.prompt_id,
    p.title AS prompt_title,
    CASE WHEN now() >= p.voting_end THEN 'results' ELSE 'voting' END AS prompt_phase,
    ts_headline(
      'english',
      s.content,
      websearch_to_tsquery('english', q),
      'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=20, MinWords=8'
    ) AS snippet,
    ts_rank(s.search_tsv, websearch_to_tsquery('english', q)) AS rank,
    s.claimed,
    s.author_email,
    s.created_at
  FROM submissions s
  JOIN prompts p ON p.id = s.prompt_id
  WHERE s.search_tsv @@ websearch_to_tsquery('english', q)
    AND now() >= p.submission_end
  ORDER BY rank DESC, s.created_at DESC
  LIMIT GREATEST(1, LEAST(lim, 100));
$$;

GRANT EXECUTE ON FUNCTION search_submissions(text, int) TO anon, authenticated;
