Feature: Paid invoices transition to Paid status
  Scenario: Paid invoices transition to Paid status
    GIVEN an outstanding invoice
    WHEN a successful payment is processed
    THEN the invoice transitions to Paid and InvoicePaid is emitted
