-- ─────────────────────────────────────────────────────────────────────────────
-- Counselling questions for NSAT and CSAT leads. English. Five stations.
--
-- Each row is one thing the avatar says: a couple of short lines, then the
-- question. Rows sharing a position_group are variants, and each lead is asked
-- exactly one of them at random. sort_order controls the order of the groups.
--
-- No {Name} placeholder anywhere, so every video is rendered once and shared
-- across all leads.
--
-- Load:      node scripts/seed-questions.mjs
-- Generate:  python3 scripts/heygen_generate.py --dry-run
-- ─────────────────────────────────────────────────────────────────────────────

insert into questions (bank, position_group, sort_order, content, duration_sec) values

-- 1. Opening ─────────────────────────────────────────────────────── APPROVED ─
('behavioral', 'opening', 1,
 'Hi, congratulations on clearing the NSAT. Genuinely great. Quick word on us: Sunstone brings new-age learning to campuses across India, real industry training and placement support built into your degree. Anyway, enough about us. So tell me about yourself. How did your twelfth go? What did you score? And what are you thinking of doing next?',
 120);

-- 2. ──────────────────────────────────────────────────────────────── PENDING ─
-- 3. ──────────────────────────────────────────────────────────────── PENDING ─
-- 4. ──────────────────────────────────────────────────────────────── PENDING ─
-- 5. ──────────────────────────────────────────────────────────────── PENDING ─
