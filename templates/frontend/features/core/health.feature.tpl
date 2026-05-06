Feature: Frontend baseline availability
  Scenario: Main entry page is reachable
    Given the web application is running
    When I navigate to the "/" route
    Then I should see the main application shell
