import { DomainPack, RequirementModel, ScenarioModel } from "./DomainPack";

export interface RequirementDelta {
  requirement: RequirementModel;
  scenarios: ScenarioModel[];
  kind: "added" | "modified" | "removed";
}

export interface PackDiffSummary {
  packId: string;
  fromVersion: string;
  toVersion: string;
  added: RequirementDelta[];
  modified: RequirementDelta[];
  removed: RequirementDelta[];
}

export class SpecDiff {
  public static comparePacks(basePack: DomainPack, targetPack: DomainPack): PackDiffSummary {
    const baseReqs = basePack.getRequirementsById();
    const baseScenarios = basePack.getScenariosByRequirement();

    const targetReqs = targetPack.getRequirementsById();
    const targetScenarios = targetPack.getScenariosByRequirement();

    const added: RequirementDelta[] = [];
    const modified: RequirementDelta[] = [];
    const removed: RequirementDelta[] = [];

    // Check target against base
    for (const [id, req] of targetReqs) {
      const scenarios = targetScenarios.get(id) || [];
      if (!baseReqs.has(id)) {
        added.push({ requirement: req, scenarios, kind: "added" });
      } else {
        const baseReq = baseReqs.get(id)!;
        const baseScn = baseScenarios.get(id) || [];
        const baseFp = DomainPack.computeRequirementFingerprint(baseReq, baseScn);
        const targetFp = DomainPack.computeRequirementFingerprint(req, scenarios);

        if (baseFp !== targetFp) {
          modified.push({ requirement: req, scenarios, kind: "modified" });
        }
      }
    }

    // Check for removals
    for (const [id, req] of baseReqs) {
      if (!targetReqs.has(id)) {
        const scenarios = baseScenarios.get(id) || [];
        removed.push({ requirement: req, scenarios, kind: "removed" });
      }
    }

    return {
      packId: targetPack.packId || basePack.packId,
      fromVersion: basePack.version,
      toVersion: targetPack.version,
      added,
      modified,
      removed,
    };
  }
}
