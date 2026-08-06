-- Email is contact detail, not identity.
--
-- 005 made phone10 the key but kept a unique index on email, which was a
-- half-migration: identity moved, the old constraint did not. The real import
-- hit it immediately. Two different students share vk9934820528@gmail.com,
-- and that is ordinary. Siblings apply together, one parent's address is used
-- for both, a counsellor types their own address into a blank field.
--
-- Keeping the constraint means a lead with a duplicate email cannot be created
-- at all, so a real student silently never receives a link. That is a far worse
-- outcome than two rows sharing an address.
--
-- A plain index stays, because lookups by email still happen.

drop index if exists leads_email_uniq;
create index if not exists leads_email_lookup on leads (email) where email is not null;
