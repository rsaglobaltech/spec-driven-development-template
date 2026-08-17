Feature: Five failed logins lock the account
  Scenario: Five failed logins lock the account
    GIVEN an account has 4 prior failed attempts in the last 15 minutes
    WHEN a 5th invalid login is attempted
    THEN the account is locked and AccountLocked is emitted
