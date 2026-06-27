alter table attempts
  add column violation_count int not null default 0,
  add column is_flagged boolean not null default false;
