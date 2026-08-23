Feature: Paid invoices transition to Paid status
  Scenario: Paid invoices transition to Paid status
    Given an outstanding invoice
    When a successful payment is processed
    Then the invoice transitions to Paid and InvoicePaid is emitted
