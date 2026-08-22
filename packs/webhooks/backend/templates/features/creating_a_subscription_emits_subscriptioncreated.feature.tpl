Feature: Creating a subscription emits SubscriptionCreated
  Scenario: Creating a subscription emits SubscriptionCreated
    Given no subscription exists for endpoint 'https://example.com/hook'
    When a consumer creates a subscription for events ['order.created']
    Then SubscriptionCreated is emitted and the endpoint will receive matching events
