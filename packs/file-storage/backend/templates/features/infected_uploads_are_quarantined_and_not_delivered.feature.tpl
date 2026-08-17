Feature: Infected uploads are quarantined and not delivered
  Scenario: Infected uploads are quarantined and not delivered
    GIVEN an upload that the scanner flags as malware
    WHEN the scan completes
    THEN FileQuarantined is emitted and download attempts return 403
