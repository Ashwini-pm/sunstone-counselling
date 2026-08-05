-- Passwordless lead access.
--
-- Leads are cold NSAT/CSAT contacts opening a link on a phone. Requiring a
-- Google sign-in was losing them at the door, so the link itself now carries
-- proof of identity: a long random token per question set.
--
-- ┌───────────────────────────────────────────────────────────────────────────┐
-- │ SECURITY: this token is the ONLY thing protecting a lead's answers.       │
-- │ There is no RLS and no password behind it. Consequences:                  │
-- │   * It must stay long and random. 32 bytes, base64url, ~256 bits.         │
-- │   * Never log it, never put it in an analytics URL, never expose it in    │
-- │     an admin listing that someone could screenshot.                      │
-- │   * Anyone holding the link can answer as that lead. That is the deal     │
-- │     the design makes, and it is the same deal as any emailed magic link.  │
-- │   * Revoke by rotating the token; the old link dies immediately.          │
-- └───────────────────────────────────────────────────────────────────────────┘

alter table question_sets
  add column if not exists access_token text;

-- Backfill existing rows with a random token.
update question_sets
   set access_token = replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_')
 where access_token is null;

-- New rows get one automatically, so a caller cannot forget to set it.
alter table question_sets
  alter column access_token
    set default replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_');

alter table question_sets
  alter column access_token set not null;

-- Lookup is by token on every lead page load, so it needs an index, and
-- uniqueness guards against a duplicate ever being generated.
create unique index if not exists question_sets_access_token_idx
  on question_sets (access_token);
