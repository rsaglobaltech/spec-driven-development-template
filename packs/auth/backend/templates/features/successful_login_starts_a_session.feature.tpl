Feature: Successful login starts a session
  Scenario: Successful login starts a session
    GIVEN an unlocked account with valid credentials
    WHEN the user submits the correct password
    THEN a Session is created and SessionStarted is emitted
