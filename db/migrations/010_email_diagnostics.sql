-- Make a failed completion email visible.
--
-- The first version cleared completion_email_sent_at on failure so a retry
-- could claim it again. That worked, but it made a failure indistinguishable
-- from a send that was never attempted, which is exactly the state one student
-- ended up in overnight with no way to tell why.
--
-- Now a failure leaves evidence: how many times it has been tried and what the
-- last error said.

alter table attempts add column if not exists completion_email_attempts int not null default 0;
alter table attempts add column if not exists completion_email_error text;
