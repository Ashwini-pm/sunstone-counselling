-- Record when the completion email went out.
--
-- The client can call /api/attempt/submit more than once: it retries, and a
-- student who reopens a finished link hits it again. Without a marker they
-- would receive the same email twice, which for a professional admissions
-- message is worse than not sending it at all.
--
-- A timestamp rather than a boolean, so a failed send can be told apart from
-- one that never happened, and so support can answer "when did we email them".

alter table attempts add column if not exists completion_email_sent_at timestamptz;

-- Partial index: the only question ever asked of this column is "who has not
-- been emailed yet", so indexing the sent ones would be dead weight.
create index if not exists attempts_email_pending_idx
  on attempts (submitted_at)
  where status = 'submitted' and completion_email_sent_at is null;
