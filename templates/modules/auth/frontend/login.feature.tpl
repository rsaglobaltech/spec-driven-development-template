Feature: Login experience
  Scenario: User signs in from login page
    Given I am on the "/login" page
    When I submit valid credentials
    Then I should be redirected to the main dashboard
