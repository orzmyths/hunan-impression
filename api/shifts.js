// api/shifts.js
//   POST /api/shifts  保存一笔班次存档（可选关联 AI 记录）
//   GET  /api/shifts  列出本浏览器最近 50 笔存档
// Save a finished shift (optionally linked to an AI record) or list this visitor's shifts.
import { db } from '../lib/db.js';
import { getVisitorId, hashVisitor } from '../lib/visitor.js';

const SHIFTS = ['午市', '晚市'];

export default async function handler(req, res) {
  const hash = hashVisitor(getVisitorId(req, res));
  let sql;
  try {
    sql = db();
  } catch (e) {
    return res.status(500).json({ message: '服务器未设定数据库。' });
  }

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        select id, created_at, shift_date, shift, pool_cents, house_cents, net_cents, people, record_id
        from shifts where session_hash = ${hash}
        order by created_at desc limit 50`;
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ rows });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      const date = String(b.date || '');
      const shift = String(b.shift || '');
      const nums = [b.poolCents, b.houseCents, b.netCents, b.people].map((v) => Number(v));
      const badNum = nums.some((n) => !Number.isInteger(n) || n < 0);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !SHIFTS.includes(shift) || badNum) {
        return res.status(400).json({ message: '存档资料格式不正确。' });
      }
      const recordId = Number.isInteger(Number(b.recordId)) && Number(b.recordId) > 0 ? Number(b.recordId) : null;

      const [row] = await sql`
        insert into shifts (session_hash, shift_date, shift, pool_cents, house_cents, net_cents, people, record_id)
        values (${hash}, ${date}, ${shift}, ${nums[0]}, ${nums[1]}, ${nums[2]}, ${nums[3]}, ${recordId})
        returning id`;

      if (recordId) {
        // 只更新同一位访客自己的记录 / only the visitor's own AI record
        await sql`
          update records set final_numbers = ${JSON.stringify({
            date, shift, pool_cents: nums[0], house_cents: nums[1], net_cents: nums[2], people: nums[3]
          })}::jsonb
          where id = ${recordId} and session_hash = ${hash}`;
      }
      return res.status(201).json({ id: row.id });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ message: 'Method not allowed' });
  } catch (e) {
    console.error('shifts: failed', e && e.message);
    return res.status(500).json({ message: '存档失败，请稍后再试。' });
  }
}
