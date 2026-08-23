Feature: Refunds cannot exceed the original payment
  Scenario: Refunds cannot exceed the original payment
    Given a payment of 100 has been settled
    When an operator attempts a refund of 150
    Then the refund is rejected
