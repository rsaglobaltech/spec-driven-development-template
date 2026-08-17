Feature: Reindex restores a corrupted index
  Scenario: Reindex restores a corrupted index
    GIVEN an index has missing documents
    WHEN an admin triggers a reindex of the source dataset
    THEN ReindexCompleted is emitted and all expected documents are searchable
