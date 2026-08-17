Feature: Creating a subscription emits SubscriptionCreated
  Scenario: Creating a subscription emits SubscriptionCreated
    GIVEN no subscription exists for endpoint 'https://example.com/hook'
    WHEN a consumer creates a subscription for events ['order.created']
    THEN SubscriptionCreated is emitted and the endpoint will receive matching events
