Feature: Mobile baseline availability
  @REQ-000 @SCN-000
  Scenario: The app launches to its first screen from cold start
    Given the application is installed and has never been opened
    When the user launches it
    Then the first screen is presented without a crash
    And no network call is required to reach it
