-- ─────────────────────────────────────────────────────────────────────────────
-- Counselling questions for NSAT and CSAT leads. English. Five questions plus
-- a spoken closing.
--
-- Copy is final and approved by the Sunstone team. Do not reword it here.
--
-- bank = 'behavioral'  the five questions. One row is drawn per position_group
--                      per lead, so a group with several rows gives different
--                      leads different phrasings in the same slot.
-- bank = 'closing'     not a question. Played on the done screen after submit,
--                      with no recording. Kept in its own bank so the shuffle
--                      in /api/attempt/begin never draws it.
--
-- Load:      node scripts/seed-questions.mjs
-- Generate:  python3 scripts/heygen_generate.py --dry-run
-- ─────────────────────────────────────────────────────────────────────────────

-- Idempotent: clear the previous copy of this seed, keeping any avatar videos
-- already generated for text that has not changed.
delete from questions
where bank in ('behavioral', 'closing')
  and id not in (select question_id from attempt_questions);

insert into questions (bank, position_group, sort_order, content, duration_sec) values

-- Q1 ─ About you ──────────────────────────────────────────────────────────────
('behavioral', 'about-you', 1,
 'Congratulations on clearing the NSAT! Let''s start easy, introduce yourself. Where are you from, and how did your 12th go?',
 120),

-- Q2 ─ Your goal ──────────────────────────────────────────────────────────────
('behavioral', 'goal', 2,
 'Why do you want to do B.Tech, and what do you want to become? Tell us where that interest came from.',
 120),

-- Q3 ─ Why Sunstone ───────────────────────────────────────────────────────────
('behavioral', 'why-sunstone', 3,
 'At Sunstone there are extra classes daily, coding, aptitude, communication, AI, from the first semester itself. Many students find it heavy. Why does Sunstone still feel right for you?',
 120),

-- Q4 ─ City and campus ────────────────────────────────────────────────────────
('behavioral', 'city-campus', 4,
 'Which city or campus are you thinking of, and why that one? And would you take a hostel or stay with family?',
 90),

-- Q5 ─ Fees ───────────────────────────────────────────────────────────────────
('behavioral', 'fees', 5,
 'How is your family planning for the fees? We have scholarships, zero-interest EMI and loan support. Tell us if you''d want help with any of these.',
 90),

-- Closing ─ spoken after submit, no answer recorded ──────────────────────────
('closing', 'closing', 99,
 'That''s it, well done! Here''s what happens next. Our team will review your responses and score them, just like a live counselling round. Within 1 to 2 days you''ll get a call from our team about your selection and offer letter details. One thing to keep in mind: once your offer comes, you''ll have a few days to book your seat before it expires, and seats at popular campuses fill fast. So talk it over with your family now, so you''re ready to decide when the call comes. See you on campus!',
 0);
