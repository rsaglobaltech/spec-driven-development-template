repos:
  - repo: local
    hooks:
      - id: validate-specs
        name: Validate spec tree
        language: system
        entry: npx create-spec-driven-app validate .
        pass_filenames: false
        always_run: true
        stages: [pre-commit]
