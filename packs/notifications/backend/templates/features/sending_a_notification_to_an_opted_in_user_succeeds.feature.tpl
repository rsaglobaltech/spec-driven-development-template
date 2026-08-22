Feature: Sending a notification to an opted-in user succeeds
  Scenario: Sending a notification to an opted-in user succeeds
    Given a user is opted in to email notifications
    When the system sends a notification
    Then NotificationQueued is emitted and the email provider is invoked
