# {{PROJECT_NAME}} — Authentication Module

This module documents authentication and account management for **{{PROJECT_NAME}}**
in the **{{DOMAIN}}** domain.

## Vision

Provide secure, auditable identity primitives that any feature can rely on:
account registration, credential validation, lockout, and session lifecycle.

## In scope

- Email + password registration and login
- Account lockout on repeated failed attempts
- Password reset via email
- Session start, listing, and revocation

## Out of scope

- Social login (OAuth, SAML) — see future RFCs
- Multi-factor authentication — separate module
- Authorization (RBAC, ABAC) — separate module

## Personas

- **NewUser** — has no account yet, wants to sign up
- **User** — has an account, wants to log in or manage their sessions
- **Admin** — needs to revoke compromised sessions or unlock accounts

## Cross-cutting concerns

- Passwords are hashed with **argon2id** (cost params per security ADR)
- All auth endpoints are rate-limited at the gateway
- Failed-login telemetry feeds the security monitoring stack
