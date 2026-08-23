Feature: Reindex restores a corrupted index
  Scenario: Reindex restores a corrupted index
    Given an index has missing documents
    When an admin triggers a reindex of the source dataset
    Then ReindexCompleted is emitted and all expected documents are searchable
