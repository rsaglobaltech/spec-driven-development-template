Feature: Sending a notification to an opted-in user succeeds
  Scenario: Sending a notification to an opted-in user succeeds
    GIVEN a user is opted in to email notifications
    WHEN the system sends a notification
    THEN NotificationQueued is emitted and the email provider is invoked
