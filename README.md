# 韶山印象 Hunan Impression · 服务费分配

Simplified Chinese web app that splits each shift's service charge among the staff who worked it.
Built for a Vercel Hobby deployment with a Gemini free-tier key and a free Neon Postgres database.

## Features
- 简单模式四步：今天的营业、今天上班的人、每人实拿、存档。进阶设置可切换模式 A（直接占比）与模式 B（角色占比后按工时）。
- 员工卡保存在每位访客自己的浏览器（localStorage）。示例员工以「示例」开头，可一键删除。
- 错误扣款可选择「送回池」或「店家留下」，每笔扣款单独设定。
- AI 读取：上传收银报表照片或粘贴文字，AI 只产生草稿，必须核对后才能计算。
- 记录页 `/records.html`：每一次 AI 使用都保存，并标示示例（虚构）资料。

## Calculation rules
- 金额以整数分计算，使用最大余数法分配，合计与服务费池分毫不差。
- 服务费池就是输入的服务费总额，不做任何比例检查。净销售额只作记录。
- 送回池的金额按有效毛额比例分给仍有毛额且自己没有送回池扣款的上班者。
- 店家留下的金额不发给任何人。
- 实拿 + 店家留下 = 服务费池，否则禁止存档。
- 额外小费是独立小池，按毛额比例分配，不与服务费混合。

## AI limit rule
- 每位访客（以浏览器 cookie 区分）在滚动 60 分钟内最多 5 次 AI 读取。
- 第 6 次不呼叫模型，回传：`You have reached the limit for this hour, try again later`。
- 失败的请求也计入次数。手动输入与计算不计次数。

## Environment variables
| 名称 | 用途 |
|---|---|
| `GEMINI_API_KEY` | Gemini API key，只存在 Vercel，不放进代码 |
| `GEMINI_MODEL` | 例如 `gemini-2.5-flash`（以 AI Studio 显示为准） |
| `DATABASE_URL` | Neon pooled connection string |

## Database setup
1. 在 Neon SQL Editor 执行 `db/schema.sql`。
2. 再执行 `db/seed.sql`（只会插入一次 10 笔示例（虚构）记录）。

## Test
- 引擎测试：`npm test`（运行 `tests/test-engine.cjs`）。
- 语法检查：`npm run check`。
- 手动测试：上传一张新报表照片 → 核对草稿 → 计算 → 存档 → 在记录页看到新记录；连续第 6 次请求确认限制文字。
- AI 故障测试：把 `GEMINI_API_KEY` 改成错误值，确认显示「AI 暂时无法读取，请手动输入数字。」且手动存档仍可用。
