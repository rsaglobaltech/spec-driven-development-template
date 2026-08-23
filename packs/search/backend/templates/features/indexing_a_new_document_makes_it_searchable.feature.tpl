Feature: Indexing a new document makes it searchable
  Scenario: Indexing a new document makes it searchable
    Given a document is created in the source-of-truth store
    When the indexer processes the create event
    Then DocumentIndexed is emitted and the document is returned for matching queries
