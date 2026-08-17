Feature: Indexing a new document makes it searchable
  Scenario: Indexing a new document makes it searchable
    GIVEN a document is created in the source-of-truth store
    WHEN the indexer processes the create event
    THEN DocumentIndexed is emitted and the document is returned for matching queries
