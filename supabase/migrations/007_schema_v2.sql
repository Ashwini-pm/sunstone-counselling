-- Expand tests.role to include 5 new roles
ALTER TABLE tests DROP CONSTRAINT IF EXISTS tests_role_check;
ALTER TABLE tests ADD CONSTRAINT tests_role_check
  CHECK (role IN ('marketing', 'java', 'tech', 'management', 'coding', 'aptitude', 'comms'));

-- Expand questions.role to include 5 new roles + shared banks
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_role_check;
ALTER TABLE questions ADD CONSTRAINT questions_role_check
  CHECK (role IN ('marketing', 'java', 'both', 'tech', 'management', 'coding', 'aptitude', 'comms', 'shared'));

-- Drop the old type check so we can insert freely
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_type_check;
ALTER TABLE questions ALTER COLUMN type DROP NOT NULL;

-- Doubts for micro-teaching topics (3 strings per topic, travels with the topic)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS doubts jsonb;

-- Position in the ordered attempt (1=intro, 2-8=shuffled, 9=reflect)
ALTER TABLE attempt_questions ADD COLUMN IF NOT EXISTS position int;
