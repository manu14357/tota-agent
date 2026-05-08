<p align="center">
  <img alt="tota-agent" src="public/tota-agent-txt.png" width="340">
</p>

<p align="center">
  <strong>灵魂驱动的 AI 智能体 — 带权限保护工具、Token 预算与多渠道访问。</strong>
</p>

<p align="center">
  记住重要的事。行动前先询问。从 CLI 或 Telegram 全天候运行。<br>
  31 个内置工具 · 可扩展技能 · SQLite 驱动的第二大脑记忆。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tota-agent"><img src="https://img.shields.io/npm/v/tota-agent?color=blue" alt="npm"></a>
  <a href="https://github.com/manu14357/tota-agent/blob/main/LICENSE"><img src="https://img.shields.io/github/license/manu14357/tota-agent" alt="license"></a>
  <a href="https://github.com/manu14357/tota-agent"><img src="https://img.shields.io/github/stars/manu14357/tota-agent?style=social" alt="stars"></a>
</p>

<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

---

## 快速开始

```bash
npx tota-agent
```

或全局安装：

```bash
npm i -g tota-agent
tota
```

首次运行会启动配置向导 — 输入名字、API 密钥，以及可选的 Telegram Bot Token。约 30 秒完成配置。

随时重新配置：

```bash
tota doctor
```

---

## 为什么选择 tota？

每个 AI 智能体都能读取文件、执行命令。但大多数会悄无声息地执行。**tota 会先询问 — 并记住重要的事。**

| 特性 | 说明 |
|------|------|
| **权限保护** | Shell 黑名单、文件夹级权限范围、会话级审批模式。没有意外。 |
| **第二大脑** | 持久化 SQLite 记忆与 FTS5 全文搜索。10 种记忆类型。自动学习用户偏好。 |
| **灵魂驱动** | 通过你自己的 Markdown 文件定义个性（`~/.tota/soul/`）。无企业包装。 |
| **Token 感知** | 每日预算，超过 70% 自动简洁模式。`/budget` 命令查看、重置或临时覆盖。 |
| **实时流式输出** | CLI 实时 Token 流 + Markdown 重渲染。Telegram 流式可编辑消息。 |
| **全天候运行** | 守护进程模式，崩溃自动重启，支持系统服务（macOS、Linux、Windows）。 |
| **可扩展** | 一条命令安装社区技能，支持定时任务调度。 |

---

## 守护进程模式

一条命令让 tota 持续运行：

```bash
tota up
```

此命令会安装系统服务、启动后台守护进程，并确认运行状态。如果 tota 已在运行，只会显示 PID。

```bash
tota restart      # 重启后台进程
tota stop         # 停止后台进程
tota start -d     # 后台启动（不安装服务）
tota logs         # 查看守护日志
tota status       # 显示运行状态
```

### 系统服务（开机自启）

`tota up` 会自动安装。也可手动管理：

```bash
tota service install
tota service status
tota service uninstall
```

| 平台 | 方式 | 是否需要管理员 |
|------|------|--------------|
| **macOS** | LaunchAgent (`~/Library/LaunchAgents/`) | 否 |
| **Linux** | systemd 用户单元 (`~/.config/systemd/user/`) | 否 |
| **Windows** | 任务计划程序 (`schtasks`) | 否 |

---

## CLI 命令

| 命令 | 说明 |
|------|------|
| `tota up` | 安装服务 + 启动守护进程 + 确认运行 |
| `tota` | 启动智能体 |
| `tota start` | 前台启动 |
| `tota start -d` | 后台启动 |
| `tota restart` | 重启后台进程 |
| `tota stop` | 停止后台进程 |
| `tota logs` | 查看守护日志 |
| `tota doctor` | 重新配置（回车保留当前值） |
| `tota setup` | 重新运行配置向导 |
| `tota status` | 显示配置和守护状态 |
| `tota help` | 显示完整手册 |
| `tota upgrade` | 升级到最新版本 |
| `tota service install` | 安装系统服务 |
| `tota service uninstall` | 卸载系统服务 |
| `tota --verbose` | 启用调试日志 |

---

## 对话内命令

在对话中输入这些命令，不消耗 API Token。CLI 和 Telegram 均可使用。

| 命令 | 说明 |
|------|------|
| `/help` | 显示完整手册 |
| `/status` | 显示配置、预算和用量 |
| `/tools` | 列出已加载工具 |
| `/skills` | 列出已安装技能 |
| `/budget` | 显示 Token 预算状态 |
| `/budget override` | 本次请求临时覆盖预算 |
| `/budget reset` | 重置用量为零 |
| `/permissions` | 更改权限模式 |
| `/tasks` | 列出定时任务 |
| `/memory` | 查看和管理第二大脑 |
| `/unpair` | 重置所有 Telegram 访问 |

---

## 第二大脑

tota 在每次对话后自动提取、存储并回忆关于你的信息。

- **10 种记忆类型** — 身份、偏好、目标、项目、习惯、决策、约束、关系、事件、反思
- **自动提取** — 每次对话后提取 0–3 个事实，包含置信度、重要性、持久性评分
- **相关回忆** — 每次消息前注入最匹配的 5 条记忆（900 字符预算）
- **自动整合** — 每 60 分钟合成画像摘要、当前状态摘要，并从模式中生成反思
- **冲突解决** — 置信度高的记忆优先；同等置信度时保留较新的
- **自动清理** — 活跃记忆 21 天后过期；推断记忆衰减；低置信度持久记忆 120 天后清除
- **用户控制** — `/memory` 查看、搜索、暂停、恢复、清除
- **禁用** — 设置 `SECOND_BRAIN_ENABLED=false` 或配置 `memory.secondBrain.enabled: false`

所有数据本地存储于 `~/.tota/memory/second-brain/second-brain.db`。无云端。

---

## 配置

所有运行时数据存储在 `~/.tota/`。

| 路径 | 用途 |
|------|------|
| `~/.tota/tota.yaml` | 主配置（提供商、渠道、预算） |
| `~/.tota/.env` | API 密钥和 Token |
| `~/.tota/soul/*.md` | 智能体个性文件 |
| `~/.tota/permissions.yaml` | 能力和审批规则 |
| `~/.tota/skills/` | 已安装技能 |
| `~/.tota/schedules.yaml` | 定时任务 |
| `~/.tota/memory/` | 所有记忆数据 |
| `~/.tota/daemon.pid` | 后台进程 PID |
| `~/.tota/daemon.log` | 守护日志 |

---

## 贡献

欢迎贡献！请在提交前阅读相关规范。

- Fork 仓库：<https://github.com/manu14357/tota-agent>
- 运行 `npm install` 和 `npm run build`
- 使用 `tota` 本地测试
- 提交 PR，附上清晰的说明

---

## 许可证

MIT © [manu14357](https://github.com/manu14357)

---

> **免责声明：** 这是 AI 软件，使用风险自担。
