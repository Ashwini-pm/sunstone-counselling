-- Make phone10 the identity of a lead, and email optional.
--
-- The table was written email-first, inherited from the faculty app where every
-- applicant signed in with Google. This audience does not sign in at all: they
-- open a link, and they arrive from NSAT and CSAT lists that are phone-first.
--
-- With email as the unique key, a bulk import had two silent failure modes.
-- A row with no email could not be inserted at all, and two rows sharing one
-- email merged into a single lead, because the upsert is ON CONFLICT (email).
-- Merging two real students into one record is the worse of the two, because
-- nothing about it looks like an error.
--
-- phone10 is already documented in 001 as "the canonical join key across the
-- NSAT and CSAT pipelines". This makes the schema agree with that.
--
-- Safe to run now: 3 leads exist, all have a phone, none collide.

alter table leads alter column email drop not null;

-- Belt and braces. The insert below would fail anyway, but a clear error beats
-- a constraint violation from three statements further down.
do $$
begin
  if exists (select 1 from leads where phone10 is null) then
    raise exception 'Some leads have no phone10; fill them before running 005';
  end if;
  if exists (
    select 1 from leads where phone10 is not null
    group by phone10 having count(*) > 1
  ) then
    raise exception 'Duplicate phone10 values exist; resolve them before running 005';
  end if;
end $$;

alter table leads alter column phone10 set not null;

-- Not a plain unique constraint on email: it stays unique when present, but
-- many leads will have none, and Postgres allows unlimited NULLs in a unique
-- index. Dropping and re-adding keeps that behaviour explicit.
alter table leads drop constraint if exists leads_email_key;
create unique index if not exists leads_email_uniq
  on leads (email) where email is not null;

create unique index if not exists leads_phone10_uniq on leads (phone10);

-- The old non-unique index is now redundant with the unique one above.
drop index if exists leads_phone10_idx;
