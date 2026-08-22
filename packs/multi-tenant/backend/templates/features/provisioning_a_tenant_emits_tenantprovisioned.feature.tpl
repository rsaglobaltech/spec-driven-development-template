Feature: Provisioning a tenant emits TenantProvisioned
  Scenario: Provisioning a tenant emits TenantProvisioned
    Given no tenant exists with id 'acme'
    When an admin provisions a tenant with name 'Acme'
    Then TenantProvisioned is emitted and the tenant is queryable
