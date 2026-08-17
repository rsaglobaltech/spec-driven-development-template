Feature: Successful delivery emits DeliverySucceeded with HMAC verified
  Scenario: Successful delivery emits DeliverySucceeded with HMAC verified
    GIVEN an active subscription with secret 's3cr3t'
    WHEN an event 'order.created' is dispatched and the endpoint returns 200
    THEN DeliverySucceeded is emitted with attempts=1
