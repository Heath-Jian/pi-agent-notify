# pi-agent-notify

[![npm version](https://img.shields.io/npm/v/pi-agent-notify.svg)](https://www.npmjs.com/package/pi-agent-notify)
[![license](https://img.shields.io/npm/l/pi-agent-notify.svg)](./LICENSE)
[![repository](https://img.shields.io/badge/github-Heath--Jian%2Fpi--agent--notify-black)](https://github.com/Heath-Jian/pi-agent-notify)

Pi extension that sends host terminal or desktop notifications when an agent run finishes or fails.

English | [简体中文](#简体中文)

## Features

- Sends one notification on `agent_end`
- Shows `Pi done` for successful runs
- Shows `Pi failed` when the final assistant message has `errorMessage` or a non-success `stopReason`
- Includes project name, duration, and model when available
- Prefers host terminal-owned notifications, then falls back to platform native notification when available
- Maps Zap, WezTerm, Ghostty, Kitty, iTerm2, Terminal.app, and compatible terminals to their best notification protocol
- Supports OSC 777, OSC 99, OSC 9, Linux `notify-send`, Windows PowerShell Toast, and bell fallback

## Install

Install from npm:

```bash
pi install npm:pi-agent-notify
```

Install a specific version:

```bash
pi install npm:pi-agent-notify@0.6.3
```

After installing, restart Pi or run:

```text
/reload
```

For local development:

```bash
git clone git@github.com:Heath-Jian/pi-agent-notify.git
cd pi-agent-notify
pi install .
```

## Usage

The extension runs automatically. When a Pi agent run ends, it sends a success or failure notification.

The only command exposed by the extension is:

```text
/notify-doctor
```

Use it to inspect the detected host terminal and notification backend.

## Notification Routing

The default `auto` mode tries notification backends in this order:

```text
terminal protocol -> native/system when available -> bell
```

Protocol mapping:

| Terminal | Protocol |
| --- | --- |
| Zap | `OSC 777` |
| WezTerm | `OSC 777` |
| Ghostty | `OSC 777` |
| rxvt/urxvt/Terminology-compatible terminals | `OSC 777` |
| Kitty | `OSC 99` |
| iTerm2 | `OSC 9` |
| Terminal.app | `OSC 9` |
| Unknown terminal | Linux/Windows native fallback, otherwise bell |

In Zap, this uses Zap's OSC notification support, so the notification can be owned by Zap. If Zap is frontmost, Zap may show an in-window toast instead of a macOS banner even when macOS notification permission is enabled. When Zap is in the background, Zap decides whether its terminal-owned notification is promoted to a system banner.

## Configuration

Environment variables:

| Name | Default | Description |
| --- | --- | --- |
| `PI_AGENT_NOTIFY_DISABLE` | `0` | Set to `1` to disable notifications. |
| `PI_AGENT_NOTIFY_METHOD` | `auto` | One of `auto`, `system`, `native`, `terminal`, `notify-send`, `powershell`, `osc777`, `osc99`, `osc9`, `bell`. |
| `PI_AGENT_NOTIFY_FORCE_METHOD` | unset | Legacy alias for `PI_AGENT_NOTIFY_METHOD`. |
| `PI_AGENT_NOTIFY_TERMINAL_PROTOCOL` | `auto` | One of `auto`, `osc777`, `osc99`, `osc9`, `all`, or aliases such as `zap`, `wezterm`, `ghostty`, `kitty`, `iterm2`, `terminal`. |
| `PI_AGENT_NOTIFY_TOOL_ERRORS` | `0` | Set to `1` to mark any tool execution error as a failed run. |

By default, tool errors do not mark the whole run as failed. Pi agents can often recover from a failed shell command or file operation and still finish successfully. Set `PI_AGENT_NOTIFY_TOOL_ERRORS=1` if you prefer stricter behavior.

## License

MIT

---

## 简体中文

`pi-agent-notify` 是一个 Pi 扩展：当 Pi agent 执行完成或失败时，向宿主终端或系统桌面发送通知。

## 功能特性

- 在 `agent_end` 时发送一条通知
- 成功时显示 `Pi done`
- 失败时显示 `Pi failed`
- 通知内容包含项目名、耗时、模型信息
- 优先使用宿主终端自己的通知协议，再 fallback 到平台原生通知能力
- 自动匹配 Zap、WezTerm、Ghostty、Kitty、iTerm2、Terminal.app 等终端的最佳通知协议
- 支持 OSC 777、OSC 99、OSC 9、Linux `notify-send`、Windows PowerShell Toast 和 bell fallback

## 安装

从 npm 安装：

```bash
pi install npm:pi-agent-notify
```

安装指定版本：

```bash
pi install npm:pi-agent-notify@0.6.3
```

安装后重启 Pi，或者在 Pi 内执行：

```text
/reload
```

本地开发安装：

```bash
git clone git@github.com:Heath-Jian/pi-agent-notify.git
cd pi-agent-notify
pi install .
```

## 使用方式

扩展会自动运行。每次 Pi agent 执行结束后，它会根据成功或失败状态发送通知。

扩展只暴露一个诊断命令：

```text
/notify-doctor
```

它可以查看当前识别到的宿主终端和通知后端等信息。

## 通知路由

默认 `auto` 模式按下面顺序尝试：

```text
terminal protocol -> native/system when available -> bell
```

协议映射：

| 终端 | 协议 |
| --- | --- |
| Zap | `OSC 777` |
| WezTerm | `OSC 777` |
| Ghostty | `OSC 777` |
| rxvt/urxvt/Terminology 兼容终端 | `OSC 777` |
| Kitty | `OSC 99` |
| iTerm2 | `OSC 9` |
| Terminal.app | `OSC 9` |
| 未识别终端 | Linux/Windows 原生 fallback，否则 bell |

在 Zap 中，这会使用 Zap 的 OSC 通知能力，因此通知可以归属于 Zap。如果 Zap 当前在前台，Zap 可能显示窗口内 toast，而不是 macOS 系统横幅；当 Zap 在后台时，是否提升为系统横幅由 Zap 自己决定。

## 配置

环境变量：

| 名称 | 默认值 | 说明 |
| --- | --- | --- |
| `PI_AGENT_NOTIFY_DISABLE` | `0` | 设置为 `1` 可关闭通知。 |
| `PI_AGENT_NOTIFY_METHOD` | `auto` | 可选：`auto`、`system`、`native`、`terminal`、`notify-send`、`powershell`、`osc777`、`osc99`、`osc9`、`bell`。 |
| `PI_AGENT_NOTIFY_FORCE_METHOD` | unset | `PI_AGENT_NOTIFY_METHOD` 的旧别名。 |
| `PI_AGENT_NOTIFY_TERMINAL_PROTOCOL` | `auto` | 可选：`auto`、`osc777`、`osc99`、`osc9`、`all`，或 `zap`、`wezterm`、`ghostty`、`kitty`、`iterm2`、`terminal` 等别名。 |
| `PI_AGENT_NOTIFY_TOOL_ERRORS` | `0` | 设置为 `1` 后，任意工具执行错误都会被视为失败。 |

默认情况下，工具错误不会直接把整轮 agent 运行标记为失败，因为 agent 经常可以从一次 shell 或文件操作失败中恢复，并最终成功完成任务。如果你希望更严格，可以设置 `PI_AGENT_NOTIFY_TOOL_ERRORS=1`。

## 许可证

MIT
