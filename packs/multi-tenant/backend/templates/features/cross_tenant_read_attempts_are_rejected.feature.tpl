Feature: Cross-tenant read attempts are rejected
  Scenario: Cross-tenant read attempts are rejected
    Given a request is scoped to tenant 'acme'
    When the request tries to read data belonging to tenant 'globex'
    Then the access is denied
