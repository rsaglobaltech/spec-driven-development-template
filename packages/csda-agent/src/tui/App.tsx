/**
 * The REPL.
 *
 * Consumes `AgentEvent`s and nothing else — it does not import the SDK and
 * cannot tell which engine is behind the boundary.
 *
 * Two details carry most of the "feels like a real agent CLI" weight:
 *
 *   - Deltas are buffered and flushed on an interval rather than painted per
 *     token. Ink re-renders the whole tree, so repainting on every token
 *     flickers badly on slow terminals.
 *   - Esc aborts through an AbortController wired into the engine, so it stops
 *     the request rather than merely stopping the paint. A CLI whose Esc keeps
 *     burning tokens after the user gave up is worse than one without Esc.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import type { AgentEngine, PermissionMode, UsageSnapshot } from "../engine/types.js";
import { emptyUsage, nextPermissionMode } from "../engine/types.js";
import { applyEvent, type Entry } from "./format.js";
import { StatusLine } from "./StatusLine.js";
import { ToolCard } from "./ToolCard.js";
import { PermissionPrompt, type PendingPermission } from "./PermissionPrompt.js";
import { Welcome, type WelcomeInfo } from "./Welcome.js";
import { COMMANDS } from "../tools/manifest.js";
import { TOOL_NAMES } from "../tools/registry.js";

/** ~30 fps. Fast enough to read as streaming, slow enough not to flicker. */
const FLUSH_MS = 33;

export interface AppProps {
  engine: AgentEngine;
  cwd: string;
  info: WelcomeInfo;
  initialPrompt?: string;
}

/**
 * Commands answered by the CLI itself, never sent to the model.
 *
 * Asking a model to describe its own tool set costs a round trip and can be
 * wrong; reading it out of the manifest cannot.
 */
function localCommand(input: string, info: WelcomeInfo): string | null {
  const command = input.trim().toLowerCase();
  if (command === "/tools") {
    const lines = COMMANDS.map((c) => `  ${c.tool.padEnd(24)} csda ${c.argv.join(" ")}`);
    const files = TOOL_NAMES.filter((n) => !n.startsWith("csda_")).map((n) => `  ${n}`);
    return [
      `${TOOL_NAMES.length} tools. There is no shell.`,
      "",
      "csda commands:",
      ...lines,
      "",
      "files (project only, writes limited to the spec surface):",
      ...files,
    ].join("\n");
  }
  if (command === "/help") {
    return [
      "keys",
      "  enter        send",
      "  esc          interrupt the turn in flight",
      "  shift+tab    cycle permission mode: ask → auto-edit → plan",
      "  ctrl+c       interrupt, or exit when idle",
      "",
      "commands",
      "  /tools       list everything I can do",
      "  /clear       start a fresh conversation",
      "  /help        this",
    ].join("\n");
  }
  if (command === "/clear") return "__CLEAR__";
  return null;
}

export function App({ engine, cwd, info, initialPrompt }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [usage, setUsage] = useState<UsageSnapshot>(emptyUsage());
  const [mode, setMode] = useState<PermissionMode>(engine.permissionMode());
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [denyDraft, setDenyDraft] = useState("");
  const [explaining, setExplaining] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const pending = useRef<Entry[] | null>(null);
  const flushTimer = useRef<NodeJS.Timeout | null>(null);

  /** Coalesce transcript updates; paint at most once per FLUSH_MS. */
  const schedule = useCallback((next: Entry[]) => {
    pending.current = next;
    if (flushTimer.current) return;
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      if (pending.current) {
        setEntries(pending.current);
        pending.current = null;
      }
    }, FLUSH_MS);
  }, []);

  const flushNow = useCallback(() => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    if (pending.current) {
      setEntries(pending.current);
      pending.current = null;
    }
  }, []);

  const send = useCallback(
    async (prompt: string) => {
      const text = prompt.trim();
      if (text === "" || busy) return;

      // Local commands are answered here; the model never sees them.
      const local = localCommand(text, info);
      if (local !== null) {
        if (local === "__CLEAR__") {
          setEntries([]);
          pending.current = null;
          (engine as any).clear?.();
          return;
        }
        setEntries((current) => [
          ...current,
          { kind: "user", text },
          { kind: "notice", text: local },
        ]);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);

      let current = [...(pending.current ?? entries), { kind: "user" as const, text }];
      setEntries(current);

      try {
        for await (const event of engine.run({ prompt: text }, controller.signal)) {
          if (event.type === "thinking_start") setThinking(true);
          if (event.type === "text_delta" || event.type === "text_complete") setThinking(false);
          if (event.type === "turn_end") setUsage(event.usage);
          if (event.type === "permission_request") {
            // The engine is blocked on this answer, so the prompt goes up at
            // once rather than waiting for the next flush tick.
            flushNow();
            setPendingPermission({
              id: event.id,
              tool: event.tool,
              detail: event.detail,
              reason: event.reason,
              suggestedRule: event.suggestedRule,
            });
            continue;
          }

          const next = applyEvent(current, event);
          if (next !== current) {
            current = next;
            // Tool state and errors are structural — show them at once. Text
            // is the high-frequency case and is the only one worth batching.
            if (event.type === "text_delta") schedule(current);
            else {
              pending.current = current;
              flushNow();
            }
          }
        }
      } catch (err: any) {
        current = applyEvent(current, {
          type: "error",
          code: "tui_error",
          message: err?.message ?? String(err),
          retryable: false,
        });
        pending.current = current;
        flushNow();
      } finally {
        flushNow();
        setBusy(false);
        setThinking(false);
        abortRef.current = null;
      }
    },
    [busy, engine, entries, flushNow, info, schedule]
  );

  // A prompt passed on the command line runs once, then the REPL takes over.
  const started = useRef(false);
  useEffect(() => {
    if (initialPrompt && !started.current) {
      started.current = true;
      void send(initialPrompt);
    }
  }, [initialPrompt, send]);

  useEffect(() => () => flushNow(), [flushNow]);

  const answerPermission = useCallback(
    (answer: Parameters<NonNullable<AgentEngine["resolvePermission"]>>[1]) => {
      if (!pendingPermission) return;
      engine.resolvePermission?.(pendingPermission.id, answer);
      setPendingPermission(null);
      setDenyDraft("");
      setExplaining(false);
    },
    [engine, pendingPermission]
  );

  useInput((input, key) => {
    // The permission prompt is modal: while it is up it owns the keyboard, so
    // a keystroke meant for the prompt cannot leak into the composer.
    if (pendingPermission) {
      if (explaining) {
        if (key.return) {
          answerPermission({ decision: "deny", message: denyDraft.trim() || "Denied by the user." });
          return;
        }
        if (key.escape) {
          setExplaining(false);
          setDenyDraft("");
          return;
        }
        if (key.backspace || key.delete) {
          setDenyDraft((d) => d.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta) setDenyDraft((d) => d + input);
        return;
      }

      const choice = input.toLowerCase();
      if (choice === "y") answerPermission({ decision: "allow" });
      else if (choice === "a") answerPermission({ decision: "allowAlways" });
      else if (choice === "n") answerPermission({ decision: "deny" });
      else if (choice === "e") setExplaining(true);
      else if (key.escape) {
        // Escaping a prompt denies it — the engine must never be left blocked.
        answerPermission({ decision: "deny", message: "Interrupted by the user." });
        if (abortRef.current) abortRef.current.abort();
      }
      return;
    }

    if (key.escape) {
      // Abort the request, not just the rendering.
      if (abortRef.current) abortRef.current.abort();
      return;
    }
    if (key.shift && key.tab) {
      const next = nextPermissionMode(mode);
      setMode(next);
      void engine.setPermissionMode(next);
      return;
    }
    if (key.ctrl && input === "c") {
      if (abortRef.current) abortRef.current.abort();
      else exit();
      return;
    }
    if (busy) return;

    if (key.return) {
      const prompt = draft;
      setDraft("");
      void send(prompt);
      return;
    }
    if (key.backspace || key.delete) {
      setDraft((d) => d.slice(0, -1));
      return;
    }
    if (input && !key.ctrl && !key.meta) setDraft((d) => d + input);
  });

  const width = stdout?.columns ?? 80;

  return (
    <Box flexDirection="column">
      {entries.length === 0 ? <Welcome info={info} /> : null}
      {entries.map((entry, i) => (
        <TranscriptEntry key={i} entry={entry} width={width} />
      ))}

      {thinking && !pendingPermission ? (
        <Box marginTop={1}>
          <Text dimColor>· thinking…</Text>
        </Box>
      ) : null}

      {pendingPermission ? (
        <PermissionPrompt
          pending={pendingPermission}
          denyDraft={denyDraft}
          explaining={explaining}
        />
      ) : (
        <Box marginTop={1}>
          <Text color="cyan">{busy ? "· " : "› "}</Text>
          <Text>{draft}</Text>
          {busy ? <Text dimColor>(esc to interrupt)</Text> : <Text dimColor>▏</Text>}
        </Box>
      )}

      <StatusLine usage={usage} mode={mode} cwd={cwd} engine={engine.name} />
    </Box>
  );
}

function TranscriptEntry({ entry, width }: { entry: Entry; width: number }) {
  switch (entry.kind) {
    case "user":
      return (
        <Box marginTop={1}>
          <Text color="cyan">› </Text>
          <Text bold>{entry.text}</Text>
        </Box>
      );
    case "assistant":
      return (
        <Box marginTop={1}>
          <Text>{entry.text}</Text>
        </Box>
      );
    case "tool":
      return <ToolCard entry={entry} width={width} />;
    case "notice":
      return (
        <Box marginTop={1}>
          <Text dimColor>{entry.text}</Text>
        </Box>
      );
    case "error":
      return (
        <Box marginTop={1}>
          <Text color="red">✖ {entry.text}</Text>
        </Box>
      );
    default:
      return null;
  }
}
