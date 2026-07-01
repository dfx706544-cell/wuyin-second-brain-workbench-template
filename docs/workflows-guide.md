# GitHub Actions 工作流指南

这个模板仓库有 2 个自定义工作流，外加 1 个 GitHub 自动生成的 Pages 部署项。Actions 左侧现在按编号显示，方便快速判断用途。

## 工作流速查

| 显示名称 | 文件 | 作用 | 什么时候点 Run workflow |
| --- | --- | --- | --- |
| 01 Cloud Self-Heal - Data Check & Repair | `.github/workflows/cloud-self-heal.yml` | 检查 JSON 数据完整性，安全修复可自动处理的小问题，并在严重异常时开 Issue | 页面异常、数据损坏、想做健康巡检时 |
| 02 Cloud Status Dashboard - Build & Deploy | `.github/workflows/cloud-status-dashboard.yml` | 生成 `.pages-site/status/` 状态面板并部署到 GitHub Pages | 首次上线状态面板，或想立即刷新状态页时 |
| pages-build-deployment | GitHub 自动生成 | GitHub Pages 系统部署记录 | 不需要手动运行；这是 GitHub 自己显示的部署项 |

## 推荐使用顺序

1. 进入 `Settings -> Pages`，确认 Source 是 `GitHub Actions`。
2. 进入 `Actions -> 02 Cloud Status Dashboard - Build & Deploy -> Run workflow`，生成并部署状态面板。
3. 状态页地址通常是 `https://dfx706544-cell.github.io/wuyin-second-brain-workbench-template/status/`。
4. 如果状态页数据不对，先运行 `01 Cloud Self-Heal - Data Check & Repair`，再运行状态面板。

## 触发规则

`01 Cloud Self-Heal - Data Check & Repair` 会每天三次自动运行：

- 北京时间 08:30：早间健康巡检
- 北京时间 13:00：午间补检
- 北京时间 20:00：晚间归档巡检

`02 Cloud Status Dashboard - Build & Deploy` 会在以下情况运行：

- 手动点击 `Run workflow`
- 每 30 分钟定时刷新
- `automation-workbench/data/cloud-status.json`、状态面板脚本或本 workflow 文件变更时

## 安全边界

- 自愈工作流只处理仓库里的数据文件和报告文件。
- 它不会读取浏览器登录态、不会支付、不会发布社交内容。
- GitHub Pages 部署只发布 `.pages-site/` 里的静态网页。
- Secrets 不要写进 YAML；需要密钥时放到 `Settings -> Secrets and variables -> Actions`。

## 常见问题

如果 Actions 提示 YAML syntax error，优先检查：

- `permissions` 是否使用 `key: value`，例如 `id-token: write`
- 缩进是否使用空格
- `${{ ... }}` 表达式是否完整
- 文件是否被复制时硬换行切断了字段名

如果状态面板部署成功但页面是旧内容：

- 等 GitHub Pages 的 `pages-build-deployment` 完成
- 强制刷新浏览器
- 重新运行 `02 Cloud Status Dashboard - Build & Deploy`
