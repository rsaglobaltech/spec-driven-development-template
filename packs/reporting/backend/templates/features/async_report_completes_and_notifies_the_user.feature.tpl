Feature: Async report completes and notifies the user
  Scenario: Async report completes and notifies the user
    Given an enqueued report with 1M rows
    When the worker completes the run
    Then ReportCompleted is emitted and the user receives a notification
