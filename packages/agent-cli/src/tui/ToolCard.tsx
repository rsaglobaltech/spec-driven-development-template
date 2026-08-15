/**
 * One card per tool call.
 *
 * The result is clipped on purpose: a `Bash` that prints four hundred lines
 * must not push the conversation out of the scrollback. The card says how much
 * it hid rather than hiding it silently.
 */

import React from "react";
import { Box, Text } from "ink";
import { clipLines, type Entry } from "./format.js";

const MAX_RESULT_LINES = 6;

const MARK = {
  running: { glyph: "◐", color: "yellow" as const },
  ok: { glyph: "✔", color: "green" as const },
  error: { glyph: "✖", color: "red" as const },
};

export function ToolCard({
  entry,
  width,
}: {
  entry: Extract<Entry, { kind: "tool" }>;
  width: number;
}) {
  const mark = MARK[entry.state];
  const { shown, hiddenLines } = clipLines(entry.preview, MAX_RESULT_LINES);
  const summaryWidth = Math.max(10, width - entry.name.length - 6);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={mark.color}>{mark.glyph} </Text>
        <Text bold>{entry.name}</Text>
        {entry.summary ? (
          <Text dimColor> {entry.summary.slice(0, summaryWidth)}</Text>
        ) : null}
      </Box>

      {shown.trim() !== "" ? (
        <Box flexDirection="column" marginLeft={2}>
          <Text dimColor>{shown}</Text>
          {hiddenLines > 0 ? <Text dimColor>… {hiddenLines} more line(s)</Text> : null}
        </Box>
      ) : null}
    </Box>
  );
}
