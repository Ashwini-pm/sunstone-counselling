-- Seed all questions from faculty-assessment-role-question-spec.md
-- Run after 007_schema_v2.sql

-- ── TECH FACULTY ──────────────────────────────────────────────────────────────

INSERT INTO questions (station_id, role, type, content, doubts) VALUES

-- Micro-teaching (5 topics, each with 3 doubts)
('micro-teaching', 'tech', 'bank',
 'Teach "A for loop (with a dry run)" to a first-year CS classroom. Walk through execution step by step.',
 '["How does the loop know when to stop?", "How is a while loop different from a for loop?", "What happens if the condition never becomes false?"]'::jsonb),

('micro-teaching', 'tech', 'bank',
 'Teach "What a function is and why we use it" to first-year CS students seeing functions for the first time.',
 '["Why not just write the code directly?", "What''s the difference between a parameter and an argument?", "Can a function call itself?"]'::jsonb),

('micro-teaching', 'tech', 'bank',
 'Teach "How an array is stored in memory" to first-year CS students.',
 '["Why does the index start at 0?", "Can one array hold different data types?", "What happens if I access an index that doesn''t exist?"]'::jsonb),

('micro-teaching', 'tech', 'bank',
 'Teach "A class vs an object (OOP)" to students encountering object-oriented programming for the first time.',
 '["Isn''t a class the same as an object?", "Why do we need objects at all?", "Can one class create many objects?"]'::jsonb),

('micro-teaching', 'tech', 'bank',
 'Teach "What a primary key is in a database" to students who have just been introduced to tables.',
 '["Can a table have two primary keys?", "How is a primary key different from a unique key?", "Can it be text instead of a number?"]'::jsonb),

-- Doubt resolution (6 misconceptions)
('doubt-resolution', 'tech', 'bank',
 'A student states: "A longer program is a better program." How do you address this in class?',
 NULL),

('doubt-resolution', 'tech', 'bank',
 'A student states: "If it runs once without an error, it''s correct." How do you address this in class?',
 NULL),

('doubt-resolution', 'tech', 'bank',
 'A student states: "Comparing two objects with == checks their contents." How do you address this in class?',
 NULL),

('doubt-resolution', 'tech', 'bank',
 'A student states: "An array grows in size automatically." How do you address this in class?',
 NULL),

('doubt-resolution', 'tech', 'bank',
 'A student states: "If it compiles, it''s bug-free." How do you address this in class?',
 NULL),

('doubt-resolution', 'tech', 'bank',
 'A student states: "Global variables are easier, so I should always use them." How do you address this in class?',
 NULL),

-- Lesson design (5 topics)
('lesson-design', 'tech', 'bank',
 'Design a lesson on "Introduction to loops" for students who have never written one before.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'tech', 'bank',
 'Design a lesson on "Arrays vs linked lists" for students who know what an array is but have never seen a linked list.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'tech', 'bank',
 'Design a lesson on "Functions and parameters" for first-year CS students.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'tech', 'bank',
 'Design a lesson on "Database tables and keys" for students with no prior database experience.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'tech', 'bank',
 'Design a lesson on "Object-oriented basics (class and object)" for first-year CS students.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL);


-- ── MANAGEMENT FACULTY ────────────────────────────────────────────────────────

INSERT INTO questions (station_id, role, type, content, doubts) VALUES

-- Micro-teaching
('micro-teaching', 'management', 'bank',
 'Teach "Price Elasticity of Demand" using a real example students can relate to.',
 '["If the price rises and people still buy, is demand inelastic?", "Why are some products affected by price and others not?", "Can you give an example from a brand we use every day?"]'::jsonb),

('micro-teaching', 'management', 'bank',
 'Teach "The 4 Ps of Marketing" to first-year MBA students seeing the framework for the first time.',
 '["Aren''t Place and Promotion the same?", "Which P matters most?", "Where does branding fit in?"]'::jsonb),

('micro-teaching', 'management', 'bank',
 'Teach "SWOT analysis" using a company the students actually know.',
 '["Is a weakness the same as a threat?", "Can something be both a strength and a weakness?", "How is SWOT actually useful for a real company?"]'::jsonb),

('micro-teaching', 'management', 'bank',
 'Teach "Maslow''s hierarchy of needs" to first-year MBA students.',
 '["Must you finish one level completely before moving to the next?", "Where does money fit in the hierarchy?", "Is this theory actually proven?"]'::jsonb),

('micro-teaching', 'management', 'bank',
 'Teach "The break-even point" to students who understand basic costs and revenue.',
 '["Is break-even the same as making a profit?", "What happens when you sell below break-even?", "Do fixed costs change in this calculation?"]'::jsonb),

-- Doubt resolution
('doubt-resolution', 'management', 'bank',
 'A student states: "Marketing is basically selling." How do you address this in class?',
 NULL),

('doubt-resolution', 'management', 'bank',
 'A student states: "Profit and revenue are the same thing." How do you address this in class?',
 NULL),

('doubt-resolution', 'management', 'bank',
 'A student states: "A brand is just a logo." How do you address this in class?',
 NULL),

('doubt-resolution', 'management', 'bank',
 'A student states: "Leadership and management are the same." How do you address this in class?',
 NULL),

('doubt-resolution', 'management', 'bank',
 'A student states: "More advertising always means more sales." How do you address this in class?',
 NULL),

('doubt-resolution', 'management', 'bank',
 'A student states: "Fixed costs change with output." How do you address this in class?',
 NULL),

-- Lesson design
('lesson-design', 'management', 'bank',
 'Design a lesson on "The Marketing Funnel" for students who have never heard the concept.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'management', 'bank',
 'Design a lesson on "STP — Segmentation, Targeting, Positioning" for first-year MBA students.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'management', 'bank',
 'Design a lesson on "The 4 Ps of Marketing" for students with no prior marketing knowledge.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'management', 'bank',
 'Design a lesson on "SWOT Analysis" for first-year MBA students.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'management', 'bank',
 'Design a lesson on "Reading a basic P&L statement" for students with no accounting background.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL);


-- ── COMPETITIVE CODING TRAINER ────────────────────────────────────────────────

INSERT INTO questions (station_id, role, type, content, doubts) VALUES

-- Micro-teaching
('micro-teaching', 'coding', 'bank',
 'Teach "Time complexity and Big-O notation" to students preparing for coding interviews who have never heard of it.',
 '["Why do we ignore constants in Big-O?", "Is O(n log n) always better than O(n²)?", "How do I find the complexity of nested loops?"]'::jsonb),

('micro-teaching', 'coding', 'bank',
 'Teach "Binary search" to students who know what linear search is but have never seen binary search.',
 '["Why must the array be sorted first?", "How is it faster than checking each element?", "What happens if the number isn''t in the array?"]'::jsonb),

('micro-teaching', 'coding', 'bank',
 'Teach "Recursion" using a simple example to students who are comfortable with loops.',
 '["How does the function remember where it was?", "What''s a base case and why do we need it?", "Isn''t recursion just slower than a loop?"]'::jsonb),

('micro-teaching', 'coding', 'bank',
 'Teach "Hash maps" to students preparing for coding interviews.',
 '["How does it find things so fast?", "What happens if two keys collide?", "When do I use a hash map instead of an array?"]'::jsonb),

('micro-teaching', 'coding', 'bank',
 'Teach "The two-pointer technique" using a problem students might see in an interview.',
 '["How do I know when to use two pointers?", "Does the array need to be sorted?", "How is it better than a nested loop?"]'::jsonb),

-- Doubt resolution
('doubt-resolution', 'coding', 'bank',
 'A student states: "A working solution is a good solution — efficiency doesn''t matter." How do you address this?',
 NULL),

('doubt-resolution', 'coding', 'bank',
 'A student states: "Nested loops always mean O(n²) time complexity." How do you address this?',
 NULL),

('doubt-resolution', 'coding', 'bank',
 'A student states: "Recursion and iteration can''t solve the same problem." How do you address this?',
 NULL),

('doubt-resolution', 'coding', 'bank',
 'A student states: "Binary search works on any array." How do you address this?',
 NULL),

('doubt-resolution', 'coding', 'bank',
 'A student states: "Using more memory always makes code faster." How do you address this?',
 NULL),

('doubt-resolution', 'coding', 'bank',
 'A student states: "If it passes the sample test case, it will pass all test cases." How do you address this?',
 NULL),

-- Lesson design
('lesson-design', 'coding', 'bank',
 'Design a lesson on "Approaching a coding problem (brute force → optimise)" for students who can code but have never done interview prep.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'coding', 'bank',
 'Design a lesson on "Time and space complexity" for students who write code but have never analysed it.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'coding', 'bank',
 'Design a lesson on "Arrays and the two-pointer pattern" for placement-track students.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'coding', 'bank',
 'Design a lesson on "Recursion fundamentals" for students comfortable with loops but new to recursion.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'coding', 'bank',
 'Design a lesson on "Hash maps for coding interviews" for placement-track students.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL);


-- ── APTITUDE TRAINER ──────────────────────────────────────────────────────────

INSERT INTO questions (station_id, role, type, content, doubts) VALUES

-- Micro-teaching
('micro-teaching', 'aptitude', 'bank',
 'Teach "Percentages — quick mental calculation methods" to students preparing for aptitude tests.',
 '["Is 25% always exactly 1/4?", "How do I calculate a percentage increase fast in my head?", "How do I find 10% of 200 mentally?"]'::jsonb),

('micro-teaching', 'aptitude', 'bank',
 'Teach "Time, Speed and Distance" to students who struggle with these problems in aptitude tests.',
 '["If I double my speed, does the time always halve?", "How do I handle a stop in the middle of a journey?", "What''s the trick for calculating average speed?"]'::jsonb),

('micro-teaching', 'aptitude', 'bank',
 'Teach "Ratio and Proportion" to students seeing it in an aptitude context for the first time.',
 '["How is a ratio different from a fraction?", "If the ratio is 2:3, how many total parts are there?", "How do I split an amount in a given ratio?"]'::jsonb),

('micro-teaching', 'aptitude', 'bank',
 'Teach "Probability basics" to students who have no prior exposure to it.',
 '["Can probability ever be more than 1?", "What does ''and'' vs ''or'' mean in probability?", "Is a coin toss always exactly 50-50?"]'::jsonb),

('micro-teaching', 'aptitude', 'bank',
 'Teach "Profit and Loss" to students preparing for aptitude and reasoning tests.',
 '["Is profit calculated on cost price or selling price?", "What''s the difference between markup and margin?", "How does a discount affect profit?"]'::jsonb),

-- Doubt resolution
('doubt-resolution', 'aptitude', 'bank',
 'A student states: "The average of averages is the overall average." How do you address this?',
 NULL),

('doubt-resolution', 'aptitude', 'bank',
 'A student states: "A 20% rise followed by a 20% fall gets you back to the start." How do you address this?',
 NULL),

('doubt-resolution', 'aptitude', 'bank',
 'A student states: "Permutations and combinations are the same thing." How do you address this?',
 NULL),

('doubt-resolution', 'aptitude', 'bank',
 'A student states: "Doubling your speed always halves your travel time." How do you address this?',
 NULL),

('doubt-resolution', 'aptitude', 'bank',
 'A student states: "Probability can be more than 1." How do you address this?',
 NULL),

('doubt-resolution', 'aptitude', 'bank',
 'A student states: "Percentage and percentage points are the same thing." How do you address this?',
 NULL),

-- Lesson design
('lesson-design', 'aptitude', 'bank',
 'Design a lesson on "Percentages from scratch" for students with weak maths foundations.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'aptitude', 'bank',
 'Design a lesson on "Time and Work problems" for students preparing for aptitude tests.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'aptitude', 'bank',
 'Design a lesson on "Data Interpretation — tables and graphs" for placement-track students.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'aptitude', 'bank',
 'Design a lesson on "Number systems basics" for students who struggle with divisibility and remainders.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'aptitude', 'bank',
 'Design a lesson on "Logical reasoning — seating arrangements" for aptitude test preparation.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL);


-- ── COMMS TRAINER ─────────────────────────────────────────────────────────────

INSERT INTO questions (station_id, role, type, content, doubts) VALUES

-- Micro-teaching
('micro-teaching', 'comms', 'bank',
 'Teach "How to open a presentation confidently" to students preparing for interviews and GDs.',
 '["What if I go completely blank at the start?", "Should I begin with ''Good morning'' every time?", "How long should the opening actually be?"]'::jsonb),

('micro-teaching', 'comms', 'bank',
 'Teach "How to structure a self-introduction for an interview" to students with little or no work experience.',
 '["Should I talk about my family or only my career?", "How long should a self-introduction be?", "What if I have no experience yet?"]'::jsonb),

('micro-teaching', 'comms', 'bank',
 'Teach "Subject-verb agreement" to students who make common grammar errors in spoken and written English.',
 '["Why is ''everyone'' treated as singular?", "Is it ''the team is'' or ''the team are''?", "Does grammar really matter if people understand what I''m saying?"]'::jsonb),

('micro-teaching', 'comms', 'bank',
 'Teach "The STAR method for answering interview questions" to placement-track students.',
 '["What if I can''t think of a real example from my life?", "Is STAR only useful for interviews?", "How much detail should I include in each part?"]'::jsonb),

('micro-teaching', 'comms', 'bank',
 'Teach "Active vs passive voice" to students who overuse passive in their writing and speaking.',
 '["Is passive voice always wrong?", "When should I actually use passive voice?", "How do I spot passive voice quickly?"]'::jsonb),

-- Doubt resolution
('doubt-resolution', 'comms', 'bank',
 'A student states: "Speaking fast means you''re fluent in English." How do you address this?',
 NULL),

('doubt-resolution', 'comms', 'bank',
 'A student states: "Good English means using big, complicated words." How do you address this?',
 NULL),

('doubt-resolution', 'comms', 'bank',
 'A student states: "Grammar doesn''t matter as long as people understand you." How do you address this?',
 NULL),

('doubt-resolution', 'comms', 'bank',
 'A student states: "A strong regional accent means your English is bad." How do you address this?',
 NULL),

('doubt-resolution', 'comms', 'bank',
 'A student states: "Communication is only about speaking — listening is a different skill." How do you address this?',
 NULL),

('doubt-resolution', 'comms', 'bank',
 'A student states: "Longer sentences sound more professional." How do you address this?',
 NULL),

-- Lesson design
('lesson-design', 'comms', 'bank',
 'Design a lesson on "Structuring a 2-minute self-introduction" for placement-track students.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'comms', 'bank',
 'Design a lesson on "Email writing basics" for students who have never written a professional email.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'comms', 'bank',
 'Design a lesson on "Group discussion do''s and don''ts" for students preparing for GD rounds.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'comms', 'bank',
 'Design a lesson on "Common grammar errors Indian speakers make" for Comms students.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL),

('lesson-design', 'comms', 'bank',
 'Design a lesson on "Telephone and video-call etiquette" for placement-track students.<br>Cover: how you would open · what examples you would use · what goes on the board · how you would check understanding.',
 NULL);


-- ── SHARED BANKS (all five roles) ─────────────────────────────────────────────

INSERT INTO questions (station_id, role, type, content, doubts) VALUES

-- Managing classroom challenges (shared, pick 1)
('classroom-challenge', 'shared', 'bank',
 'A student keeps interrupting you and says: "Have you actually done this in the real world, or is it all theory?" How do you handle this?',
 NULL),

('classroom-challenge', 'shared', 'bank',
 'A student challenges the relevance of the lesson out loud: "This is useless — when will I ever use this?" How do you respond?',
 NULL),

('classroom-challenge', 'shared', 'bank',
 'A student keeps chatting with a neighbour and disturbing the rest of the class. How do you handle this without embarrassing them?',
 NULL),

('classroom-challenge', 'shared', 'bank',
 'A student challenges you aggressively: "That''s wrong — I read something completely different online." How do you respond?',
 NULL),

('classroom-challenge', 'shared', 'bank',
 'A student is on their phone during class. When you ask them to put it away, they say: "I''m listening, just carry on." How do you handle this?',
 NULL),

-- Mentoring (shared, pick 1)
('mentoring', 'shared', 'bank',
 'A student says: "I''m thinking of dropping out — my family wants me to start earning and I feel guilty still studying." How do you respond?',
 NULL),

('mentoring', 'shared', 'bank',
 'A student says: "I keep failing and I want to give up. I don''t think I''m smart enough for this." How do you respond?',
 NULL),

('mentoring', 'shared', 'bank',
 'A student says: "My parents are forcing me into this course and I don''t want to be here." How do you respond?',
 NULL),

('mentoring', 'shared', 'bank',
 'A student says: "I''m completely overwhelmed — placement prep, backlogs, and family problems all at once." How do you respond?',
 NULL),

('mentoring', 'shared', 'bank',
 'A student says: "My friends copy assignments and score higher than me. I feel stupid for staying honest." How do you respond?',
 NULL),

-- Integrity check (shared, pick 1)
('integrity', 'shared', 'bank',
 'A student asks you to raise his internal assessment scores, mentioning that his family has strong industry connections. What do you do?',
 NULL),

('integrity', 'shared', 'bank',
 'A student offers to do you a personal favour in exchange for seeing the upcoming test questions in advance. What do you do?',
 NULL),

('integrity', 'shared', 'bank',
 'A colleague asks you to quietly pass a weak student through the course without meeting the requirements. What do you do?',
 NULL),

('integrity', 'shared', 'bank',
 'You discover that your top student has clearly copied their assignment. Reporting it could cost them their placement offer. What do you do?',
 NULL),

('integrity', 'shared', 'bank',
 'A parent offers you an expensive gift after their child''s grades improve significantly. What do you do?',
 NULL);
