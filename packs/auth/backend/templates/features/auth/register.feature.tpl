Feature: Account registration
  As a new {{DOMAIN}} user
  I want to register a {{PROJECT_NAME}} account
  So that I can access protected features

  Scenario: Successful registration
    Given no account exists for "alice@example.com"
    When I register with email "alice@example.com" and a strong password
    Then the account is created
    And the event "AccountRegistered" is emitted
    And I receive a confirmation email
