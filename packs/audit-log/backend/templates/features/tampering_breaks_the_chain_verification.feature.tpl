Feature: Tampering breaks the chain verification
  Scenario: Tampering breaks the chain verification
    GIVEN an audit chain has been tampered with
    WHEN an auditor runs verification
    THEN AuditChainVerified is emitted with valid=false
