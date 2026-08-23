Feature: Infected uploads are quarantined and not delivered
  Scenario: Infected uploads are quarantined and not delivered
    Given an upload that the scanner flags as malware
    When the scan completes
    Then FileQuarantined is emitted and download attempts return 403
