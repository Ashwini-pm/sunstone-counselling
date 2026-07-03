-- Replace public invite access with email-gated access
DROP POLICY IF EXISTS "public read reviewer_invites" ON reviewer_invites;
CREATE POLICY "reviewers read own invite" ON reviewer_invites
  FOR SELECT USING (auth.email() = email);

-- Tighten score insert: must be authenticated + email matches invite
DROP POLICY IF EXISTS "reviewer insert score" ON scores;
CREATE POLICY "reviewer insert score" ON scores FOR INSERT
  WITH CHECK (
    reviewer_invite_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM reviewer_invites
      WHERE id = reviewer_invite_id AND email = auth.email()
    )
  );

-- Tighten score update
DROP POLICY IF EXISTS "reviewer update score" ON scores;
CREATE POLICY "reviewer update score" ON scores FOR UPDATE
  USING (
    reviewer_invite_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM reviewer_invites
      WHERE id = reviewer_invite_id AND email = auth.email()
    )
  );

-- Tighten score read
DROP POLICY IF EXISTS "reviewer read scores" ON scores;
CREATE POLICY "reviewer read scores" ON scores FOR SELECT
  USING (
    reviewer_invite_id IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM reviewer_invites
      WHERE id = reviewer_invite_id AND email = auth.email()
    )
  );

-- Tighten recordings read
DROP POLICY IF EXISTS "reviewer read recordings" ON recordings;
CREATE POLICY "reviewer read recordings" ON recordings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM reviewer_invites ri
      WHERE ri.attempt_id = recordings.attempt_id AND ri.email = auth.email()
    )
  );

-- Tighten attempts read
DROP POLICY IF EXISTS "reviewer read attempts" ON attempts;
CREATE POLICY "reviewer read attempts" ON attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM reviewer_invites ri
      WHERE ri.attempt_id = attempts.id AND ri.email = auth.email()
    )
  );

-- Tighten candidates read
DROP POLICY IF EXISTS "reviewer read candidates" ON candidates;
CREATE POLICY "reviewer read candidates" ON candidates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM attempts a
      JOIN reviewer_invites ri ON ri.attempt_id = a.id
      WHERE a.candidate_id = candidates.id AND ri.email = auth.email()
    )
  );

-- Tighten tests read
DROP POLICY IF EXISTS "reviewer read tests" ON tests;
CREATE POLICY "reviewer read tests" ON tests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM attempts a
      JOIN reviewer_invites ri ON ri.attempt_id = a.id
      WHERE a.test_id = tests.id AND ri.email = auth.email()
    )
  );
