Feature: Five failed logins lock the account
  Scenario: Five failed logins lock the account
    Given an account has 4 prior failed attempts in the last 15 minutes
    When a 5th invalid login is attempted
    Then the account is locked and AccountLocked is emitted
