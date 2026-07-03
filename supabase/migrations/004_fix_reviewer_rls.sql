-- Fix infinite RLS recursion introduced in 003_reviewer_invites.sql
-- The original reviewer read policies on candidates/attempts/tests/recordings
-- queried through RLS-protected tables, causing circular evaluation with
-- pre-existing policies like "candidates read own attempts".
-- Solution: use SECURITY DEFINER functions that bypass RLS inside.

DROP POLICY IF EXISTS "reviewer read attempts"   ON attempts;
DROP POLICY IF EXISTS "reviewer read candidates" ON candidates;
DROP POLICY IF EXISTS "reviewer read tests"      ON tests;
DROP POLICY IF EXISTS "reviewer read recordings" ON recordings;

-- Drop helper from any previous fix attempt
DROP FUNCTION IF EXISTS has_reviewer_invite_for_attempt(uuid);

CREATE OR REPLACE FUNCTION reviewer_can_access_attempt(p uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM reviewer_invites WHERE attempt_id = p)
$$;

CREATE OR REPLACE FUNCTION reviewer_can_access_candidate(p uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM reviewer_invites ri
    JOIN attempts a ON a.id = ri.attempt_id
    WHERE a.candidate_id = p
  )
$$;

CREATE OR REPLACE FUNCTION reviewer_can_access_test(p uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM reviewer_invites ri
    JOIN attempts a ON a.id = ri.attempt_id
    WHERE a.test_id = p
  )
$$;

CREATE POLICY "reviewer read attempts" ON attempts FOR SELECT
  USING (reviewer_can_access_attempt(attempts.id));

CREATE POLICY "reviewer read candidates" ON candidates FOR SELECT
  USING (reviewer_can_access_candidate(candidates.id));

CREATE POLICY "reviewer read tests" ON tests FOR SELECT
  USING (reviewer_can_access_test(tests.id));

CREATE POLICY "reviewer read recordings" ON recordings FOR SELECT
  USING (reviewer_can_access_attempt(recordings.attempt_id));
