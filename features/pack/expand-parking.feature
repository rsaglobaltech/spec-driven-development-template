Feature: expand with parking-management domain pack
  As a developer building a smart parking application
  I want to expand my spec-driven project with the parking-management pack
  So that I get Gherkin scenarios, DDD artefacts, and a traceability matrix
  without writing them from scratch

  Background:
    Given a project generated with valid config
    And the parking-management domain pack

  Scenario: Expand writes Gherkin feature files
    When I run "expand" on the project
    Then the command exits with code 0
    And the output directory contains "features"

  Scenario: Expand enriches the traceability matrix
    When I run "expand" on the project
    Then the command exits with code 0
    And the project passes "validate"

  Scenario: Expanded project contains at least one feature file
    When I run "expand" on the project
    Then the command exits with code 0
    And the output directory contains "features"

  Scenario: Dry-run expand reports what would be written without modifying files
    When I run "expand" with "--dry-run"
    Then the command exits with code 0
    And no feature files are written

  Scenario: Expand fails when pack-root does not exist
    When I run "expand" without "--pack-root"
    Then the command exits with a non-zero code
    And stderr contains "pack-root" or "pack"

  Scenario: Expand fails when required variables are missing
    When I run "expand" without providing "PROJECT_NAME"
    Then the command exits with a non-zero code
    And stderr contains "PROJECT_NAME"

  Scenario: Expand is idempotent — running twice does not duplicate traceability rows
    When I run "expand" on the project
    And I run "expand" on the project
    Then the command exits with code 0
    And the project passes "validate"
