Feature: Successful login starts a session
  Scenario: Successful login starts a session
    Given an unlocked account with valid credentials
    When the user submits the correct password
    Then a Session is created and SessionStarted is emitted
