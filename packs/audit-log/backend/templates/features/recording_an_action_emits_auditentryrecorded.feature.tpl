Feature: Recording an action emits AuditEntryRecorded
  Scenario: Recording an action emits AuditEntryRecorded
    GIVEN a state-changing operation completes
    WHEN the system records the audit entry
    THEN AuditEntryRecorded is emitted with actor, action, and prevHash
