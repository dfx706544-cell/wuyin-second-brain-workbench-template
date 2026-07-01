// 第二大脑 v4 Template 版 - 云端自愈引擎
// 零硬编码私有信息 · 100% 环境变量读取 · 兼容公开仓库
// 用法：node cloud-self-heal.mjs <command> [args...]

import { appendFile, mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKBENCH_ROOT = path.dirname(SCRIPT_DIR);
const WORKSPACE_ROOT = path.dirname(WORKBENCH_ROOT);
const DATA_DIR = path.join(WORKBENCH_ROOT, "data");
const OUTPUTS_DIR = path.join(WORKSPACE_ROOT, "outputs");
const LOGS_DIR = path.join(WORKSPACE_ROOT, ".tmp", "self-heal");
const STATUS_FILE = path.join(DATA_DIR, "cloud-status.json");

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1500;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

// 错误分类规则
const ERROR_CATEGORIES = [
  {
    id: "network",
    label: "网络/接口抖动",
    pattern: /(ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|NetworkError|socket hang up)/i,
    retryable: true,
    backoff: "exponential"
  },
  {
    id: "rate_limit",
    label: "API 限流/配额",
    pattern: /(429|rate.?limit|quota|throttle|too many requests|insufficient.?quota)/i,
    retryable: true,
    backoff: "exponential",
    cooldownMs: 60 * 1000
  },
  {
    id: "auth",
    label: "鉴权失败",
    pattern: /(401|403|unauthorized|forbidden|invalid token|invalid.?api.?key|smtp.?auth)/i,
    retryable: false,
    backoff: "none"
  },
  {
    id: "config",
    label: "配置缺失或错误",
    pattern: /(missing required|not configured|undefined|reference.?error|cannot.?find.?module)/i,
    retryable: false,
    backoff: "none"
  },
  {
    id: "data_corrupt",
    label: "数据损坏/JSON 解析失败",
    pattern: /(SyntaxError|Unexpected token|JSON\.parse|EBUSY|ENOSPC)/i,
    retryable: true,
    backoff: "fixed"
  },
  {
    id: "github_api",
    label: "GitHub API 异常",
    pattern: /(github\.com|api\.github)/i,
    retryable: true,
    backoff: "exponential"
  },
  {
    id: "unknown",
    label: "未归类异常",
    pattern: /.*/,
    retryable: true,
    backoff: "fixed"
  }
];

function classifyError(message) {
  for (const cat of ERROR_CATEGORIES) {
    if (cat.pattern.test(message)) return cat;
  }
  return ERROR_CATEGORIES[ERROR_CATEGORIES.length - 1];
}

function nextDelay(attempt, category) {
  if (category.backoff === "none") return 0;
  if (category.backoff === "exponential") {
    const base = category.cooldownMs ?? DEFAULT_BASE_DELAY_MS;
    return base * Math.pow(2, attempt) + Math.random() * 500;
  }
  return DEFAULT_BASE_DELAY_MS;
}

function sleep(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await readFile(filePath, "utf8");
    const trimmed = raw.replace(/^\uFEFF/, "").trim();
    return trimmed ? JSON.parse(trimmed) : fallback;
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    return { __corrupt: true, error: error.message, raw: "" };
  }
}

async function writeJsonAtomic(filePath, value) {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, filePath);
}

export async function runWithSelfHeal({
  command,
  args = [],
  cwd = WORKSPACE_ROOT,
  env = process.env,
  label = command,
  maxRetries = DEFAULT_MAX_RETRIES,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  const { spawn } = await import("node:child_process");
  const startedAt = nowIso();
  const start = Date.now();
  const attempts = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptStart = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let exitCode = null;
    let errMessage = null;

    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd,
          env: { ...env, SELF_HEAL_ATTEMPT: String(attempt + 1) },
          stdio: ["ignore", "pipe", "pipe"]
        });

        const timer = setTimeout(() => {
          timedOut = true;
          try { child.kill("SIGKILL"); } catch {}
        }, timeoutMs);

        child.stdout.on("data", (b) => { stdout += b.toString("utf8"); });
        child.stderr.on("data", (b) => { stderr += b.toString("utf8"); });

        child.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve(code);
        });
      });

      exitCode = result;
    } catch (e) {
      errMessage = e?.message || String(e);
    }

    const combined = `${stdout}\n${stderr}\n${errMessage || ""}`;
    const category = classifyError(combined);
    const elapsedMs = Date.now() - attemptStart;
    attempts.push({
      attempt: attempt + 1,
      startedAt: new Date(attemptStart).toISOString(),
      elapsedMs,
      exitCode,
      timedOut,
      category: category.id,
      categoryLabel: category.label,
      retryable: category.retryable,
      errMessage: errMessage || (timedOut ? `timeout after ${timeoutMs}ms` : null),
      stderrTail: stderr.slice(-2000),
      stdoutTail: stdout.slice(-1000)
    });

    const success = exitCode === 0 && !timedOut;
    if (success) {
      return {
        ok: true,
        label,
        startedAt,
        finishedAt: nowIso(),
        totalMs: Date.now() - start,
        attempts: attempts.length,
        lastCategory: category.id,
        stdout,
        stderr
      };
    }

    if (!category.retryable) {
      break;
    }
    if (attempt >= maxRetries) {
      break;
    }

    const delay = nextDelay(attempt, category);
    await sleep(delay);
  }

  const last = attempts[attempts.length - 1];
  return {
    ok: false,
    label,
    startedAt,
    finishedAt: nowIso(),
    totalMs: Date.now() - start,
    attempts: attempts.length,
    lastCategory: last.category,
    lastCategoryLabel: last.categoryLabel,
    retryable: last.retryable,
    errMessage: last.errMessage,
    stderrTail: last.stderrTail
  };
}

function summarize(runs) {
  const total = runs.length;
  const ok = runs.filter((r) => r.ok).length;
  const fail = total - ok;
  const byCategory = {};
  for (const r of runs) {
    if (r.ok) continue;
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  }
  const last7days = runs.filter((r) => Date.now() - new Date(r.ts).getTime() < 7 * 86400 * 1000);
  const last7 = last7days.length;
  const last7Ok = last7days.filter((r) => r.ok).length;
  return {
    total,
    ok,
    fail,
    successRate: total ? Math.round((ok / total) * 1000) / 10 : null,
    last7,
    last7Ok,
    last7SuccessRate: last7 ? Math.round((last7Ok / last7) * 1000) / 10 : null,
    failureByCategory: byCategory
  };
}

export async function recordRunStatus(result) {
  const status = await readJsonSafe(STATUS_FILE, {});
  const runs = Array.isArray(status.runs) ? status.runs : [];
  runs.unshift({
    ts: result.finishedAt || nowIso(),
    label: result.label,
    ok: result.ok,
    attempts: result.attempts,
    category: result.lastCategory,
    categoryLabel: result.lastCategoryLabel,
    totalMs: result.totalMs,
    errMessage: result.errMessage || null
  });
  status.runs = runs.slice(0, 200);
  status.lastRunAt = runs[0].ts;
  status.lastRunOk = runs[0].ok;
  status.lastError = runs[0].ok ? null : {
    category: runs[0].category,
    categoryLabel: runs[0].categoryLabel,
    message: runs[0].errMessage
  };
  status.summary = summarize(runs);
  await ensureDir(DATA_DIR);
  await writeJsonAtomic(STATUS_FILE, status);
  return status;
}

export async function suggestSelfHeal() {
  const status = await readJsonSafe(STATUS_FILE, {});
  const recent = (status.runs || []).slice(0, 20);
  const failed = recent.filter((r) => !r.ok);
  const categoryCount = {};
  for (const r of failed) {
    categoryCount[r.category] = (categoryCount[r.category] || 0) + 1;
  }
  const suggestions = [];
  if (categoryCount.auth) {
    suggestions.push({
      severity: "high",
      action: "检查并刷新 GitHub Secrets 中的 API Key / SMTP 授权码 / Token",
      rationale: `最近 ${categoryCount.auth} 次失败命中"鉴权失败"分类`
    });
  }
  if (categoryCount.rate_limit) {
    suggestions.push({
      severity: "medium",
      action: "增加调度间隔或申请提高配额",
      rationale: `最近 ${categoryCount.rate_limit} 次失败命中"API 限流/配额"`
    });
  }
  if (categoryCount.config) {
    suggestions.push({
      severity: "high",
      action: "检查 workflow 环境变量和 settings 配置",
      rationale: `最近 ${categoryCount.config} 次失败命中"配置缺失或错误"`
    });
  }
  if (categoryCount.data_corrupt) {
    suggestions.push({
      severity: "high",
      action: "运行 data-integrity-check.mjs --fix 自动修复损坏文件",
      rationale: `最近 ${categoryCount.data_corrupt} 次失败命中"数据损坏"`
    });
  }
  if (categoryCount.network && categoryCount.network >= 3) {
    suggestions.push({
      severity: "low",
      action: "网络抖动，可继续观察；如持续失败，考虑增加 retries 和 timeout",
      rationale: `最近 ${categoryCount.network} 次失败命中"网络/接口抖动"`
    });
  }
  return { generatedAt: nowIso(), suggestions, recentFails: failed.slice(0, 5) };
}

export async function getStatus() {
  return await readJsonSafe(STATUS_FILE, {});
}

function nowIso() {
  return new Date().toISOString();
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "run": {
      const label = rest[0] || "manual";
      const cmdStr = rest[1];
      const cmdArgs = rest.slice(2);
      if (!cmdStr) {
        console.error("usage: cloud-self-heal.mjs run <label> <command> [args...]");
        process.exit(1);
      }
      runWithSelfHeal({ command: cmdStr, args: cmdArgs, label }).then(r => {
        recordRunStatus(r).then(() => console.log(JSON.stringify(r, null, 2)));
        process.exit(r.ok ? 0 : 1);
      });
      break;
    }
    case "suggest": {
      suggestSelfHeal().then(r => console.log(JSON.stringify(r, null, 2)));
      break;
    }
    case "status": {
      getStatus().then(r => console.log(JSON.stringify(r, null, 2)));
      break;
    }
    default: {
      console.error("usage: cloud-self-heal.mjs {run|suggest|status} ...");
      process.exit(1);
    }
  }
}