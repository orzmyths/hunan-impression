-- db/schema.sql — run once in the Neon SQL Editor (safe to re-run)

create table if not exists ai_usage (
  id           bigserial primary key,
  session_hash text        not null,
  created_at   timestamptz not null default now(),
  model        text        not null default 'gemini-3.5-flash-lite'
);
-- 已存在的数据库也要补上这个栏位 / upgrade an existing database
alter table ai_usage add column if not exists model text not null default 'gemini-3.5-flash-lite';
alter table ai_usage alter column model set default 'gemini-3.5-flash-lite';
create index if not exists ai_usage_session_time on ai_usage (session_hash, created_at);

create table if not exists records (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  session_hash  text        not null,
  input_type    text        not null check (input_type in ('photo', 'text')),
  input_summary text        not null default '',
  status        text        not null check (status in ('ok', 'error', 'limited')),
  ai_output     jsonb,
  final_numbers jsonb,
  is_sample     boolean     not null default false
);
create index if not exists records_created on records (created_at desc);

create table if not exists shifts (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  session_hash text        not null,
  shift_date   date        not null,
  shift        text        not null check (shift in ('午市', '晚市')),
  pool_cents   integer     not null,
  house_cents  integer     not null,
  net_cents    integer     not null,
  people       integer     not null,
  record_id    bigint
);
create index if not exists shifts_session on shifts (session_hash, created_at desc);
