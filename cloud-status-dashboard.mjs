// 第二大脑 v4 Template 版 - 云端状态面板生成器
// 零硬编码私有信息 · 公开仓库安全
// 用法：node cloud-status-dashboard.mjs

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKBENCH_ROOT = path.dirname(SCRIPT_DIR);
const WORKSPACE_ROOT = path.dirname(WORKBENCH_ROOT);
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, ".pages-site", "status");
const STATUS_FILE = path.join(WORKBENCH_ROOT, "data", "cloud-status.json");
const MAINTENANCE_DIR = path.join(WORKSPACE_ROOT, "outputs");

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, "").trim() || "null") || fallback;
  } catch {
    return fallback;
  }
}

async function readTextSafe(filePath) {
  try { return await readFile(filePath, "utf8"); } catch { return null; }
}

function statusBadge(status) {
  const map = {
    ok: ["#22c55e", "正常运行"],
    warn: ["#eab308", "警告"],
    error: ["#ef4444", "异常"],
    disabled: ["#6b7280", "已关闭"],
    not_configured: ["#9ca3af", "待配置"]
  };
  const [color, label] = map[status] || ["#9ca3af", "未知"];
  return { color, label };
}

export async function generateStatusDashboard() {
  const cloudStatus = await readJsonSafe(STATUS_FILE, {});
  const runs = cloudStatus.runs || [];
  const summary = cloudStatus.summary || {};
  const lastRun = runs[0] || null;

  const latestBrief = await readTextSafe(path.join(MAINTENANCE_DIR, "daily-brief-latest.md"));
  const latestFeedback = await readTextSafe(path.join(MAINTENANCE_DIR, "business-feedback-latest.md"));
  const latestMaintenance = await readTextSafe(path.join(MAINTENANCE_DIR, "maintenance-report-latest.md"));

  // 健康值
  const recent = runs.slice(0, 5);
  const recentOk = recent.filter(r => r.ok).length;
  const health = !lastRun ? "not_configured" :
    (!lastRun.ok && (runs.length === 0 || runs.every(r => !r.ok))) ? "error" :
    recentOk < 2 ? "warn" : "ok";
  const badge = statusBadge(health);

  const html = `<!doctype html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>无垠 · 云端状态</title>
  <style>
    :root { --bg: #0a0a0f; --surface: rgba(18,18,30,0.85); --border: rgba(255,255,255,0.06);
      --text: #e4e4ed; --text2: #8888a0; --accent: #6c5ce7; --accent2: #a29bfe;
      --green: #22c55e; --yellow: #eab308; --red: #ef4444; --radius: 12px; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.6; min-height: 100vh; }
    body::before { content:""; position:fixed; inset:0;
      background:radial-gradient(ellipse at 20% 50%, rgba(108,92,231,0.08) 0%, transparent 50%);
      pointer-events:none; z-index:0; }
    .container { max-width:1080px; margin:0 auto; padding:32px 24px; position:relative; z-index:1; }
    header { padding:24px 0 32px; text-align:center; }
    header h1 { font-size:28px; font-weight:700;
      background:linear-gradient(135deg,var(--accent),var(--accent2));
      -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
    header p { color:var(--text2); font-size:14px; margin-top:6px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px; margin-bottom:24px; }
    .card { background:var(--surface); backdrop-filter:blur(12px); border:1px solid var(--border);
      border-radius:var(--radius); padding:20px; }
    .card-title { font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--text2); margin-bottom:8px; }
    .card-value { font-size:32px; font-weight:700; }
    .card-desc { font-size:13px; color:var(--text2); margin-top:4px; }
    .badge { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600; padding:4px 14px;
      border-radius:100px; }
    .timeline { background:var(--surface); backdrop-filter:blur(12px); border:1px solid var(--border);
      border-radius:var(--radius); padding:20px; margin-bottom:24px; }
    .timeline h3 { font-size:14px; color:var(--text2); margin-bottom:16px; }
    .run-row { display:flex; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid var(--border); font-size:13px; }
    .run-row:last-child { border-bottom:none; }
    .run-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .run-dot.ok { background:var(--green); } .run-dot.fail { background:var(--red); }
    .run-label { flex:1; } .run-time { color:var(--text2); font-size:12px; }
    .run-detail { color:var(--text2); font-size:12px; max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .output-list { list-style:none; }
    .output-list li { padding:10px 0; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:12px; font-size:13px; }
    .output-list li:last-child { border-bottom:none; }
    .footer { text-align:center; color:var(--text2); font-size:12px; padding:32px 0; }
    @media (max-width:600px) { .grid { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>⚡ 无垠 云端状态</h1>
      <p>最后更新：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>
    </header>

    <div class="grid">
      <div class="card" style="border-left:3px solid ${badge.color}">
        <div class="card-title">每日任务</div>
        <div class="card-value">
          <span class="badge" style="background:${badge.color}22;color:${badge.color}">${badge.label}</span>
        </div>
        <div class="card-desc">${summary.total || 0} 次运行 · ${summary.ok || 0} 成功 · ${summary.fail || 0} 失败</div>
      </div>
      <div class="card">
        <div class="card-title">成功率</div>
        <div class="card-value">${summary.successRate ?? "—"}%</div>
        <div class="card-desc">最近 7 天：${summary.last7SuccessRate ?? "—"}%</div>
      </div>
      <div class="card">
        <div class="card-title">最后一次运行</div>
        <div class="card-value" style="font-size:18px">
          ${lastRun ? new Date(lastRun.ts).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "无记录"}
        </div>
        <div class="card-desc">${lastRun ? (lastRun.ok ? "✅ 成功" : "❌ 失败: " + (lastRun.errMessage || "").slice(0, 60)) : "等待首次任务启动"}</div>
      </div>
    </div>

    <div class="timeline">
      <h3>📋 最近运行记录</h3>
      ${runs.slice(0, 20).map(r => `
      <div class="run-row">
        <div class="run-dot ${r.ok ? 'ok' : 'fail'}"></div>
        <span class="run-label">${r.label}</span>
        <span class="run-time">${new Date(r.ts).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</span>
        <span class="run-detail">${r.ok ? `✓ 第${r.attempts || 1}次成功` : `✗ 第${r.attempts || 1}次`}</span>
      </div>`).join("")}
      ${runs.length === 0 ? '<div style="color:var(--text2);font-size:13px;text-align:center;padding:20px;">暂无运行记录。<br/>配置 Secrets 后运行 GitHub Actions 工作流即可显示。</div>' : ""}
    </div>

    <div class="timeline">
      <h3>📄 最新交付</h3>
      <ul class="output-list">
        <li>${latestBrief ? "✅" : "⏳"} 信息简报 ${latestBrief ? "已生成" : "待生成"}</li>
        <li>${latestFeedback ? "✅" : "⏳"} 业务反馈 ${latestFeedback ? "已生成" : "待生成"}</li>
        <li>${latestMaintenance ? "✅" : "⏳"} 运维报告 ${latestMaintenance ? "已生成" : "待生成"}</li>
      </ul>
    </div>

    <div class="footer">
      无垠第二大脑 · 云端自愈引擎 · <a href="https://github.com/dfx706544-cell/wuyin-second-brain-workbench-template" style="color:var(--accent2);text-decoration:none;">Template 源码</a>
    </div>
  </div>
</body>
</html>`;

  await ensureDir(OUTPUT_DIR);
  await writeFile(path.join(OUTPUT_DIR, "index.html"), html, "utf8");
  await writeFile(path.join(OUTPUT_DIR, "dashboard.json"), JSON.stringify({
    lastUpdate: new Date().toISOString(),
    health,
    summary,
    lastRun: lastRun ? { ts: lastRun.ts, ok: lastRun.ok } : null
  }, null, 2), "utf8");

  return { path: path.join(OUTPUT_DIR, "index.html") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await generateStatusDashboard();
  console.log("✅ 状态面板已生成:", result.path);
}