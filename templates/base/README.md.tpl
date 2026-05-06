# 🚀 {{PROJECT_NAME}} - Spec-Driven Development

This project was generated from the SDD MVP template.

## 🌍 Context
- Project type: `{{PROJECT_TYPE}}`
- Domain: `{{DOMAIN}}`

## 🧱 Structure
- `spec.md`: business manifesto and goals.
- `AI_RULES.md`: AI execution contract.
- `features/`: acceptance criteria in Gherkin.
- `docs/specs/traceability.md`: Spec -> Feature -> Technical artifact mapping.
- `docs/specs/adr/`: architecture decision records.

## 🔄 Recommended workflow
1. Define or refine `spec.md`.
2. Adapt scenarios in `features/`.
3. Map scenarios in `docs/specs/traceability.md`.
4. Implement software until acceptance criteria pass.

## 🛠️ Support command
- Validate spec structure:
  - `../mvp-spec-template/scripts/validate_specs.sh .`
