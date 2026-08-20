export interface PromptRequirement {
  requirement: string;
  scenarioId?: string;
  scenario_id?: string;
  category?: string;
  featureFile?: string;
  feature_file?: string;
  testArtifact?: string;
  test_artifact?: string;
  technicalArtifact?: string;
  technical_artifact?: string;
  status?: string;
  [key: string]: any;
}

export interface PromptOptions {
  promptPrefix?: string;
  hint?: string;
  previousFailure?: string;
  /** What an advisory reviewer said about the previous attempt. */
  reviewFindings?: string;
  attempt?: number;
  maxAttempts?: number;
  featureContent?: string | null;
  aiRulesContent?: string | null;
  stageRules?: string[];
}

export class AgentPrompt {
  public static build(req: PromptRequirement, opts: PromptOptions = {}): string {
    const parts: string[] = [];

    if (opts.promptPrefix && String(opts.promptPrefix).trim()) {
      parts.push(String(opts.promptPrefix).trimEnd());
      parts.push("---");
    }

    parts.push(
      `# Implement ${req.requirement}\n\n` +
        `You are a coding agent working inside a spec-driven project. Implement ` +
        `exactly one requirement — **${req.requirement}** — following the project's ` +
        `existing conventions. Do not touch unrelated files.`
    );

    const field = (camel: string, snake: string) => {
      const val = req[camel] !== undefined ? req[camel] : req[snake];
      return val === null || val === undefined ? "" : val;
    };

    const facts = [
      `- Requirement: ${req.requirement}`,
      `- Scenario ID: ${field("scenarioId", "scenario_id") || "(none)"}`,
      `- plan category: ${req.category || ""}`,
      `- Feature file: ${field("featureFile", "feature_file") || "(none declared)"}`,
      `- Test artifact (write this first — TDD): ${field("testArtifact", "test_artifact") || "(none declared)"}`,
      `- Production artifact: ${field("technicalArtifact", "technical_artifact") || "(none declared)"}`,
      `- Current status: ${req.status || "(none)"}`,
    ].join("\n");
    parts.push(AgentPrompt.section("Requirement facts", facts));

    if (opts.hint) {
      parts.push(AgentPrompt.section("Suggested approach", opts.hint));
    }

    const featureRel = String(field("featureFile", "feature_file") || "")
      .replace(/^`|`$/g, "")
      .trim();

    if (featureRel) {
      if (opts.featureContent) {
        parts.push(
          AgentPrompt.section(
            `Gherkin scenario (${featureRel})`,
            "```gherkin\n" + opts.featureContent.trimEnd() + "\n```"
          )
        );
      } else {
        parts.push(
          AgentPrompt.section(
            "Gherkin scenario",
            `The feature file \`${featureRel}\` does not exist yet. Create it from the ` +
              `requirement before writing code.`
          )
        );
      }
    }

    if (opts.aiRulesContent) {
      parts.push(
        AgentPrompt.section(
          "Project rules (AI_RULES.md — non-negotiable)",
          opts.aiRulesContent.trimEnd()
        )
      );
    }

    const baseRules = opts.stageRules || [
      "Write the test first against the technical artifact path declared in the requirement.",
      "Run the project test command; verify the test fails for the expected reason.",
      "Implement the requirement; verify the test passes.",
    ];

    const doneRules = [
      ...baseRules,
      "**Do not modify** `spec.md`, `AI_RULES.md`, or any `features/**/*.feature` — they are the project's source of truth.",
      "The harness will run `validate --strict-tdd` and the project test command. Both must pass.",
    ];
    parts.push(
      AgentPrompt.section(
        "Definition of done",
        doneRules.map((r, i) => `${i + 1}. ${r}`).join("\n")
      )
    );

    if (opts.previousFailure) {
      parts.push(
        AgentPrompt.section(
          `Previous attempt failed (attempt ${(opts.attempt || 2) - 1}` +
            `${opts.maxAttempts ? ` of ${opts.maxAttempts}` : ""})`,
          "The gate rejected the last attempt. Fix the specific failure below — do not " +
            "start over.\n\n```\n" +
            String(opts.previousFailure).trim().slice(-4000) +
            "\n```"
        )
      );
    }

    if (opts.reviewFindings) {
      parts.push(
        AgentPrompt.section(
          "Reviewer findings",
          "A reviewer read the previous attempt and reported the following. These are " +
            "advice, not a verdict: the gate decides, and a finding it does not care " +
            "about must not send you off-spec.\n\n```\n" +
            String(opts.reviewFindings).trim().slice(-4000) +
            "\n```"
        )
      );
    }

    return parts.join("\n");
  }

  private static section(title: string, body: string): string {
    return `## ${title}\n\n${body}\n`;
  }
}
