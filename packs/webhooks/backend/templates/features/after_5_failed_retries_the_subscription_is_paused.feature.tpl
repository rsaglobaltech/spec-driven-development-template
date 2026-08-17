Feature: After 5 failed retries the subscription is paused
  Scenario: After 5 failed retries the subscription is paused
    GIVEN a subscription with 4 prior consecutive delivery failures
    WHEN a 5th delivery attempt fails
    THEN SubscriptionPaused is emitted and no further deliveries are attempted
