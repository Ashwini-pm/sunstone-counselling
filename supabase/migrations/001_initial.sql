-- profiles (admins only — linked to auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'candidate')) default 'admin',
  name text,
  email text,
  created_at timestamptz default now()
);

-- auto-create profile on admin signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when new.email like '%@sunstone.in' then 'admin' else 'candidate' end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- candidates (invited by admin, no auth account until they sign up)
create table candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- tests (one per candidate invitation)
create table tests (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('marketing', 'java')),
  candidate_id uuid references candidates(id) on delete cascade,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '7 days')
);

-- attempts (candidate can retry; each retry = new row)
create table attempts (
  id uuid primary key default gen_random_uuid(),
  test_id uuid references tests(id) on delete cascade,
  candidate_id uuid references candidates(id),
  attempt_number int not null default 1,
  status text not null check (status in ('in_progress', 'submitted')) default 'in_progress',
  started_at timestamptz default now(),
  submitted_at timestamptz
);

-- questions bank
create table questions (
  id uuid primary key default gen_random_uuid(),
  station_id text not null,
  type text not null check (type in ('constant', 'situational')),
  role text not null check (role in ('marketing', 'java', 'both')),
  content text not null,
  image_url text,
  created_at timestamptz default now()
);

-- which question was shown in which attempt at which station
create table attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid references attempts(id) on delete cascade,
  station_id text not null,
  question_id uuid references questions(id)
);

-- recordings uploaded to Cloudflare R2
create table recordings (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid references attempts(id) on delete cascade,
  station_id text not null,
  r2_url text,
  duration_sec int,
  plan_notes text,
  uploaded_at timestamptz default now(),
  unique(attempt_id, station_id)
);

-- evaluator scores per rubric dimension
create table scores (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid references attempts(id) on delete cascade,
  station_id text not null,
  rubric_key text not null,
  human_score int check (human_score between 1 and 10),
  ai_score int check (ai_score between 1 and 10),
  evaluator_notes text,
  scored_by uuid references profiles(id),
  updated_at timestamptz default now()
);

-- RLS policies
alter table profiles enable row level security;
alter table candidates enable row level security;
alter table tests enable row level security;
alter table attempts enable row level security;
alter table questions enable row level security;
alter table attempt_questions enable row level security;
alter table recordings enable row level security;
alter table scores enable row level security;

-- admins can read/write everything
create policy "admins full access" on profiles for all using (auth.uid() = id);
create policy "admins manage candidates" on candidates for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "admins manage tests" on tests for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "admins manage attempts" on attempts for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "admins manage scores" on scores for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "anyone reads questions" on questions for select using (true);
create policy "admins manage questions" on questions for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "admins manage recordings" on recordings for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "admins manage attempt_questions" on attempt_questions for all using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
