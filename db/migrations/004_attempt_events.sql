-- Funnel instrumentation.
--
-- Answers "how many leads complete this, and where do the rest stop". The
-- existing tables already imply the coarse stages (a question_sets row means a
-- link was issued, an attempts row means it was opened, recordings mean answers
-- landed), but everything between opening the link and answering question one
-- was invisible: the intro screen, the camera permission prompt, the device
-- wizard. For a cold lead on a phone that is the stretch most likely to lose
-- them, so it is the stretch worth recording.
--
-- Abandonment is deliberately NOT an event. It is the absence of the next one,
-- derived as the last event on an attempt. Writing an explicit "abandoned" row
-- would need a job to decide when to give up on someone.

create table if not exists attempt_events (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references attempts(id) on delete cascade,

  -- Denormalised from attempts. Every funnel query segments by lead source, so
  -- this saves a join on the hottest read path.
  lead_id     uuid not null references leads(id),

  -- Constrained on purpose. A free-text event column becomes unqueryable
  -- garbage within a month, because nothing stops a typo becoming a category.
  -- Adding a stage means a migration, which is the point.
  event       text not null check (event in (
    -- server-side, reliable
    'link_opened',
    'attempt_submitted',
    -- client-side, best effort
    'intro_viewed',
    'intro_accepted',
    'camera_requested',
    'camera_granted',
    'camera_denied',
    'wizard_completed',
    'question_started',
    'question_heard',
    'recording_started',
    'recording_stopped',
    'upload_started',
    'upload_succeeded',
    'upload_failed',
    'closing_played'
  )),

  -- Set only on question-scoped events, so a funnel can report the exact
  -- question people quit on rather than just a count.
  question_id uuid references questions(id),
  position    int,

  -- Device, browser, error text, clip length. No PII: nothing here should
  -- identify a person beyond what leads already stores.
  meta        jsonb,

  at          timestamptz not null default now()
);

-- One lead's timeline, in order.
create index if not exists attempt_events_attempt_idx
  on attempt_events (attempt_id, at);

-- Funnel counts across a date range.
create index if not exists attempt_events_event_idx
  on attempt_events (event, at desc);

-- Segmenting the funnel by nsat1..4 / csat.
create index if not exists attempt_events_lead_idx
  on attempt_events (lead_id, at);
