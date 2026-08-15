/**
 * The fixed line at the bottom: model · permission mode · tokens · cache · cost.
 *
 * The cache hit rate earns its place here. It is the one number that reveals a
 * silently broken prompt cache, and a broken cache costs roughly ten times as
 * much without changing anything the user can see.
 */

import React from "react";
import { Box, Text } from "ink";
import type { PermissionMode, UsageSnapshot } from "../engine/types.js";
import { cacheHitRate, formatCost, formatDuration, formatTokens } from "./format.js";

const MODE_LABEL: Record<PermissionMode, { text: string; color: "green" | "yellow" | "cyan" | "red" }> = {
  default: { text: "ask", color: "cyan" },
  acceptEdits: { text: "auto-edit", color: "yellow" },
  plan: { text: "plan", color: "green" },
  bypassPermissions: { text: "BYPASS", color: "red" },
};

export function StatusLine({
  usage,
  mode,
  cwd,
  engine,
}: {
  usage: UsageSnapshot;
  mode: PermissionMode;
  cwd: string;
  engine: string;
}) {
  const label = MODE_LABEL[mode] ?? MODE_LABEL.default;
  const hit = cacheHitRate(usage);
  const dir = cwd.split("/").filter(Boolean).slice(-1)[0] ?? cwd;

  return (
    <Box marginTop={1}>
      <Text dimColor>{dir}</Text>
      <Text dimColor> · </Text>
      <Text dimColor>{usage.model ?? engine}</Text>
      <Text dimColor> · </Text>
      <Text color={label.color}>{label.text}</Text>
      <Text dimColor> · </Text>
      <Text dimColor>
        {formatTokens(usage.inputTokens)}in/{formatTokens(usage.outputTokens)}out
      </Text>
      <Text dimColor> · cache </Text>
      <Text dimColor>{hit === null ? "—" : `${Math.round(hit * 100)}%`}</Text>
      <Text dimColor> · </Text>
      <Text dimColor>{formatCost(usage.costUsd)}</Text>
      {usage.lastTurnMs !== null ? (
        <>
          <Text dimColor> · </Text>
          <Text dimColor>{formatDuration(usage.lastTurnMs)}</Text>
        </>
      ) : null}
      <Text dimColor> · shift+tab mode</Text>
    </Box>
  );
}
