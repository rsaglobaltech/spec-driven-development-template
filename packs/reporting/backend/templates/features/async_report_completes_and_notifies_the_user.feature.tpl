Feature: Async report completes and notifies the user
  Scenario: Async report completes and notifies the user
    GIVEN an enqueued report with 1M rows
    WHEN the worker completes the run
    THEN ReportCompleted is emitted and the user receives a notification
