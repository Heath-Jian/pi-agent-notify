# pi-agent-notify

Pi extension that sends host terminal or desktop notifications when an agent run finishes or fails.

It is intentionally small:

- Sends one notification on `agent_end`
- Shows `Pi done` for successful runs
- Shows `Pi failed` when the final assistant message has `errorMessage` or a non-success `stopReason`
- Includes project name, duration, and model when available
- Prefers the host terminal notification protocol when available, then falls back to the platform system notifier
- Maps Zap, WezTerm, Ghostty, Kitty, iTerm2, Terminal.app, and compatible terminals to their best notification protocol
- Supports the macOS helper app, `terminal-notifier`, OSC 777, OSC 99, OSC 9, Linux `notify-send`, Windows PowerShell Toast, and bell fallback
- Adds `/notify-doctor` to check notification backends and install optional macOS helpers

## Install

From a local checkout:

```bash
pi install /path/to/pi-agent-notify
```

After installing, restart Pi or run:

```text
/reload
```

Check and set up optional helpers:

```text
/notify-doctor
```

## Configuration

Environment variables:

| Name | Default | Description |
| --- | --- | --- |
| `PI_AGENT_NOTIFY_DISABLE` | `0` | Set to `1` to disable notifications. |
| `PI_AGENT_NOTIFY_SOUND` | `1` | Set to `0` to disable notification sounds. |
| `PI_AGENT_NOTIFY_SOUND_NAME` | unset | macOS sound name for all notifications. |
| `PI_AGENT_NOTIFY_SUCCESS_SOUND_NAME` | `Glass` | macOS sound for successful runs. |
| `PI_AGENT_NOTIFY_ERROR_SOUND_NAME` | `Basso` | macOS sound for failed runs. |
| `PI_AGENT_NOTIFY_METHOD` | `auto` | One of `auto`, `system`, `native`, `helper`, `terminal`, `terminal-notifier`, `osascript`, `notify-send`, `powershell`, `osc777`, `osc99`, `osc9`, `bell`. |
| `PI_AGENT_NOTIFY_FORCE_METHOD` | unset | Legacy alias for `PI_AGENT_NOTIFY_METHOD`. |
| `PI_AGENT_NOTIFY_TERMINAL_PROTOCOL` | `auto` | One of `auto`, `osc777`, `osc99`, `osc9`, `all`, or aliases such as `zap`, `wezterm`, `ghostty`, `kitty`, `iterm2`, `terminal`. |
| `PI_AGENT_NOTIFY_TOOL_ERRORS` | `0` | Set to `1` to mark any tool execution error as a failed run. |

## Notes

By default, tool errors do not mark the whole run as failed. Pi agents can often recover from a failed shell command or file operation and still finish successfully. Set `PI_AGENT_NOTIFY_TOOL_ERRORS=1` if you prefer stricter behavior.

The default `auto` mode prioritizes the host terminal notification protocol:

```text
auto order: terminal protocol -> native/system -> bell
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
| Unknown terminal | platform system fallback |

In Zap, this uses Zap's OSC notification support, so the notification can be owned by Zap instead of `Pi Agent Notify`. If a terminal is unknown or does not advertise a supported protocol, `auto` falls back to the platform notifier instead of writing an escape sequence that may be ignored.

The helper fallback lives at:

```text
~/Library/Application Support/pi-agent-notify/Pi Agent Notify.app
```

This avoids routing fallback notifications through Script Editor. `/notify-doctor` creates or repairs the helper app. The helper uses Apple's `swiftc` compiler when it is first created and does not require Homebrew. After the first helper notification, macOS may ask you to allow notifications for `Pi Agent Notify`.

If Zap is frontmost, Zap may show an in-window toast instead of a macOS banner even when macOS notification permission is enabled. When Zap is in the background, Zap decides whether its terminal-owned notification is promoted to a system banner.

The helper exits silently when macOS launches it without notification arguments, so clicking an old notification does not create another default notification.

`osascript` is still available only when explicitly selected with `PI_AGENT_NOTIFY_METHOD=osascript`; it is not part of the default macOS fallback path.

Installing `terminal-notifier` can allow alternate sender behavior on some macOS versions, but it is optional. Some macOS versions may crash `terminal-notifier`; `/notify-doctor` reports that case.

```bash
brew install terminal-notifier
```

The default helper setup does not require Homebrew.

If you prefer terminal-owned notifications instead of macOS system banners, set:

```bash
export PI_AGENT_NOTIFY_METHOD=terminal
```
