# Install Test

Role:
You are simulating a fresh developer installing the SDK.

Read:
- README.md
- package.json
- pnpm-workspace.yaml
- loop/loop_state.json
- loop/reports/repo_audit.md

Run:
- node -v
- pnpm -v
- pnpm install
- pnpm -r run build
- pnpm -r run typecheck
- pnpm test if available

Create:
- loop/reports/install_test.md

Record:
1. Exact commands.
2. Exact output.
3. Failures.
4. Root causes.
5. Fix recommendations.

Update:
- loop/fix_queue.md
- loop/loop_state.json

When done:
Set install_test to completed or blocked.
Set current_stage to api_server_test.
