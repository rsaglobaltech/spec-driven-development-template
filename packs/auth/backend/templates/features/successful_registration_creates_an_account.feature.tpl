Feature: Successful registration creates an account
  Scenario: Successful registration creates an account
    GIVEN no account exists for the email
    WHEN the user submits valid registration data
    THEN the account is created and AccountRegistered is emitted
