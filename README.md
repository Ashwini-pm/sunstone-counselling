# Lead Response Center

A Hinglish avatar asks NSAT and CSAT leads a set of behavioral questions; they
record a video answer to each. Answers are logged for the team to review.

The avatar is **pre-rendered, not live**. One video per question, generated once
with HeyGen, reused for every lead who draws that question. There is no live
model in the conversation.

Molded from the Sunstone faculty assessment app, which shares the question bank,
magic-link, recording and review plumbing.

---

## Status

**Local only.** No git remote, no Vercel project, no deployment. A new GitHub
repo, Vercel project and Supabase project get wired later.

**Analysis of answers is deliberately out of scope.** Answers are recorded and
stored; nothing scores them. `recordings` is the anchor for whatever gets added.

---

## Setup

```bash
cp .env.local.example .env.local   # then fill it in
npm install
npm run dev -- -p 5001             # http://localhost:5001
```

1. Create a Neon project and put its **pooled** connection string in
   `DATABASE_URL`.
2. Run `db/migrations/001_initial.sql` against it (`psql "$DATABASE_URL" -f
   db/migrations/001_initial.sql`, or paste it into the Neon SQL editor).
3. Create a Google OAuth client and add this exact authorised redirect URI:
   `http://localhost:5001/api/auth/callback/google`. Put the id and secret in
   `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
4. Generate `AUTH_SECRET` with `openssl rand -base64 32`.

Anyone signing in with an `@sunstone.in` address becomes an admin
automatically; everyone else is treated as a lead.

> Port 5000 is usually occupied by macOS AirPlay Receiver, which is why the
> default here is 5001. `AUTH_URL` and `NEXT_PUBLIC_APP_URL` must both match
> whichever port you use, and so must the Google redirect URI.

> The `node_modules/.bin` symlinks in this folder were flattened when it was
> copied. If `npx tsc` fails with `Cannot find module '../lib/tsc.js'`, call the
> binary directly: `node node_modules/typescript/bin/tsc --noEmit`.

---

## Loading questions

**The question bank ships empty on purpose.** Questions come from the Sunstone
team; nothing is invented here.

```sql
insert into questions (bank, position_group, sort_order, content, duration_sec)
values ('behavioral', 'motivation', 1, '<the Hinglish question text>', 90);
```

| Column | Meaning |
|---|---|
| `bank` | Which family of questions a lead can be assigned. Default `behavioral`. |
| `position_group` | One question is drawn at random **per group**, per lead. Put variants of the same question in one group. |
| `sort_order` | Order the groups appear in. |
| `content` | Exact text the avatar speaks, also shown on screen. |
| `duration_sec` | Max answer length. |
| `avatar_url` | Written by the generation script. Do not set by hand. |

Grouping is what makes two leads get different questions in the same slot. One
question per group degrades gracefully to a fixed list.

---

## Generating avatar videos

```bash
python3 scripts/heygen_generate.py --dry-run   # see what would be generated
python3 scripts/heygen_generate.py             # generate for real
```

Reads every active question with no `avatar_url`, renders the avatar speaking
it, uploads to `s3://$S3_BUCKET/avatars/{question_id}.mp4`, and writes the URL
back. Idempotent — re-run after adding questions and only the new ones render.

Questions without a video still work; the lead reads the text instead. The admin
dashboard warns when any are missing.

---

## Flow

**Lead** opens `/q/{setId}/{leadId}/1` → signs in with Google (must match the
invited email) → camera and mic check → per question: the avatar video plays,
then recording unlocks → answers upload to S3 as they finish → submit.

**Admin** works at `/admin`: create a lead and generate their link, watch the
table fill in, then `/admin/attempt/{id}` to play back each answer against the
question that was asked, and `/admin/lead/{id}` for a lead's history.

---

## Notable behaviour

- **The question order is frozen per attempt.** Drawn once into
  `attempt_questions`; reopening the link resumes rather than reshuffling.
- **Submit waits for uploads.** The attempt is only marked submitted after every
  in-flight upload settles. The faculty version did not do this and could lose
  the final answer if the tab closed.
- **No proctoring.** Tab switches and focus loss are not tracked. These are
  prospective students, not exam candidates.
- **There is no row level security.** Neon is Postgres only, so there is no
  `auth.uid()` to write policies against. Every authorization decision lives in
  application code. This is the most important thing to know before touching a
  query.

---

## Authorization, and why it needs care

The faculty version ran on Supabase, where RLS refused to hand a lead someone
else's rows even when a route forgot to check. That floor is gone. In its place:

- **`lib/db/leadAccess.ts`** is the only place lead-owned tables may be read or
  written. Every function takes the caller's email and scopes its SQL by it. A
  route must never query `attempts`, `attempt_questions` or `recordings`
  directly.
- **`lib/db/adminAccess.ts`** is unscoped by design and assumes the caller has
  already passed `currentAdmin()`.

A query that touches lead-owned data without joining back to
`leads.email = <session email>` is a data leak, and nothing below it will catch
that. Keep new queries inside those two modules.

---

## Stack

Next.js 16 (App Router) · React 19 · Neon Postgres · Auth.js v5 (Google) ·
AWS S3 · HeyGen
