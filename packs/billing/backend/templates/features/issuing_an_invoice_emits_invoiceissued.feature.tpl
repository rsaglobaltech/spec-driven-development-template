Feature: Issuing an invoice emits InvoiceIssued
  Scenario: Issuing an invoice emits InvoiceIssued
    GIVEN a customer has billable line items
    WHEN the system issues an invoice
    THEN InvoiceIssued is emitted with the correct total
