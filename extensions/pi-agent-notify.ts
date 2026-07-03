import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

declare const require: any;

type NotificationKind = "success" | "error";
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

interface MacHelperStatus {
  ready: boolean;
  appPath?: string;
  error?: string;
}

interface CommandContextLike {
  cwd: string;
  ui: {
    confirm(title: string, message: string): Promise<boolean>;
    notify(message: string, type?: "info" | "warning" | "error"): void;
  };
  exec(command: string, args: string[], options?: { cwd?: string; timeout?: number }): Promise<{
    stdout: string;
    stderr: string;
    code: number;
    killed: boolean;
  }>;
}

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value !== "0" && value.toLowerCase() !== "false" && value !== "";
}

const config = {
  disabled: envBool("PI_AGENT_NOTIFY_DISABLE", false),
  sound: envBool("PI_AGENT_NOTIFY_SOUND", true),
  soundName: process.env.PI_AGENT_NOTIFY_SOUND_NAME,
  successSoundName: process.env.PI_AGENT_NOTIFY_SUCCESS_SOUND_NAME,
  errorSoundName: process.env.PI_AGENT_NOTIFY_ERROR_SOUND_NAME,
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
    brew: ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"],
    env: ["/usr/bin/env"],
    open: ["/usr/bin/open"],
    swiftc: [
      "/usr/bin/swiftc",
      "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/swiftc",
    ],
    "terminal-notifier": ["/opt/homebrew/bin/terminal-notifier", "/usr/local/bin/terminal-notifier"],
    osascript: ["/usr/bin/osascript"],
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

function terminalNotifierStatus(): string {
  const executable = resolveCommand("terminal-notifier");
  if (!executable) return "not installed";

  const { spawnSync } = require("child_process");
  const result = spawnSync(executable, ["-help"], { stdio: "ignore", timeout: 1000 });
  if (result.status === 0) return `ok (${executable})`;
  if (result.error) return `installed but failed (${result.error.code ?? result.error.message})`;
  if (result.signal) return `installed but failed (${result.signal})`;
  return `installed but failed (exit ${result.status ?? "unknown"})`;
}

function notificationSoundName(kind: NotificationKind): string {
  return kind === "error"
    ? config.errorSoundName ?? config.soundName ?? "Basso"
    : config.successSoundName ?? config.soundName ?? "Glass";
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const macHelperSource = `import Cocoa

let args = CommandLine.arguments

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

if args.contains("--clear") {
    NSUserNotificationCenter.default.removeAllDeliveredNotifications()
    exit(0)
}

if args.count < 3 {
    exit(0)
}

let notificationTitle = args[1]
let notificationBody = args[2]
let notificationSound = args.count > 3 ? args[3] : ""

let notification = NSUserNotification()
notification.title = notificationTitle
notification.informativeText = notificationBody
notification.hasActionButton = false
if !notificationSound.isEmpty {
    notification.soundName = notificationSound
}

NSUserNotificationCenter.default.deliver(notification)
RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.35))
`;

const macHelperInfoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>en</string>
\t<key>CFBundleDisplayName</key>
\t<string>Pi Agent Notify</string>
\t<key>CFBundleExecutable</key>
\t<string>PiAgentNotifyHelper</string>
\t<key>CFBundleIdentifier</key>
\t<string>com.heathhe.pi-agent-notify</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
\t<key>CFBundleName</key>
\t<string>Pi Agent Notify</string>
\t<key>CFBundlePackageType</key>
\t<string>APPL</string>
\t<key>CFBundleShortVersionString</key>
\t<string>1.0</string>
\t<key>CFBundleVersion</key>
\t<string>1</string>
\t<key>LSMinimumSystemVersion</key>
\t<string>10.14</string>
\t<key>NSHighResolutionCapable</key>
\t<true/>
</dict>
</plist>
`;

function macHelperBaseDir(): string | undefined {
  const home = process.env.HOME;
  if (!home) return undefined;
  return `${home}/Library/Application Support/pi-agent-notify`;
}

function macHelperAppPath(): string | undefined {
  const baseDir = macHelperBaseDir();
  if (!baseDir) return undefined;
  return `${baseDir}/Pi Agent Notify.app`;
}

function ensureMacHelperApp(): MacHelperStatus {
  if (process.platform !== "darwin") {
    return { ready: false, error: "not macOS" };
  }

  const appPath = macHelperAppPath();
  const baseDir = macHelperBaseDir();
  const swiftc = resolveCommand("swiftc");
  if (!appPath || !baseDir) return { ready: false, error: "HOME is not set" };
  if (!swiftc) return { ready: false, appPath, error: "swiftc not found" };

  const { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("fs");
  const { spawnSync } = require("child_process");
  const sourcePath = `${baseDir}/pi-agent-notify-helper.swift`;
  const versionPath = `${baseDir}/helper-version`;
  const executablePath = `${appPath}/Contents/MacOS/PiAgentNotifyHelper`;
  const helperVersion = "5";

  try {
    mkdirSync(baseDir, { recursive: true });
    const currentVersion = existsSync(versionPath) ? readFileSync(versionPath, "utf8").trim() : "";
    if (!existsSync(executablePath) || currentVersion !== helperVersion) {
      rmSync(appPath, { recursive: true, force: true });
      mkdirSync(`${appPath}/Contents/MacOS`, { recursive: true });
      mkdirSync(`${appPath}/Contents/Resources`, { recursive: true });
      writeFileSync(`${appPath}/Contents/Info.plist`, macHelperInfoPlist, "utf8");
      writeFileSync(sourcePath, macHelperSource, "utf8");
      const result = spawnSync(swiftc, [sourcePath, "-o", executablePath], {
        encoding: "utf8",
        timeout: 20000,
      });
      if (result.status !== 0) {
        const reason = result.stderr || result.error?.message || result.signal || result.status || "unknown";
        return { ready: false, appPath, error: `swiftc failed (${truncate(String(reason), 120)})` };
      }
      chmodSync(executablePath, 0o755);
      writeFileSync(versionPath, helperVersion, "utf8");
    }
    return { ready: true, appPath };
  } catch (error) {
    return {
      ready: false,
      appPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function notifyWithMacHelper(title: string, body: string, kind: NotificationKind): boolean {
  if (process.platform !== "darwin") return false;

  const open = resolveCommand("open");
  if (!open) return false;

  const helper = ensureMacHelperApp();
  if (!helper.ready || !helper.appPath) return false;

  const { spawnSync } = require("child_process");
  const soundName = config.sound ? notificationSoundName(kind) : "";
  const result = spawnSync(open, ["-gj", "-n", helper.appPath, "--args", title, body, soundName], {
    stdio: "ignore",
    timeout: 3000,
  });
  return result.status === 0;
}

function notifyWithOsascript(title: string, body: string, kind: NotificationKind): boolean {
  const { spawnSync } = require("child_process");
  const executable = resolveCommand("osascript");
  if (!executable) return false;
  const soundName = notificationSoundName(kind);
  const soundClause = config.sound ? ` sound name ${appleScriptString(soundName)}` : "";
  const script = `display notification ${appleScriptString(body)} with title ${appleScriptString(title)}${soundClause}`;
  const result = spawnSync(executable, ["-e", script], { stdio: "ignore", timeout: 3000 });
  return result.status === 0;
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

function notifyWithTerminalNotifier(title: string, body: string, kind: NotificationKind): boolean {
  const executable = resolveCommand("terminal-notifier");
  if (process.platform !== "darwin" || !executable) return false;

  const { spawnSync } = require("child_process");
  const args = ["-title", title, "-message", body];
  const hostApp = detectMacHostApp();

  if (hostApp?.bundleId) {
    args.push("-sender", hostApp.bundleId);
  }
  if (config.sound) {
    args.push("-sound", notificationSoundName(kind));
  }

  const result = spawnSync(executable, args, { stdio: "ignore", timeout: 3000 });
  return result.status === 0;
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

function notifyWithAuto(title: string, body: string, kind: NotificationKind): void {
  if (process.platform === "darwin") {
    if (notifyWithTerminalProtocol(title, body)) return;
    if (notifyWithNative(title, body, kind)) return;
    return void notifyWithBell();
  }

  if (notifyWithTerminalProtocol(title, body)) return;
  if (notifyWithNative(title, body, kind)) return;
  notifyWithBell();
}

function notifyWithNative(title: string, body: string, kind: NotificationKind): boolean {
  if (process.platform === "darwin") {
    return notifyWithMacHelper(title, body, kind);
  }
  if ((process.platform === "linux" || process.env.WSL_DISTRO_NAME) && shellAvailable("notify-send")) {
    return notifyWithNotifySend(title, body);
  }
  if (process.platform === "win32") {
    return notifyWithPowerShell(title, body);
  }
  return false;
}

function sendNotification(title: string, body: string, kind: NotificationKind): void {
  if (config.disabled) return;

  const method = config.method;
  if (method === "terminal-notifier") return void notifyWithTerminalNotifier(title, body, kind);
  if (method === "terminal") return void notifyWithTerminalProtocol(title, body);
  if (method === "system") return void notifyWithNative(title, body, kind);
  if (method === "native") return void notifyWithNative(title, body, kind);
  if (method === "helper") return void notifyWithMacHelper(title, body, kind);
  if (method === "osascript") return void notifyWithOsascript(title, body, kind);
  if (method === "notify-send") return void notifyWithNotifySend(title, body);
  if (method === "powershell") return void notifyWithPowerShell(title, body);
  if (method === "osc777") return void notifyWithOsc777(title, body);
  if (method === "osc99") return void notifyWithOsc99(title, body);
  if (method === "osc9") return void notifyWithOsc9(title, body);
  if (method === "bell") return void notifyWithBell();
  notifyWithAuto(title, body, kind);
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

function helperLabel(): string {
  if (process.platform !== "darwin") return "not applicable";

  const helper = ensureMacHelperApp();
  if (helper.ready) return `ready (${helper.appPath})`;
  if (helper.appPath) return `not ready (${helper.error ?? "unknown error"}; ${helper.appPath})`;
  return `not ready (${helper.error ?? "unknown error"})`;
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
    `helper: ${helperLabel()}`,
    `auto order: ${autoOrderLabel()}`,
    `terminal protocol: ${terminalProtocolLabel()}`,
    `terminal-notifier: ${terminalNotifierStatus()}`,
    `osascript: ${availableLabel("osascript")}`,
    `notify-send: ${availableLabel("notify-send")}`,
    `brew: ${availableLabel("brew")}`,
  ];
  return lines.join("\n");
}

async function maybeInstallMacDependencies(ctx: CommandContextLike): Promise<void> {
  if (process.platform !== "darwin") {
    ctx.ui.notify("No macOS dependency setup needed on this platform.", "info");
    return;
  }

  const helper = ensureMacHelperApp();
  if (helper.ready) {
    ctx.ui.notify(`Pi Agent Notify helper is ready: ${helper.appPath}`, "info");
    return;
  }

  ctx.ui.notify(`Pi Agent Notify helper setup failed: ${helper.error ?? "unknown error"}`, "error");
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
      sendNotification("Pi failed", body, "error");
    } else {
      sendNotification("Pi done", body, "success");
    }

    state = undefined;
  });

  pi.registerCommand("notify-doctor", {
    description: "Check pi-agent-notify backends and install optional helpers.",
    handler: async (_args, ctx) => {
      const summary = doctorSummary();
      ctx.ui.notify(summary, "info");
      await maybeInstallMacDependencies(ctx as unknown as CommandContextLike);
    },
  });
}
