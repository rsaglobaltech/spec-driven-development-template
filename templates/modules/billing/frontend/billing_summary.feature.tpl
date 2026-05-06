Feature: Billing summary screen
  Scenario: User checks monthly settlement
    Given I am logged in
    When I navigate to the "/billing" page
    Then I should see my monthly settlement summary
