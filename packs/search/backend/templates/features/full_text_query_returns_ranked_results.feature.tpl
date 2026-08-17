Feature: Full-text query returns ranked results
  Scenario: Full-text query returns ranked results
    GIVEN the index contains 10 documents containing 'invoice'
    WHEN a user searches for 'invoice'
    THEN SearchExecuted is emitted and the top 10 results are returned by relevance
