-- reviewer_invites: one row per reviewer per attempt
create table reviewer_invites (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references attempts(id) on delete cascade,
  name        text not null,
  email       text not null,
  created_by  uuid references profiles(id),
  created_at  timestamptz default now()
);

alter table reviewer_invites enable row level security;

create policy "admins manage reviewer_invites" on reviewer_invites for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- reviewers access their invite by id (uuid = proof of access)
create policy "public read reviewer_invites" on reviewer_invites for select using (true);

-- add reviewer columns to scores
alter table scores
  add column reviewer_invite_id uuid references reviewer_invites(id) on delete cascade,
  add column verdict text check (verdict in ('yes', 'no', 'maybe'));

-- unique index for admin scores (reviewer_invite_id is null)
create unique index scores_admin_uniq
  on scores (attempt_id, station_id, rubric_key)
  where reviewer_invite_id is null;

-- unique index for reviewer verdicts: one per reviewer per station
create unique index scores_reviewer_uniq
  on scores (reviewer_invite_id, station_id)
  where reviewer_invite_id is not null;

-- allow reviewers to read/write scores linked to their invite
create policy "reviewer insert score" on scores for insert
  with check (
    reviewer_invite_id is not null and
    exists (select 1 from reviewer_invites where id = reviewer_invite_id)
  );

create policy "reviewer update score" on scores for update
  using (reviewer_invite_id is not null);

create policy "reviewer read scores" on scores for select
  using (reviewer_invite_id is not null);

-- allow reviewers to read recordings for their invite's attempt
create policy "reviewer read recordings" on recordings for select
  using (
    exists (select 1 from reviewer_invites ri where ri.attempt_id = recordings.attempt_id)
  );

-- allow reviewers to read attempts linked to an invite
create policy "reviewer read attempts" on attempts for select
  using (
    exists (select 1 from reviewer_invites ri where ri.attempt_id = attempts.id)
  );

-- allow reviewers to read candidate name/email
create policy "reviewer read candidates" on candidates for select
  using (
    exists (
      select 1 from attempts a
      join reviewer_invites ri on ri.attempt_id = a.id
      where a.candidate_id = candidates.id
    )
  );

-- allow reviewers to read tests (for role)
create policy "reviewer read tests" on tests for select
  using (
    exists (
      select 1 from attempts a
      join reviewer_invites ri on ri.attempt_id = a.id
      where a.test_id = tests.id
    )
  );
