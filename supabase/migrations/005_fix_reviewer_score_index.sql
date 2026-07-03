-- Fix: unique index was missing rubric_key, blocking multiple rubric scores per station
DROP INDEX IF EXISTS scores_reviewer_uniq;
CREATE UNIQUE INDEX scores_reviewer_uniq
  ON scores (reviewer_invite_id, station_id, rubric_key)
  WHERE reviewer_invite_id IS NOT NULL;

-- Fix: missing delete policy prevented delete-before-insert from working
CREATE POLICY "reviewer delete score" ON scores FOR DELETE
  USING (reviewer_invite_id IS NOT NULL);
