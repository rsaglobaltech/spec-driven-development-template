Feature: Recording an action emits AuditEntryRecorded
  Scenario: Recording an action emits AuditEntryRecorded
    Given a state-changing operation completes
    When the system records the audit entry
    Then AuditEntryRecorded is emitted with actor, action, and prevHash
