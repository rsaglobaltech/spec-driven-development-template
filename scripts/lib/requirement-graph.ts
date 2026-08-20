/**
 * The requirement dependency graph, as `scripts/` reaches it.
 *
 * The graph is pure domain (`packages/core/src/domain/RequirementGraph`) and
 * reading `depends=` off the capability specs is infrastructure
 * (`DiskRequirementGraphRepository`). This module joins the two for the
 * command layer, which has a project directory and wants a graph.
 */

import { RequirementGraph } from "../../packages/core/src/domain/RequirementGraph";
import { DiskRequirementGraphRepository } from "../../packages/core/src/infrastructure/DiskRequirementGraphRepository";

export {
  RequirementGraph,
  DependencyMap,
  UnknownDependency,
  splitDependencies,
} from "../../packages/core/src/domain/RequirementGraph";

export {
  CAPABILITIES_DIR,
  readDeclaredDependencies,
} from "../../packages/core/src/infrastructure/DiskRequirementGraphRepository";

/**
 * The graph for a project, read from its capability specs.
 *
 * Replaces the former `RequirementGraph.fromProject` static, which put a
 * filesystem read on a domain class.
 */
export function requirementGraphFromProject(
  projectDir: string,
  requirementIds: readonly string[]
): RequirementGraph {
  const declared = new DiskRequirementGraphRepository().readDeclaredDependencies(projectDir);
  return RequirementGraph.fromDependencies(requirementIds, declared);
}
