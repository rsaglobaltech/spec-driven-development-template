/**
 * Where a project's declared requirement dependencies come from.
 *
 * The graph itself is pure domain; only the reading of `depends=` out of the
 * capability specs touches a disk, so that is the whole of this port.
 */
export interface IRequirementGraphRepository {
  /** `{ REQ-id: [REQ-id, …] }` for every requirement that declares a dependency. */
  readDeclaredDependencies(projectDir: string): Record<string, string[]>;
}
