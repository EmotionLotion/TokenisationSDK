# Repo Audit

Role:
You are auditing TokenisationSDK for external developer usability.

Read:
- README.md
- package.json
- pnpm-workspace.yaml
- sdk/
- packages/
- server/
- contracts/
- examples/
- docs/
- loop/loop_state.json
- loop/developer_journey.md

Do not modify production code.

Tasks:
1. Explain what this SDK is supposed to do.
2. Map the repo structure.
3. Identify the minimum path from clone to working product.
4. Identify missing docs.
5. Identify broken or unclear commands.
6. Identify incomplete, stubbed, fake, or overclaimed features.
7. Identify what blocks an external developer.

Create:
- loop/reports/repo_audit.md
- loop/reports/developer_path.md
- loop/reports/missing_docs.md

Update:
- loop/fix_queue.md
- loop/loop_state.json

When done:
Set repo_audit to completed.
Set current_stage to install_test.
