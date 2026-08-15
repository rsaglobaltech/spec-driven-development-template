/**
 * What the user sees before typing anything.
 *
 * An agent that opens on a bare prompt puts the burden of discovery on the
 * person: they have to guess what it can do, what it may touch, and how to
 * talk to it. Since this agent's whole proposition is that its surface is
 * small and knowable, hiding that surface at the one moment they are looking
 * for it is the worst possible trade.
 *
 * So the first screen answers four questions: what am I, where am I, what can
 * I do, and what do I type.
 */

import { Box, Text } from "ink";

export interface ProjectInfo {
  /** Directory name shown to the user. */
  name: string;
  /** Is this actually a spec-driven project? */
  isSpecDriven: boolean;
  /** Requirements still pending, when we could read them cheaply. */
  pending: number | null;
  total: number | null;
}

export interface WelcomeInfo {
  provider: string;
  model: string;
  toolCount: number;
  commandCount: number;
  project: ProjectInfo;
}

const EXAMPLES = [
  "what still needs work?",
  "validate the project and explain any failure",
  "write a delta spec for a peak-pricing requirement",
  "what would upgrading the pack to v0.2.0 change?",
];

export function Welcome({ info }: { info: WelcomeInfo }) {
  const { project } = info;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan" bold>
          🧭 csda-agent
        </Text>
        <Text dimColor>  spec-driven assistant</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          I drive create-spec-driven-app: its {info.commandCount} commands, plus reading and
          writing files in this project. Nothing else — there is no shell.
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text dimColor>project  </Text>
          <Text>{project.name}</Text>
          {project.isSpecDriven ? (
            project.pending !== null ? (
              <Text dimColor>
                {"  "}
                {project.pending} of {project.total} requirement(s) pending
              </Text>
            ) : null
          ) : (
            <Text color="yellow">  (no spec.md here — I can still scaffold one)</Text>
          )}
        </Box>
        <Box>
          <Text dimColor>model    </Text>
          <Text>{info.model}</Text>
          <Text dimColor>  via {info.provider}</Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>try</Text>
        {EXAMPLES.map((example) => (
          <Box key={example}>
            <Text color="cyan">  › </Text>
            <Text dimColor>{example}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          /tools lists everything I can do · /help for keys · esc interrupts · ctrl+c twice exits
        </Text>
      </Box>
    </Box>
  );
}
