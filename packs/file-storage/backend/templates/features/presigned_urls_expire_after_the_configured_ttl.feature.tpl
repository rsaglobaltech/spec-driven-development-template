Feature: Presigned URLs expire after the configured TTL
  Scenario: Presigned URLs expire after the configured TTL
    Given a presigned URL issued 61 minutes ago with 1 hour TTL
    When a user accesses the URL
    Then the access is denied
