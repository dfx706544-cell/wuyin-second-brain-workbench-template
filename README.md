# 第二大脑 v4 - 云端自愈系统（公开 Template 版）

> 本文件包专门用于公开仓库 `dfx706544-cell/wuyin-second-brain-workbench-template`
> 零私有信息、零真实邮箱、零 Secrets 硬编码、零本地路径污染
>
> ✅ 任何人 fork 后都可以按照 README 自行配置 Secrets 使用

## Template 兼容清单

这个包给 template 增加以下 4 个核心能力，不破坏原有公开模板：

| 模块 | 用途 | 安全 |
|------|------|------|
| cloud-self-heal.mjs | 错误分类 + 指数退避重试 + 超时控制 | 纯本地逻辑，不读私钥 |
| cloud-status-dashboard.mjs | GitHub Pages 实时状态面板生成 | 生成纯静态 HTML |
| data-integrity-check.mjs | JSON 数据完整性自检 + 损坏隔离 | 只读工作区，不对外发数据 |
| cloud-system.test.mjs | 5 项单元测试验证 | 纯本地测试 |

## 目录结构

```
automation-workbench/cloud/
  ├─ README.md                    ← 本文件
  ├─ cloud-self-heal.mjs          ← 自愈引擎
  ├─ cloud-status-dashboard.mjs   ← 状态面板生成
  ├─ data-integrity-check.mjs     ← 数据自检
  └─ cloud-system.test.mjs        ← 单元测试

.github/workflows/
  ├─ cloud-self-heal.yml          ← 定时健康巡检
  └─ cloud-status-dashboard.yml   ← 状态面板 GitHub Pages 部署
```

## 公开仓库安全约定

1. **绝不提交真实邮箱** - 所有示例使用占位符 `<YOUR_EMAIL>`
2. **绝不提交真实 Secrets** - 所有敏感配置通过 GitHub Repository Secrets 注入
3. **绝不提交本地绝对路径** - 全部用相对路径，兼容 Windows/macOS/Linux
4. **绝不硬编码 API Key / Token** - 全部走环境变量读取
5. **绝不自动外发社交消息/内容** - 默认只生成草稿、写入文件、准备交付

## Template 用户分步指南

### 1. 拿到模板后开启 GitHub Pages

1. 进入你自己 fork 的仓库 → Settings → Pages
2. Source 下拉选 **GitHub Actions**
3. 保存

### 2. 配置 Repository Secrets

| 名称 | 说明 | 可选 |
|------|------|------|
| `SMTP_HOST` | SMTP 服务器地址（如 `smtp.163.com`） | 是 |
| `SMTP_PORT` | 端口（如 `465`） | 是 |
| `SMTP_USER` | 邮箱账号 | 是 |
| `SMTP_PASS` | SMTP 授权码 | 是 |
| `MAIL_FROM` | 发件人邮箱 | 是 |
| `MAIL_TO` | 收件人邮箱，逗号分隔多个 | 是 |
| `ANYSEARCH_API_KEY` | AnySearch API Key | 是 |
| `MICU_API_KEY` | 米促 API Key | 是 |

### 3. 配置 Repository Variables

| 名称 | 值 | 说明 |
|------|----|------|
| `SEND_EMAIL` | `false` | 默认不自动发邮件；配置好 SMTP 后改成 `true` |
| `SMTP_SECURE` | `true` | 465 端口建议开启 TLS |

### 4. 运行测试验证

```bash
cd automation-workbench/cloud
node cloud-system.test.mjs
```

全部 5 项测试通过就代表模板在新环境里跑通了。

### 5. 手动触发首次部署

- Actions → Cloud Status Dashboard → Run workflow
- 完成后状态面板地址：
  ```
  https://<your-name>.github.io/<repo-name>/status/
  ```

## 自愈错误分类（7 类，公开版本）

| 分类 | 是否重试 | 说明 |
|------|----------|------|
| `network` | ✅ | ECONN / ETIMEDOUT / 网络抖动 |
| `rate_limit` | ✅ | 429 / 限流 / 配额不足 |
| `data_corrupt` | ✅ | JSON 解析失败 / 数据损坏 |
| `github_api` | ✅ | GitHub API 异常 |
| `auth` | ❌ | 401 / 403 / 鉴权失败（不重试） |
| `config` | ❌ | 配置缺失（不重试） |
| `unknown` | ✅ | 兜底重试 |

## 运行命令参考

```bash
# 数据完整性检查（仅报告）
node automation-workbench/cloud/data-integrity-check.mjs

# 数据完整性检查（自动修复）
node automation-workbench/cloud/data-integrity-check.mjs --fix

# 生成状态面板
node automation-workbench/cloud/cloud-status-dashboard.mjs

# 查看自愈建议
node automation-workbench/cloud/cloud-self-heal.mjs suggest

# 查看运行状态
node automation-workbench/cloud/cloud-self-heal.mjs status
```

## 不包含在 Template 内的私有内容

以下内容 fork 模板后需要用户自己配置，不进入公开仓库：
- 用户真实邮箱地址
- 用户个人画像 personal-profile.json
- 用户自己的 API Key / Secrets
- 用户本地导出的 CSV / Excel 数据
- 用户特定的平台账户后台数据

## Template 兼容性

- Node.js 22+
- GitHub Actions Ubuntu latest runner
- Windows / macOS / Linux 三平台本地运行
- 零依赖第三方 npm 包