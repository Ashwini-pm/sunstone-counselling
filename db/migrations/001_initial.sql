-- Lead Response Center — initial schema (Neon / plain Postgres)
--
-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ THERE IS NO ROW LEVEL SECURITY HERE.                                      │
-- │                                                                           │
-- │ Neon is Postgres only — there is no auth.uid() or auth.email() to write   │
-- │ policies against. Every authorization decision therefore lives in         │
-- │ application code, in lib/db/*.                                            │
-- │                                                                           │
-- │ Consequence: a query that forgets its ownership check WILL return another │
-- │ lead's data. The database will not stop it. That is why all lead-facing   │
-- │ reads and writes go through the session-scoped helpers in lib/db/ and     │
-- │ never through ad-hoc SQL in a route.                                      │
-- └───────────────────────────────────────────────────────────────────────────┘

create extension if not exists pgcrypto;

-- ── users (the ops team; populated by Auth.js on sign-in) ───────────────────

create table if not exists users (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  name       text,
  image      text,
  role       text not null check (role in ('admin', 'lead')) default 'lead',
  created_at timestamptz not null default now(),
  last_seen  timestamptz
);

-- ── leads ────────────────────────────────────────────────────────────────────

create table if not exists leads (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null unique,
  -- last 10 digits: the canonical join key across the NSAT and CSAT pipelines
  phone10    text,
  source     text check (source in ('nsat1','nsat2','nsat3','nsat4','csat')),
  city       text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists leads_phone10_idx on leads (phone10);
create index if not exists leads_source_idx  on leads (source);
create index if not exists leads_email_idx   on leads (lower(email));

-- ── questions ────────────────────────────────────────────────────────────────
-- Ships EMPTY. Real behavioral questions are supplied by the Sunstone team.
-- Never seed invented questions here.
--
--   insert into questions (bank, position_group, sort_order, content, duration_sec)
--   values ('behavioral', 'motivation', 1, '<the Hinglish question text>', 90);
--
--   position_group  one question is drawn at random per group, per lead
--   sort_order      order the groups appear in the flow
--   avatar_url      written by scripts/heygen_generate.py, not by hand

create table if not exists questions (
  id             uuid primary key default gen_random_uuid(),
  bank           text not null default 'behavioral',
  position_group text not null,
  sort_order     int  not null default 0,
  content        text not null,
  avatar_url     text,
  duration_sec   int  not null default 90,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists questions_bank_group_idx
  on questions (bank, position_group) where active;

-- ── question_sets (one assignment per lead) ─────────────────────────────────

create table if not exists question_sets (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  bank       text not null default 'behavioral',
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

create index if not exists question_sets_lead_idx on question_sets (lead_id);

-- ── attempts ─────────────────────────────────────────────────────────────────

create table if not exists attempts (
  id                 uuid primary key default gen_random_uuid(),
  set_id             uuid not null references question_sets(id) on delete cascade,
  lead_id            uuid not null references leads(id),
  attempt_number     int  not null default 1,
  status             text not null check (status in ('in_progress','submitted')) default 'in_progress',
  started_at         timestamptz not null default now(),
  submitted_at       timestamptz,
  total_duration_sec int,
  unique (set_id, attempt_number)
);

create index if not exists attempts_lead_idx   on attempts (lead_id);
create index if not exists attempts_status_idx on attempts (status);

-- ── attempt_questions (the shuffled order, frozen per attempt) ──────────────

create table if not exists attempt_questions (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references attempts(id) on delete cascade,
  question_id uuid not null references questions(id),
  position    int  not null,
  unique (attempt_id, position),
  unique (attempt_id, question_id)
);

-- ── recordings (the answers) ─────────────────────────────────────────────────

create table if not exists recordings (
  id           uuid primary key default gen_random_uuid(),
  attempt_id   uuid not null references attempts(id) on delete cascade,
  question_id  uuid not null references questions(id),
  s3_url       text not null,
  duration_sec int,
  uploaded_at  timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index if not exists recordings_attempt_idx on recordings (attempt_id);
