Feature: Successful registration creates an account
  Scenario: Successful registration creates an account
    Given no account exists for the email
    When the user submits valid registration data
    Then the account is created and AccountRegistered is emitted
