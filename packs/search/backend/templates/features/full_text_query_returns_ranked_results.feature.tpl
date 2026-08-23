Feature: Full-text query returns ranked results
  Scenario: Full-text query returns ranked results
    Given the index contains 10 documents containing 'invoice'
    When a user searches for 'invoice'
    Then SearchExecuted is emitted and the top 10 results are returned by relevance
