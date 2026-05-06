Feature: Billing settlement
  Scenario: Monthly settlement is calculated
    Given a user with monthly consumption and production records
    When monthly settlement is executed
    Then the resulting credit or debit should be persisted
