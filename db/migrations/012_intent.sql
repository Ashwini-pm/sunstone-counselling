-- A binary read on whether the student intends to take admission.
--
-- 1 or 0, judged from what they actually said across their answers, not from
-- how far they got in the flow. Someone can finish all six stations and say
-- nothing that suggests they will enrol.
--
-- intent_reason is stored even though only the 1/0 is displayed. A bare label
-- gets trusted more than it deserves, and one line of justification is the only
-- way to tell a good call from a bad one after the fact. It costs nothing.

alter table attempts add column if not exists intent smallint
  check (intent in (0, 1));
alter table attempts add column if not exists intent_reason text;
alter table attempts add column if not exists intent_model text;
alter table attempts add column if not exists intent_at timestamptz;
alter table attempts add column if not exists intent_error text;
alter table attempts add column if not exists intent_attempts int not null default 0;

-- Only ever asked: who is finished and still unjudged.
create index if not exists attempts_intent_pending_idx
  on attempts (submitted_at)
  where status = 'submitted' and intent is null;
