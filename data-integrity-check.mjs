// 第二大脑 v4 Template 版 - 数据完整性自检器
// 公开仓库安全版 · 无硬编码私有信息
// 用法：node data-integrity-check.mjs [--fix]

import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKBENCH_ROOT = path.dirname(SCRIPT_DIR);
const WORKSPACE_ROOT = path.dirname(WORKBENCH_ROOT);
const DATA_DIR = path.join(WORKBENCH_ROOT, "data");
const CONFIG_DIR = path.join(WORKBENCH_ROOT, "config");
const OUTPUTS_DIR = path.join(WORKSPACE_ROOT, "outputs");
const QUARANTINE_DIR = path.join(WORKSPACE_ROOT, ".tmp", "integrity-quarantine");
const REPORT_FILE = path.join(OUTPUTS_DIR, "data-integrity-report-latest.md");

const JSON_FILES = [
  path.join(DATA_DIR, "knowledge-items.json"),
  path.join(DATA_DIR, "task-history.json"),
  path.join(DATA_DIR, "daily-briefs.json"),
  path.join(DATA_DIR, "business-feedback.json"),
  path.join(DATA_DIR, "personal-profile.json"),
  path.join(DATA_DIR, "health-log.json"),
  path.join(DATA_DIR, "growth-library.json"),
  path.join(DATA_DIR, "cloud-status.json"),
  path.join(CONFIG_DIR, "watchlists.json"),
  path.join(CONFIG_DIR, "settings.json")
];

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function checkFile(filePath) {
  const report = { file: filePath, status: "ok", issues: [] };
  let raw;
  try { raw = await readFile(filePath, "utf8"); }
  catch (e) { report.status = "missing"; return report; }

  // BOM
  if (raw.charCodeAt(0) === 0xFEFF) report.issues.push({ type: "bom", fix: "remove_bom" });
  // 尾部换行
  if (!raw.endsWith("\n")) report.issues.push({ type: "no_trailing_newline", fix: "add_newline" });
  // 解析
  let parsed;
  try { parsed = JSON.parse(raw.replace(/^\uFEFF/, "").trim() || "null"); }
  catch (e) {
    report.status = "corrupt";
    report.issues.push({ type: "parse_error", message: e.message, fix: "quarantine" });
    return report;
  }
  if (parsed === null || typeof parsed !== "object") {
    report.status = "invalid_shape";
    report.issues.push({ type: "shape", fix: "reset_to_default" });
  }
  return report;
}

async function fixFile(report, doFix) {
  if (!doFix) return null;
  const { file, issues } = report;
  if (!issues.length) return null;
  let raw;
  try { raw = await readFile(file, "utf8"); } catch { return null; }
  let changed = false;
  for (const iss of issues) {
    if (iss.fix === "remove_bom" && raw.charCodeAt(0) === 0xFEFF) {
      raw = raw.slice(1); changed = true;
    }
    if (iss.fix === "add_newline" && !raw.endsWith("\n")) {
      raw += "\n"; changed = true;
    }
    if (iss.fix === "quarantine" && report.status === "corrupt") {
      await ensureDir(QUARANTINE_DIR);
      const fname = path.basename(file);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await rename(file, path.join(QUARANTINE_DIR, `${stamp}-${fname}`));
      const placeholder = Array.isArray([]) ? "[]" : "{}";
      await writeFile(file, `${placeholder}\n`, "utf8");
      return { quarantined: true, restored: placeholder };
    }
  }
  if (changed) {
    await writeFile(file, raw, "utf8");
    return { rewritten: true };
  }
  return null;
}

function summarize(reports) {
  const total = reports.length;
  const ok = reports.filter(r => r.status === "ok" && r.issues.length === 0).length;
  const issues = reports.filter(r => r.issues.length > 0 && r.status === "ok").length;
  const corrupt = reports.filter(r => r.status === "corrupt").length;
  const missing = reports.filter(r => r.status === "missing").length;
  return { total, ok, issues, corrupt, missing };
}

export async function runIntegrityCheck({ fix = false } = {}) {
  const reports = [];
  for (const f of JSON_FILES) {
    const r = await checkFile(f);
    const fixResult = await fixFile(r, fix);
    if (fixResult) r.fixApplied = fixResult;
    reports.push(r);
  }
  const summary = summarize(reports);
  const md = [
    `# 数据完整性自检报告`,
    ``,
    `生成时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} Asia/Shanghai`,
    `模式：${fix ? "自动修复" : "仅检查"}`,
    ``,
    `## 概览`,
    `| 指标 | 数量 |`,
    `| --- | --- |`,
    `| 检查文件 | ${summary.total} |`,
    `| 完全正常 | ${summary.ok} |`,
    `| 有小问题 | ${summary.issues} |`,
    `| 已损坏 | ${summary.corrupt} |`,
    `| 缺失 | ${summary.missing} |`,
    ``,
    `## 详情`,
    ``
  ];
  for (const r of reports) {
    md.push(`### ${path.basename(r.file)}`);
    md.push(`状态：${r.status}`);
    if (r.issues.length === 0) md.push(`✅ 无问题`);
    else for (const i of r.issues) md.push(`- ${i.type}: ${i.message || ""} → ${i.fix}`);
    if (r.fixApplied) md.push(`已应用修复：${JSON.stringify(r.fixApplied)}`);
    md.push(``);
  }
  await ensureDir(OUTPUTS_DIR);
  await writeFile(REPORT_FILE, md.join("\n"), "utf8");
  return { summary, reportPath: REPORT_FILE };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fix = process.argv.includes("--fix");
  runIntegrityCheck({ fix }).then(r => {
    console.log(JSON.stringify(r.summary, null, 2));
    process.exit(r.summary.corrupt > 0 ? 1 : 0);
  });
}