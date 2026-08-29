export class GenericCliTool implements ITool {
  constructor(
    public readonly name: string,
    public readonly description: string,
    public readonly csda: string,
    public readonly inputSchema: Record<string, unknown>
  ) {}

  public handler(args: Record<string, unknown>) {
    const dir = ProjectHelper.ensureProjectDir(args.projectDir);
    const argv = this.csda.split(" ");
    
    // We should be careful about write scope (C10-04).
  }
}
