// api/records.js — GET /api/records?page=1 （公开，不需登录，每页 20 笔）
// Public list of every AI use, newest first, 20 per page.
import { db } from '../lib/db.js';

const PAGE_SIZE = 20;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Method not allowed' });
  }
  const page = Math.max(1, parseInt(String((req.query && req.query.page) || '1'), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  try {
    const sql = db();
    const [{ total }] = await sql`select count(*)::int as total from records`;
    const rows = await sql`
      select id, created_at, input_type, input_summary, status, ai_output, final_numbers, is_sample,
             left(session_hash, 8) as visitor
      from records
      order by created_at desc, id desc
      limit ${PAGE_SIZE} offset ${offset}`;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      page,
      pageSize: PAGE_SIZE,
      total,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      rows
    });
  } catch (e) {
    console.error('records: query failed', e && e.message);
    return res.status(500).json({ message: '无法读取记录，请稍后再试。' });
  }
}
