-- db/seed.sql — exactly 10 fictional sample records (示例/虚构).
-- Runs only when no sample rows exist yet, so re-running is safe.

insert into records (created_at, session_hash, input_type, input_summary, status, ai_output, final_numbers, is_sample)
select v.created_at, 'sample0000', v.input_type, v.input_summary, 'ok', v.ai_output::jsonb, v.final_numbers::jsonb, true
from (values
  ('2026-10-02 22:10:00+00'::timestamptz, 'photo', '示例（虚构）报表 sample-01.jpg (210000 bytes)',
   '{"date":"2026-10-01","shift":"晚市","net_sales":9120.40,"service_charge":1368.06,"unreadable_fields":[]}',
   '{"date":"2026-10-01","shift":"晚市","pool_cents":136806,"house_cents":0,"net_cents":136806,"people":5}'),
  ('2026-10-05 03:15:00+00'::timestamptz, 'text', '示例（虚构）文字：净销售额 7,850.00 服务费 1,177.50',
   '{"date":"2026-10-04","shift":"午市","net_sales":7850.00,"service_charge":1177.50,"unreadable_fields":[]}',
   '{"date":"2026-10-04","shift":"午市","pool_cents":117750,"house_cents":5000,"net_cents":112750,"people":4}'),
  ('2026-10-09 23:40:00+00'::timestamptz, 'photo', '示例（虚构）报表 sample-02.jpg (388500 bytes)',
   '{"date":"2026-10-08","shift":"晚市","net_sales":11430.75,"service_charge":1714.61,"unreadable_fields":["shift"]}',
   '{"date":"2026-10-08","shift":"晚市","pool_cents":171461,"house_cents":0,"net_cents":171461,"people":6}'),
  ('2026-10-14 02:05:00+00'::timestamptz, 'text', '示例（虚构）文字：服务费 900.00 净销售额 6,000.00',
   '{"date":"2026-10-13","shift":"午市","net_sales":6000.00,"service_charge":900.00,"unreadable_fields":[]}',
   '{"date":"2026-10-13","shift":"午市","pool_cents":90000,"house_cents":0,"net_cents":90000,"people":3}'),
  ('2026-10-20 22:55:00+00'::timestamptz, 'photo', '示例（虚构）报表 sample-03.png (162000 bytes)',
   '{"date":null,"shift":"晚市","net_sales":8735.20,"service_charge":null,"unreadable_fields":["date","service_charge"]}',
   '{"date":"2026-10-19","shift":"晚市","pool_cents":131028,"house_cents":13103,"net_cents":117925,"people":5}'),
  ('2026-10-25 01:30:00+00'::timestamptz, 'text', '示例（虚构）文字：班次 晚市 服务费 1,542.30',
   '{"date":"2026-10-24","shift":"晚市","net_sales":null,"service_charge":1542.30,"unreadable_fields":["net_sales"]}',
   '{"date":"2026-10-24","shift":"晚市","pool_cents":154230,"house_cents":0,"net_cents":154230,"people":6}'),
  ('2026-10-31 23:20:00+00'::timestamptz, 'photo', '示例（虚构）报表 sample-04.jpg (276400 bytes)',
   '{"date":"2026-10-30","shift":"晚市","net_sales":10250.00,"service_charge":1537.50,"unreadable_fields":[]}',
   '{"date":"2026-10-30","shift":"晚市","pool_cents":153750,"house_cents":0,"net_cents":153750,"people":5}'),
  ('2026-11-03 04:45:00+00'::timestamptz, 'text', '示例（虚构）文字：净销售额 5,400.00 服务费 810.00',
   '{"date":"2026-11-02","shift":"午市","net_sales":5400.00,"service_charge":810.00,"unreadable_fields":[]}',
   '{"date":"2026-11-02","shift":"午市","pool_cents":81000,"house_cents":0,"net_cents":81000,"people":3}'),
  ('2026-11-07 22:02:00+00'::timestamptz, 'photo', '示例（虚构）报表 sample-05.jpg (198700 bytes)',
   '{"date":"2026-11-06","shift":"晚市","net_sales":9988.00,"service_charge":1498.20,"unreadable_fields":[]}',
   '{"date":"2026-11-06","shift":"晚市","pool_cents":149820,"house_cents":7491,"net_cents":142329,"people":5}'),
  ('2026-11-12 00:40:00+00'::timestamptz, 'text', '示例（虚构）文字：服务费 1,260.00 净销售额 8,000.00',
   '{"date":"2026-11-11","shift":"晚市","net_sales":8000.00,"service_charge":1260.00,"unreadable_fields":[]}',
   '{"date":"2026-11-11","shift":"晚市","pool_cents":126000,"house_cents":0,"net_cents":126000,"people":4}')
) as v(created_at, input_type, input_summary, ai_output, final_numbers)
where not exists (select 1 from records where is_sample);
