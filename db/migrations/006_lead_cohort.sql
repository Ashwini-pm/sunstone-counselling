-- Cohort as a first-class dimension on a lead.
--
-- The backlog arrives as three behavioural groups: passed but never booked a
-- slot, booked and did not appear, counselled but no seat. That is the split
-- the campaign is organised around and the split the reporting has to answer,
-- and none of it fits `source`, which is constrained to nsat1..4 / csat.
--
-- Deliberately free text rather than a CHECK constraint. `source` is a closed
-- set that changes once a year; cohorts are defined per campaign and a new one
-- should not require a migration.
--
-- external_lead_id keeps the id from the exports, so a lead here can be traced
-- back to the row it came from without matching on a phone number.

alter table leads add column if not exists cohort text;
alter table leads add column if not exists external_lead_id text;

create index if not exists leads_cohort_idx on leads (cohort);
create index if not exists leads_external_idx on leads (external_lead_id);
