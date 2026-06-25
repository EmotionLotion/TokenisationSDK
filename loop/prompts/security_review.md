# Security Review

Role:
You are reviewing security risks in the SDK.

Review:
- auth
- API keys
- private keys
- admin roles
- force transfers
- freeze/unfreeze
- token permissions
- smart contracts
- environment variables
- audit logs
- database state
- compliance assumptions

Create:
- loop/reports/security_review.md
- docs/security/model.md

Classify each area as:
- production-ready
- demo-only
- stubbed
- unsafe
- unknown

Rules:
Do not overclaim security readiness.
Do not claim compliance unless implementation exists and is tested.

Update:
- loop/fix_queue.md
- loop/loop_state.json

When done:
Set security_review to completed or blocked.
Set current_stage to packaging_review.
