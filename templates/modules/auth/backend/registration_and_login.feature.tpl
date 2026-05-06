Feature: User registration and login
  Scenario: Successful registration
    Given a valid invitation or open registration policy
    When a user registers with valid credentials
    Then the account should be created

  Scenario: Successful login
    Given an active user account
    When the user logs in with valid credentials
    Then the system should return an access token
