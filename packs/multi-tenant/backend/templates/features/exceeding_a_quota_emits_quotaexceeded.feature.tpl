Feature: Exceeding a quota emits QuotaExceeded
  Scenario: Exceeding a quota emits QuotaExceeded
    GIVEN tenant 'acme' has used 99% of its storage quota
    WHEN tenant 'acme' attempts to write 100MB
    THEN QuotaExceeded is emitted and the write is rejected
