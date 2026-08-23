Feature: Issuing an invoice emits InvoiceIssued
  Scenario: Issuing an invoice emits InvoiceIssued
    Given a customer has billable line items
    When the system issues an invoice
    Then InvoiceIssued is emitted with the correct total
