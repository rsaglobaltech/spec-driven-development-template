Feature: expand command
  As a developer
  I want to merge a domain pack into an existing project
  So that I get Gherkin scenarios and DDD artefacts without writing them from scratch

  Scenario: Dry-run expand shows what would be written
    Given an existing generated project
    And the parking-management domain pack
    When I run "expand" with "--dry-run"
    Then the command exits with code 0
    And no feature files are written

  Scenario: Expand enriches the traceability matrix
    Given an existing generated project
    And the parking-management domain pack
    When I run "expand" on the project
    Then the command exits with code 0
    And the project passes "validate"

  Scenario: Expand fails when pack root is missing
    When I run "expand" without "--pack-root"
    Then the command exits with a non-zero code
    And stderr contains "pack-root" or "pack"

  Scenario: Expand fails when required pack variables are not provided
    Given the parking-management domain pack
    When I run "expand" without providing "PROJECT_NAME"
    Then the command exits with a non-zero code
    And stderr contains "PROJECT_NAME"
