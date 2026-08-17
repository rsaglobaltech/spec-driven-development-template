Feature: Refunds cannot exceed the original payment
  Scenario: Refunds cannot exceed the original payment
    GIVEN a payment of 100 has been settled
    WHEN an operator attempts a refund of 150
    THEN the refund is rejected
