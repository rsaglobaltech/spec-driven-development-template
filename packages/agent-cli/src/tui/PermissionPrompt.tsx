/**
 * The permission prompt.
 *
 * Four answers, not two. "Yes, and stop asking for this" is the option that
 * decides whether a permission system survives contact with real use: without
 * it, the third prompt for the same `npm test` sends the user to
 * `--permission-mode bypassPermissions` and every gate is gone at once.
 *
 * The rule that would be persisted is shown verbatim, because "always allow"
 * is only a safe answer if the user can see how wide it is.
 */

import { Box, Text } from "ink";

export interface PendingPermission {
  id: string;
  tool: string;
  detail: string;
  reason: string;
  suggestedRule: string;
}

export const PERMISSION_CHOICES = [
  { key: "y", label: "yes, once" },
  { key: "a", label: "yes, and don't ask again for this" },
  { key: "n", label: "no" },
  { key: "e", label: "no, and tell the agent why" },
] as const;

export function PermissionPrompt({
  pending,
  denyDraft,
  explaining,
}: {
  pending: PendingPermission;
  denyDraft: string;
  explaining: boolean;
}) {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
      <Box>
        <Text color="yellow" bold>
          permission{" "}
        </Text>
        <Text bold>{pending.tool}</Text>
        {pending.detail ? <Text dimColor> {pending.detail}</Text> : null}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{pending.reason}</Text>
      </Box>

      {explaining ? (
        <Box marginTop={1}>
          <Text color="cyan">why not: </Text>
          <Text>{denyDraft}</Text>
          <Text dimColor>▏</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          {PERMISSION_CHOICES.map((choice) => (
            <Box key={choice.key}>
              <Text color="cyan">[{choice.key}]</Text>
              <Text> {choice.label}</Text>
              {choice.key === "a" ? (
                <Text dimColor> → {pending.suggestedRule}</Text>
              ) : null}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
