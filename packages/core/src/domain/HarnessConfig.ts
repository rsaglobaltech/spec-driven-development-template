export interface HarnessSettings {
  agent: string;
  testCmd: string;
  maxAttempts: number;
  concurrency: number;
  promptPrefix: string;
  push: boolean;
  remote: string;
  prCmd: string;
  /** Profile per attempt; the last rung repeats. Empty means one agent throughout. */
  attemptProfiles: string[];
  /** Advisory profile run before each retry, or "" for none. */
  reviewProfile: string;
  /** Profile name to the shell command it resolves to. */
  profileAgents: Record<string, string>;
}

export class HarnessConfig {
  public static readonly FILENAME = "harness.config.yaml";
  public static readonly DEFAULT_SETTINGS: HarnessSettings = {
    agent: "",
    testCmd: "",
    maxAttempts: 3,
    concurrency: 1,
    promptPrefix: "",
    push: false,
    remote: "origin",
    prCmd: "",
    attemptProfiles: [],
    reviewProfile: "",
    profileAgents: {},
  };

  public constructor(public readonly settings: HarnessSettings) {}

  public static merge(
    fileConfig: Partial<HarnessSettings> | null,
    cliArgs: Partial<HarnessSettings>
  ): HarnessConfig {
    const file = fileConfig || {};
    return new HarnessConfig({
      agent: cliArgs.agent || file.agent || HarnessConfig.DEFAULT_SETTINGS.agent,
      testCmd: cliArgs.testCmd || file.testCmd || HarnessConfig.DEFAULT_SETTINGS.testCmd,
      maxAttempts:
        cliArgs.maxAttempts || file.maxAttempts || HarnessConfig.DEFAULT_SETTINGS.maxAttempts,
      concurrency:
        cliArgs.concurrency || file.concurrency || HarnessConfig.DEFAULT_SETTINGS.concurrency,
      promptPrefix:
        cliArgs.promptPrefix || file.promptPrefix || HarnessConfig.DEFAULT_SETTINGS.promptPrefix,
      push:
        cliArgs.push !== undefined
          ? cliArgs.push
          : file.push !== undefined
            ? file.push
            : HarnessConfig.DEFAULT_SETTINGS.push,
      remote: cliArgs.remote || file.remote || HarnessConfig.DEFAULT_SETTINGS.remote,
      prCmd: cliArgs.prCmd || file.prCmd || HarnessConfig.DEFAULT_SETTINGS.prCmd,
      attemptProfiles: file.attemptProfiles || HarnessConfig.DEFAULT_SETTINGS.attemptProfiles,
      reviewProfile: file.reviewProfile || HarnessConfig.DEFAULT_SETTINGS.reviewProfile,
      profileAgents: file.profileAgents || HarnessConfig.DEFAULT_SETTINGS.profileAgents,
    });
  }
}
