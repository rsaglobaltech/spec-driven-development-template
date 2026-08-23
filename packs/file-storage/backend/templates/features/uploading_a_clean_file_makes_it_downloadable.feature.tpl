Feature: Uploading a clean file makes it downloadable
  Scenario: Uploading a clean file makes it downloadable
    Given an authenticated user with available quota
    When the user uploads a 10MB PDF and the scan completes clean
    Then FileUploaded is emitted and the file is downloadable
