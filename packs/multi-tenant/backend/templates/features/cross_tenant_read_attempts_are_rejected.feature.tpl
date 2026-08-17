Feature: Cross-tenant read attempts are rejected
  Scenario: Cross-tenant read attempts are rejected
    GIVEN a request is scoped to tenant 'acme'
    WHEN the request tries to read data belonging to tenant 'globex'
    THEN the access is denied
