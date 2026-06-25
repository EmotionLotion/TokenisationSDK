# Connector Policy

Governs use of **external connectors / MCP servers** (Linear, Atlassian/Jira,
Notion, Asana, GitHub via `gh`, Slack, etc.) from inside the harness. This is the
**Connectors** part of the six-part substrate. Connectors reach outside the repo,
so they carry the strictest defaults.

## Principles
1. **Repo state is the source of truth, not connectors.** The ordering and live
   state of the harness live in `task_graph.json` / `loop_state.json` / `STATE.md`.
   A connector may *mirror* or *report* that state; it must never *become* it.
2. **Reads are cheap, writes are publishing.** Reading from a connector is
   generally fine. Writing to one (creating issues/tickets/pages, posting
   messages, opening PRs, sending notifications) is an **outward-facing action**
   that may be cached or seen by others even if later deleted.

## Permissions

### Allowed without asking (read-only)
- Fetching context: reading an issue/ticket/page/PR referenced by a task.
- Searching a connector for prior art relevant to the active task.

### Requires explicit human authorization (writes / outward-facing)
- Creating or updating issues, tickets, pages, or comments.
- Posting to chat/Slack or sending notifications.
- Opening, updating, or merging pull requests; pushing branches.
- Anything that publishes harness internals (audit findings, security notes,
  reflection-log content) to a third party.

Authorization is **per-context and non-transitive**: approval to post one update
does not authorize the next.

## Unattended runs
- A `/loop`/cron/background run may use **read-only** connectors only.
- All connector **writes are Tier C** in `automation_policy.md` — never
  unattended. An automated run that needs a write must pause and hand off.

## Data-handling rules
- Do not send secrets, API keys, `.env*` contents, or `server/data/*.db`
  contents to any connector.
- Do not overclaim (security/compliance/production readiness) in connector
  writes any more than in the repo — the evidence rules of
  `verification_rules.md` apply to external posts too.
- Availability is not guaranteed: interactively-authenticated connectors may be
  absent in headless/cron runs. Never block the loop on a connector; degrade to
  repo-local state.

## Auth
Connector authentication is a human action (e.g. the relevant `authenticate`
flow). Agents do not attempt to acquire or store credentials.
