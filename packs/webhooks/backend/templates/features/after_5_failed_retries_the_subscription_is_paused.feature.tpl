Feature: After 5 failed retries the subscription is paused
  Scenario: After 5 failed retries the subscription is paused
    Given a subscription with 4 prior consecutive delivery failures
    When a 5th delivery attempt fails
    Then SubscriptionPaused is emitted and no further deliveries are attempted
