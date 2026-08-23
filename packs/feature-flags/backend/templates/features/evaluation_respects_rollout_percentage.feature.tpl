Feature: Evaluation respects rollout percentage
  Scenario: Evaluation respects rollout percentage
    Given a flag with 50% rollout in production
    When 100 users are evaluated
    Then approximately half receive value=true
