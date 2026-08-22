Feature: A new report is registered and immediately runnable
  Scenario: A new report is registered and immediately runnable
    Given no report with id 'monthly-revenue' exists
    When an analyst defines the report
    Then ReportDefined is emitted and the report appears in the catalog
