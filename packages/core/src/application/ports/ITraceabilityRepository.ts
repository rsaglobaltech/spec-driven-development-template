export interface ITraceabilityRepository {
  /**
   * Reads traceability matrix content.
   */
  readTraceability(projectDir: string): string | null;

  /**
   * Writes traceability matrix content.
   */
  writeTraceability(projectDir: string, content: string): void;
}
