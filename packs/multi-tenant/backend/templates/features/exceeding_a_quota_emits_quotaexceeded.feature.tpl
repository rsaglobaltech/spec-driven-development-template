Feature: Exceeding a quota emits QuotaExceeded
  Scenario: Exceeding a quota emits QuotaExceeded
    Given tenant 'acme' has used 99% of its storage quota
    When tenant 'acme' attempts to write 100MB
    Then QuotaExceeded is emitted and the write is rejected
