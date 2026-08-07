-- Transcribe each recorded answer.
--
-- Text, not audio, so the footprint is trivial: a 19 second answer is about
-- 300 bytes, and every answer from all 1,720 students comes to roughly 3 MB
-- against a database currently at 11 MB. The video it came from is 50 MB and
-- lives in S3.
--
-- In Postgres rather than only in the sheet for two reasons. The Recordings tab
-- is rebuilt on every refresh, so a transcript held there would have to be read
-- out and written back every fifteen minutes, and the day that breaks the text
-- is gone. And "which students mentioned hostel" is a query here and impossible
-- in a spreadsheet.

alter table recordings add column if not exists transcript text;
alter table recordings add column if not exists transcript_status text
  not null default 'pending'
  check (transcript_status in ('pending', 'running', 'done', 'failed', 'skipped'));
alter table recordings add column if not exists transcript_error text;
alter table recordings add column if not exists transcript_attempts int not null default 0;
alter table recordings add column if not exists transcribed_at timestamptz;
alter table recordings add column if not exists transcript_model text;

-- The only question ever asked of this: what is still waiting. Partial, so the
-- finished ones cost nothing to index.
create index if not exists recordings_transcript_pending_idx
  on recordings (uploaded_at)
  where transcript_status in ('pending', 'failed');
