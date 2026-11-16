// api/records.js
//   GET    /api/records?page=1  公开记录列表，每页 20 笔 · public list, 20 per page
//   DELETE /api/records         删除本浏览器自己的使用记录 · delete ONLY this visitor's own records
import { db } from '../lib/db.js';
import { getVisitorId, hashVisitor } from '../lib/visitor.js';

const PAGE_SIZE = 20;

async function listRecords(req, res) {
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

async function deleteMyRecords(req, res) {
  const hash = hashVisitor(getVisitorId(req, res));
  try {
    const sql = db();
    // 1. 删除这个浏览器的 AI 使用记录（示例资料不可能属于任何访客）
    const deletedRecords = await sql`
      delete from records where session_hash = ${hash} and is_sample = false returning id`;
    // 2. 删除这个浏览器的班次存档（只含汇总数字）
    const deletedShifts = await sql`
      delete from shifts where session_hash = ${hash} returning id`;
    // 3. ai_usage 只删除 60 分钟以前的列。近期的列保留，否则删除就能绕过每小时 5 次的限制
    //    ai_usage: only rows older than the 60-minute window are removed, so deleting cannot reset the limit.
    await sql`
      delete from ai_usage where session_hash = ${hash} and created_at <= now() - interval '60 minutes'`;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      deleted: deletedRecords.length,
      shiftsDeleted: deletedShifts.length
    });
  } catch (e) {
    console.error('records: delete failed', e && e.message);
    return res.status(500).json({ message: '删除失败，请稍后再试。' });
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return listRecords(req, res);
  if (req.method === 'DELETE') return deleteMyRecords(req, res);
  res.setHeader('Allow', 'GET, DELETE');
  return res.status(405).json({ message: 'Method not allowed' });
}
