-- Allow candidates to read and insert their own attempt_questions
CREATE POLICY "candidates read own attempt_questions"
  ON attempt_questions FOR SELECT
  USING (
    attempt_id IN (
      SELECT id FROM attempts WHERE candidate_id = (
        SELECT id FROM candidates WHERE email = auth.email()
      )
    )
  );

CREATE POLICY "candidates insert own attempt_questions"
  ON attempt_questions FOR INSERT
  WITH CHECK (
    attempt_id IN (
      SELECT id FROM attempts WHERE candidate_id = (
        SELECT id FROM candidates WHERE email = auth.email()
      )
    )
  );
