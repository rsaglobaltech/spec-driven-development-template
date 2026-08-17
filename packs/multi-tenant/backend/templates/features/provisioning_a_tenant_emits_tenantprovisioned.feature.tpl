Feature: Provisioning a tenant emits TenantProvisioned
  Scenario: Provisioning a tenant emits TenantProvisioned
    GIVEN no tenant exists with id 'acme'
    WHEN an admin provisions a tenant with name 'Acme'
    THEN TenantProvisioned is emitted and the tenant is queryable
