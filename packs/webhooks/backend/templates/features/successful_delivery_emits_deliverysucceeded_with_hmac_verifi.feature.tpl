Feature: Successful delivery emits DeliverySucceeded with HMAC verified
  Scenario: Successful delivery emits DeliverySucceeded with HMAC verified
    Given an active subscription with secret 's3cr3t'
    When an event 'order.created' is dispatched and the endpoint returns 200
    Then DeliverySucceeded is emitted with attempts=1
