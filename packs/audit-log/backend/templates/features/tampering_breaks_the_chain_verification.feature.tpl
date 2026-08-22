Feature: Tampering breaks the chain verification
  Scenario: Tampering breaks the chain verification
    Given an audit chain has been tampered with
    When an auditor runs verification
    Then AuditChainVerified is emitted with valid=false
