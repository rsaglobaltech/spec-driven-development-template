Feature: Dashboard KPI data
  Scenario: User retrieves KPI summary
    Given a user with available analytics data
    When the user requests daily KPI summary
    Then the system should return the configured KPIs
