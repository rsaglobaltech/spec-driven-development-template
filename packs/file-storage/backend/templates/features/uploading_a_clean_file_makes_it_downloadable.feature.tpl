Feature: Uploading a clean file makes it downloadable
  Scenario: Uploading a clean file makes it downloadable
    GIVEN an authenticated user with available quota
    WHEN the user uploads a 10MB PDF and the scan completes clean
    THEN FileUploaded is emitted and the file is downloadable
