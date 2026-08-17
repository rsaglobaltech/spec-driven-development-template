Feature: Evaluation respects rollout percentage
  Scenario: Evaluation respects rollout percentage
    GIVEN a flag with 50% rollout in production
    WHEN 100 users are evaluated
    THEN approximately half receive value=true
