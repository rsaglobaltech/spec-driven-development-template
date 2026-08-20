export interface RequirementModel {
  id: string;
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  [key: string]: any;
}

export interface ScenarioModel {
  id: string;
  requirement_id?: string;
  scenario?: string;
  use_case?: string;
  command?: string;
  aggregate?: string;
  events?: string[];
  target?: string;
  [key: string]: any;
}

export interface PackRawModel {
  schema_version?: number;
  id?: string;
  title?: string;
  version?: string;
  requirements?: RequirementModel[];
  scenarios?: ScenarioModel[];
  outputs?: {
    files?: Array<{ template: string; target: string }>;
    specs?: Array<{ capability: string; file: string }>;
  };
  [key: string]: any;
}

export class DomainPack {
  public constructor(
    public readonly packId: string,
    public readonly model: PackRawModel,
    public readonly version: string = ""
  ) {}

  public get requirements(): RequirementModel[] {
    return Array.isArray(this.model?.requirements) ? this.model.requirements : [];
  }

  public get scenarios(): ScenarioModel[] {
    return Array.isArray(this.model?.scenarios) ? this.model.scenarios : [];
  }

  public getRequirementsById(): Map<string, RequirementModel> {
    const out = new Map<string, RequirementModel>();
    for (const req of this.requirements) {
      if (req && req.id) out.set(String(req.id), req);
    }
    return out;
  }

  public getScenariosByRequirement(): Map<string, ScenarioModel[]> {
    const out = new Map<string, ScenarioModel[]>();
    for (const sc of this.scenarios) {
      if (!sc || !sc.requirement_id) continue;
      const key = String(sc.requirement_id);
      if (!out.has(key)) out.set(key, []);
      out.get(key)!.push(sc);
    }
    return out;
  }

  public static computeRequirementFingerprint(
    req: RequirementModel,
    scenarios: ScenarioModel[] = []
  ): string {
    const norm = (v: any) => String(v === undefined || v === null ? "" : v).trim();
    const scenarioPart = (scenarios || [])
      .map((sc) =>
        [
          norm(sc.id),
          norm(sc.scenario),
          norm(sc.use_case),
          norm(sc.command),
          norm(sc.aggregate),
          (Array.isArray(sc.events) ? sc.events : []).map(norm).sort().join(","),
        ].join("|")
      )
      .sort()
      .join("\n");

    return [
      norm(req.title),
      norm(req.description),
      norm(req.priority),
      norm(req.status),
      scenarioPart,
    ].join("\n");
  }
}
