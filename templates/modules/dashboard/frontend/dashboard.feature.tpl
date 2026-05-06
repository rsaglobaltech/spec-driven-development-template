Feature: Dashboard visualization
  Scenario: User views KPI cards
    Given I am logged in
    When I open the "/dashboard" page
    Then I should see KPI cards with current metrics
