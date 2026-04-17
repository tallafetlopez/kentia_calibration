# HERKO Calibration Manager — PRD

## Original Problem Statement
Production-style web app for managing ECM calibration datasets with lifecycle control, approval workflow, deployment decisions, Vehicle_SW_ID generation, post-sales derived datasets, and full traceability.

## Architecture
- **Backend**: FastAPI + Motor (MongoDB async) + PyJWT + bcrypt
- **Frontend**: React 19 + React Router 7 + Tailwind + shadcn/ui + lucide-react
- **Database**: MongoDB (`herko_calibration` database)
- **Auth**: JWT (Bearer) stored in localStorage, email/password + role switching

## User Personas
- PD_Project_Manager — registers software releases, links A2L/DBC/DTC
- Calibration_Engineer — creates/edits datasets, labels, submits for approval
- PI_Engineering_Manager — final approval authority
- PI_Regulatory_Compliance_Specialist — regulatory review
- PD_Verification_Validation_Engineer — V&V review
- Configuration_Manager — release candidate selection, deprecation
- DM_Administrator — vehicle assignment, Vehicle_SW_ID generation
- Post_Sales_Engineer — post-sales/VIN-specific derived datasets

## What's Implemented (2026-04-17)

### Backend
- JWT auth: register, login, me, logout, switch-role, list-users, list-roles
- ECUs (ECM seeded)
- Software releases: CRUD, patch artefacts, validate→VALID_FOR_CALIBRATION
- Datasets: full CRUD, technical-validate, attach-vnv, submit-approval, review, approve, release-select, deprecate, derive-post-sales
- Labels: individual patch + mass-update with rule engine
- Vehicle_SW_IDs: create/list, first assignment transitions RELEASE_CANDIDATE→RELEASED
- Audit log auto-recording all state transitions and label changes
- Dataset comparison (diff) endpoint
- Traceability endpoint (SR→Dataset→Vehicle_SW_ID)
- Dashboard stats
- Seed endpoint (idempotent)

### Business rules implemented
- Cannot create DS from invalid SR / missing A2L
- REUSE_BASELINE restricted to VARIANT_SPECIFIC / POST_SALES / VIN_SPECIFIC
- Submit for approval requires tech validation PASS + changelog + V&V ref
- Final approval requires all 4 reviews ACCEPTED
- REWORK_REQUIRED resets reviews and returns to EDIT
- Release-select requires APPROVED
- RELEASE_CANDIDATE / RELEASED / DEPRECATED datasets are read-only
- Post-sales derived datasets only allow edits on parametrizable_in_customer=YES labels
- Regulatory + parametrizable-in-customer requires override justification
- Regulatory label change requires justification
- Deprecation requires justification, irreversible
- PRODUCTION context requires regulatory labels DOCUMENTED

### Frontend
- Login (split-screen with control-room image) + Register with role selection
- App shell with sidebar nav, top bar (ECU + role switcher)
- Dashboard: hero + KPIs + lifecycle tiles + quick actions + recent activity
- Software Releases list + detail (artefact editing, validation checklist, run validation)
- Dataset Catalogue: rich filters (lifecycle, context, mode, SW release, search)
- Dataset Detail: header with status + warnings, traceability bar, compare modal, tabs:
  - Overview: readiness checklist + label stats + state-gated action buttons
  - Labels: filter modified/regulatory/incomplete, inline edit dialog with rule enforcement
  - Changelog: summary + modified label list
  - Review & Approval: 4-domain review panel, role-gated actions, final approve
  - Deployment: decision + vehicle assignments
  - Audit Trail: entity-scoped audit log
- Review Center: UNDER_APPROVAL queue with per-domain status badges
- Release Center: candidate filter by SR+context with release-select flow, current RC list
- Vehicle Assignment: generate Vehicle_SW_IDs, full traceability table
- Traceability Explorer: SR→Dataset→Vehicle_SW_ID tree view
- Admin: users table, active-role switch, reseed demo data

### Seed data
- 9 demo users (password: password123)
- 1 ECU (ECM)
- 3 software releases (2 valid, 1 draft)
- 10 datasets across all 6 lifecycle states (incl. post-sales, deprecated, release candidate, released)
- 200 labels (20 per dataset, realistic ECM parameters)
- 2 Vehicle_SW_IDs

## Test status (2026-04-17)
- Backend: 41/41 tests passed (100%)
- Frontend: all UI flows verified
- Mocked: A2L parsing (uses seed template instead of real file parsing)

## Backlog (P1/P2)
- Real A2L file upload + parsing
- Real S37 binary import
- httpOnly cookie auth with refresh token rotation
- Brute force lockout (per playbook)
- Email notifications for reviewers
- Dataset label history timeline (diff per label across versions)
- Excel/CSV export of labels
- Visual graph for traceability (react-flow)
