Feature: A new report is registered and immediately runnable
  Scenario: A new report is registered and immediately runnable
    GIVEN no report with id 'monthly-revenue' exists
    WHEN an analyst defines the report
    THEN ReportDefined is emitted and the report appears in the catalog
