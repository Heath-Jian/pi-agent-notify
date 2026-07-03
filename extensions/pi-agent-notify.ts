import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

declare const require: any;

type TerminalProtocol = "osc777" | "osc99" | "osc9";

interface AssistantLike {
  role?: string;
  stopReason?: string;
  errorMessage?: string;
  model?: string;
  responseModel?: string;
}

interface RunState {
  startedAt: number;
  cwd?: string;
  model?: string;
  errorMessage?: string;
}

interface MacHostApp {
  bundleId: string;
  name: string;
}

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value !== "0" && value.toLowerCase() !== "false" && value !== "";
}

const config = {
  disabled: envBool("PI_AGENT_NOTIFY_DISABLE", false),
  method: (
    process.env.PI_AGENT_NOTIFY_METHOD ??
    process.env.PI_AGENT_NOTIFY_FORCE_METHOD ??
    "auto"
  ).toLowerCase(),
  terminalProtocol: (process.env.PI_AGENT_NOTIFY_TERMINAL_PROTOCOL ?? "auto").toLowerCase(),
  toolErrorsAreFailures: envBool("PI_AGENT_NOTIFY_TOOL_ERRORS", false),
};

function truncate(value: string, maxLength: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function pathBaseName(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.split(/[\\/]/).filter(Boolean).pop();
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m${rest.toString().padStart(2, "0")}s`;
}

function modelName(model: unknown): string | undefined {
  const value = model as { id?: string; name?: string; model?: string } | undefined;
  return value?.id ?? value?.name ?? value?.model;
}

function resolveCommand(command: string): string | undefined {
  const { spawnSync } = require("child_process");
  const result = spawnSync("which", [command], { encoding: "utf8", timeout: 1000 });
  if (result.status === 0) return result.stdout.trim();

  const candidates: Record<string, string[]> = {
    env: ["/usr/bin/env"],
    "notify-send": ["/usr/bin/notify-send", "/usr/local/bin/notify-send"],
  };

  for (const candidate of candidates[command] ?? []) {
    const test = spawnSync("test", ["-x", candidate], { stdio: "ignore", timeout: 1000 });
    if (test.status === 0) return candidate;
  }

  return undefined;
}

function shellAvailable(command: string): boolean {
  return Boolean(resolveCommand(command));
}

function detectMacHostApp(): MacHostApp | undefined {
  if (process.platform !== "darwin") return undefined;

  const { spawnSync } = require("child_process");
  let pid = process.ppid;

  for (let depth = 0; depth < 12 && pid > 1; depth += 1) {
    const result = spawnSync("ps", ["-p", String(pid), "-o", "ppid=", "-o", "comm="], {
      encoding: "utf8",
      timeout: 1000,
    });
    if (result.status !== 0) return undefined;

    const match = result.stdout.trim().match(/^(\d+)\s+(.+)$/);
    if (!match) return undefined;

    const command = match[2];
    const appMatch = command.match(/(\/.+?\.app)\//);
    if (appMatch) {
      const appPath = appMatch[1];
      const bundleResult = spawnSync(
        "/usr/libexec/PlistBuddy",
        ["-c", "Print :CFBundleIdentifier", `${appPath}/Contents/Info.plist`],
        { encoding: "utf8", timeout: 1000 },
      );
      if (bundleResult.status === 0) {
        return {
          bundleId: bundleResult.stdout.trim(),
          name: appPath.split("/").pop()?.replace(/\.app$/, "") ?? "Terminal",
        };
      }
    }

    pid = Number(match[1]);
  }

  return undefined;
}

function notifyWithPowerShell(title: string, body: string): boolean {
  if (process.platform !== "win32") return false;

  const { spawnSync } = require("child_process");
  const psString = (value: string) => `'${value.replace(/'/g, "''")}'`;
  const script = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
$template = [Windows.UI.Notifications.ToastTemplateType]::ToastText02
$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent($template)
$texts = $xml.GetElementsByTagName('text')
$texts.Item(0).AppendChild($xml.CreateTextNode(${psString(title)})) > $null
$texts.Item(1).AppendChild($xml.CreateTextNode(${psString(body)})) > $null
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Pi').Show($toast)
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    stdio: "ignore",
    timeout: 3000,
  });
  return result.status === 0;
}

function notifyWithNotifySend(title: string, body: string): boolean {
  const { spawnSync } = require("child_process");
  const executable = resolveCommand("notify-send");
  if (!executable) return false;
  const result = spawnSync(executable, [title, body], { stdio: "ignore", timeout: 3000 });
  return result.status === 0;
}

function oscText(value: string): string {
  return value.replace(/[\x00-\x1f\x7f]/g, " ").replace(/[;\x1b\\]/g, " ").trim();
}

function notifyWithOsc777(title: string, body: string): boolean {
  process.stdout.write(`\x1b]777;notify;${oscText(title)};${oscText(body)}\x07`);
  return true;
}

function notifyWithOsc99(title: string, body: string): boolean {
  process.stdout.write(`\x1b]99;i=1:d=0;${oscText(title)}\x1b\\`);
  process.stdout.write(`\x1b]99;i=1:d=1:p=body;${oscText(body)}\x1b\\`);
  return true;
}

function notifyWithOsc9(title: string, body: string): boolean {
  process.stdout.write(`\x1b]9;${oscText(title)}: ${oscText(body)}\x07`);
  return true;
}

function notifyWithBell(): boolean {
  process.stdout.write("\x07");
  return true;
}

function terminalIdentityText(): string {
  return [
    process.env.TERM_PROGRAM,
    process.env.TERMINAL_EMULATOR,
    process.env.TERM,
    process.env.ZELLIJ_SESSION_NAME,
    process.env.KITTY_PID ? "kitty" : undefined,
    process.env.KITTY_WINDOW_ID ? "kitty" : undefined,
    process.env.WEZTERM_EXECUTABLE ? "wezterm" : undefined,
    process.env.WEZTERM_PANE ? "wezterm" : undefined,
    process.env.GHOSTTY_RESOURCES_DIR ? "ghostty" : undefined,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function protocolForTerminalName(name: string): TerminalProtocol | undefined {
  if (!name) return undefined;
  if (name.includes("kitty")) return "osc99";
  if (
    name.includes("zap") ||
    name.includes("wezterm") ||
    name.includes("ghostty") ||
    name.includes("rxvt") ||
    name.includes("urxvt") ||
    name.includes("terminology")
  ) {
    return "osc777";
  }
  if (
    name.includes("iterm") ||
    name.includes("apple_terminal") ||
    name.includes("terminal.app") ||
    name === "terminal"
  ) {
    return "osc9";
  }
  return undefined;
}

function normalizeTerminalProtocol(value: string | undefined): TerminalProtocol | "auto" | "all" | undefined {
  const protocol = (value ?? "auto").toLowerCase().replace(/[_\s]+/g, "-");
  if (protocol === "auto" || protocol === "all") return protocol;
  if (protocol === "osc777" || protocol === "777") return "osc777";
  if (protocol === "osc99" || protocol === "99") return "osc99";
  if (protocol === "osc9" || protocol === "9") return "osc9";
  if (["zap", "wezterm", "ghostty", "rxvt", "urxvt", "terminology"].includes(protocol)) return "osc777";
  if (protocol === "kitty") return "osc99";
  if (["iterm", "iterm2", "apple-terminal", "terminal-app", "terminal"].includes(protocol)) return "osc9";
  return undefined;
}

function detectTerminalProtocol(): TerminalProtocol | undefined {
  const identityProtocol = protocolForTerminalName(terminalIdentityText());
  if (identityProtocol) return identityProtocol;

  const hostApp = detectMacHostApp();
  return protocolForTerminalName(hostApp?.name.toLowerCase() ?? "");
}

function notifyWithTerminalProtocol(title: string, body: string): boolean {
  const protocol = normalizeTerminalProtocol(config.terminalProtocol);
  if (!protocol) return false;

  const selected = protocol === "auto" ? detectTerminalProtocol() : protocol;

  if (selected === "osc777") return notifyWithOsc777(title, body);
  if (selected === "osc99") return notifyWithOsc99(title, body);
  if (selected === "osc9") return notifyWithOsc9(title, body);

  if (protocol === "all") {
    notifyWithOsc777(title, body);
    notifyWithOsc99(title, body);
    notifyWithOsc9(title, body);
    return true;
  }

  return false;
}

function notifyWithAuto(title: string, body: string): void {
  if (process.platform === "darwin") {
    if (notifyWithTerminalProtocol(title, body)) return;
    if (notifyWithNative(title, body)) return;
    return void notifyWithBell();
  }

  if (notifyWithTerminalProtocol(title, body)) return;
  if (notifyWithNative(title, body)) return;
  notifyWithBell();
}

function notifyWithNative(title: string, body: string): boolean {
  if (process.platform === "darwin") {
    return false;
  }
  if ((process.platform === "linux" || process.env.WSL_DISTRO_NAME) && shellAvailable("notify-send")) {
    return notifyWithNotifySend(title, body);
  }
  if (process.platform === "win32") {
    return notifyWithPowerShell(title, body);
  }
  return false;
}

function sendNotification(title: string, body: string): void {
  if (config.disabled) return;

  const method = config.method;
  if (method === "terminal") return void notifyWithTerminalProtocol(title, body);
  if (method === "system") return void notifyWithNative(title, body);
  if (method === "native") return void notifyWithNative(title, body);
  if (method === "notify-send") return void notifyWithNotifySend(title, body);
  if (method === "powershell") return void notifyWithPowerShell(title, body);
  if (method === "osc777") return void notifyWithOsc777(title, body);
  if (method === "osc99") return void notifyWithOsc99(title, body);
  if (method === "osc9") return void notifyWithOsc9(title, body);
  if (method === "bell") return void notifyWithBell();
  notifyWithAuto(title, body);
}

function errorFromAssistant(message: unknown): string | undefined {
  const assistant = message as AssistantLike;
  if (assistant?.role !== "assistant") return undefined;
  if (assistant.errorMessage) return assistant.errorMessage;
  if (assistant.stopReason && assistant.stopReason !== "stop" && assistant.stopReason !== "toolUse") {
    return `Assistant stopped with reason: ${assistant.stopReason}`;
  }
  return undefined;
}

function findRunError(messages: unknown[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const error = errorFromAssistant(messages[index]);
    if (error) return error;
  }
  return undefined;
}

function assistantModel(messages: unknown[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as AssistantLike;
    if (message?.role === "assistant") return message.responseModel ?? message.model;
  }
  return undefined;
}

function buildBody(state: RunState, cwd: string | undefined, model: string | undefined, error: string | undefined): string {
  const project = pathBaseName(cwd ?? state.cwd);
  const duration = formatDuration(Date.now() - state.startedAt);
  const parts = [project, duration, model ?? state.model].filter(Boolean);
  const prefix = parts.join(" | ");
  if (!error) return prefix || "Agent run finished.";
  return truncate(prefix ? `${prefix}\n${error}` : error, 220);
}

function availableLabel(command: string): string {
  return resolveCommand(command) ? "yes" : "no";
}

function terminalProtocolLabel(): string {
  const configured = normalizeTerminalProtocol(config.terminalProtocol);
  if (configured && configured !== "auto") return configured;
  return detectTerminalProtocol() ?? "not detected";
}

function hostNotificationPrefsLabel(hostApp: MacHostApp | undefined): string {
  if (process.platform !== "darwin") return "not applicable";
  if (!hostApp?.bundleId) return "not detected";

  try {
    const home = process.env.HOME;
    if (!home) return "unknown (HOME is not set)";
    const { readFileSync } = require("fs");
    const prefs = readFileSync(`${home}/Library/Preferences/com.apple.ncprefs.plist`);
    return prefs.toString("latin1").includes(hostApp.bundleId) ? "registered in macOS" : "not registered in macOS";
  } catch (error) {
    return `unknown (${error instanceof Error ? error.message : String(error)})`;
  }
}

function autoOrderLabel(): string {
  return "terminal protocol -> native/system -> bell";
}

function doctorSummary(): string {
  const hostApp = detectMacHostApp();
  const lines = [
    `platform: ${process.platform}`,
    `host: ${hostApp ? `${hostApp.name} (${hostApp.bundleId})` : "not detected"}`,
    `host notification prefs: ${hostNotificationPrefsLabel(hostApp)}`,
    `auto order: ${autoOrderLabel()}`,
    `terminal protocol: ${terminalProtocolLabel()}`,
    `notify-send: ${availableLabel("notify-send")}`,
  ];
  return lines.join("\n");
}

export default function piAgentNotify(pi: ExtensionAPI): void {
  if (config.disabled) return;

  let state: RunState | undefined;

  pi.on("agent_start", async (_event, ctx) => {
    state = {
      startedAt: Date.now(),
      cwd: ctx.cwd,
      model: modelName(ctx.model),
    };
  });

  pi.on("message_end", async (event) => {
    const error = errorFromAssistant(event.message);
    if (error) {
      state = state ?? { startedAt: Date.now() };
      state.errorMessage = error;
    }
  });

  pi.on("tool_execution_end", async (event) => {
    if (!config.toolErrorsAreFailures || !event.isError) return;
    state = state ?? { startedAt: Date.now() };
    state.errorMessage = `Tool failed: ${event.toolName}`;
  });

  pi.on("agent_end", async (event, ctx) => {
    const activeState = state ?? {
      startedAt: Date.now(),
      cwd: ctx.cwd,
      model: modelName(ctx.model),
    };
    const messages = event.messages as unknown[];
    const error = activeState.errorMessage ?? findRunError(messages);
    const model = modelName(ctx.model) ?? activeState.model ?? assistantModel(messages);
    const body = buildBody(activeState, ctx.cwd, model, error);

    if (error) {
      sendNotification("Pi failed", body);
    } else {
      sendNotification("Pi done", body);
    }

    state = undefined;
  });

  pi.registerCommand("notify-doctor", {
    description: "Check pi-agent-notify notification backend detection.",
    handler: async (_args, ctx) => {
      const summary = doctorSummary();
      ctx.ui.notify(summary, "info");
    },
  });
}
