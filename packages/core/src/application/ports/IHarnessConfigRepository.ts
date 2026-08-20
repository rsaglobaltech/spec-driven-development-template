import { HarnessSettings } from "../../domain/HarnessConfig";

export interface IHarnessConfigRepository {
  /**
   * Reads harness configuration for the specified project directory.
   */
  readConfig(projectDir: string): Partial<HarnessSettings> | null;

  /**
   * Reads a file content from within the project if it exists.
   */
  readProjectFile(projectDir: string, relativePath: string): string | null;
}
