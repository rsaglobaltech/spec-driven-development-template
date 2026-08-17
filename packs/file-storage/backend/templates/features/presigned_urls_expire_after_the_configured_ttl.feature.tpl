Feature: Presigned URLs expire after the configured TTL
  Scenario: Presigned URLs expire after the configured TTL
    GIVEN a presigned URL issued 61 minutes ago with 1 hour TTL
    WHEN a user accesses the URL
    THEN the access is denied
