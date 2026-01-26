# Implementation Plan: Missing Features

This document outlines the missing features from the SDK checklist and provides a detailed implementation plan for each.

---

## Executive Summary

| Category | Current | Target | Gap |
|----------|---------|--------|-----|
| A) Developer Primitives | 60% | 100% | Events, webhooks, sandbox |
| B) Compliance | 50% | 100% | KYC providers, clawback, audit exports |
| C) On-chain Toolkit | 70% | 100% | Asset registry, address registry |
| D) Financial Ops | 20% | 100% | Distributions, corporate actions, reconciliation |
| E) Data/Oracle Layer | 20% | 100% | Event ingestion, truth view |
| F) UI Components | 20% | 100% | Embeddable widgets |
| G) Integrations | 15% | 100% | Custody, payments, CRM |

---

## Priority Order

### Phase 1: Core Infrastructure (High Impact, Foundation)
1. **Event System + Webhooks** — Enables all async operations
2. **Audit Trail + Evidence Exports** — Compliance requirement
3. **Clawback Implementation** — Regulatory requirement

### Phase 2: Financial Operations (Revenue Critical)
4. **Vesting Schedules** — Complete issuance workflows
5. **Distribution Engine** — Dividends, interest payments
6. **Corporate Actions** — Splits, mergers, conversions

### Phase 3: Integrations (Enterprise Features)
7. **KYC Provider Integration** — Sumsub, Onfido, Jumio
8. **Custody Integration** — Fireblocks, BitGo
9. **Payment Rails** — Stablecoin + bank transfers

### Phase 4: Data & Observability
10. **Event Ingestion Pipeline** — External data feeds
11. **Truth View API** — Point-in-time queries
12. **Reconciliation Reports** — Chain vs books

### Phase 5: UI Components
13. **Embeddable KYC Widget**
14. **Investor Portal Components**
15. **Compliance Decision Viewer**

---

## Detailed Implementation Plans

---

## 1. Event System + Webhooks

### Current State
- No event emission from SDK or server
- No webhook delivery system
- No event persistence

### Target State
- All mutations emit typed events
- Webhooks delivered with retry logic
- Event log queryable via API

### Implementation

#### 1.1 Event Schema

```typescript
// server/src/events/types.ts
export interface DomainEvent {
  id: string;                    // UUID
  type: string;                  // e.g., "investor.created"
  version: string;               // Schema version "1.0"
  timestamp: string;             // ISO 8601
  source: string;                // "api" | "system" | "blockchain"
  correlationId: string;         // Request ID for tracing
  actor: {
    type: "user" | "system" | "api_key";
    id: string;
  };
  data: Record<string, unknown>; // Event-specific payload
  metadata: {
    orgId: string;
    projectId?: string;
  };
}

// Event types
export type EventType =
  // Investor events
  | "investor.created"
  | "investor.updated"
  | "investor.kyc.started"
  | "investor.kyc.approved"
  | "investor.kyc.rejected"
  | "investor.activated"
  | "investor.suspended"
  | "investor.wallet.added"
  | "investor.wallet.verified"
  // Asset events
  | "asset.created"
  | "asset.activated"
  | "asset.frozen"
  | "asset.valuation.updated"
  // Token events
  | "token.created"
  | "token.deployed"
  | "token.paused"
  | "token.unpaused"
  | "token.frozen"
  // Issuance events
  | "issuance.created"
  | "issuance.submitted"
  | "issuance.confirmed"
  | "issuance.failed"
  // Transfer events
  | "transfer.created"
  | "transfer.compliance.checked"
  | "transfer.approved"
  | "transfer.rejected"
  | "transfer.submitted"
  | "transfer.confirmed"
  | "transfer.failed"
  // Compliance events
  | "compliance.policy.created"
  | "compliance.policy.activated"
  | "compliance.decision.made"
  | "compliance.decision.overridden";
```

#### 1.2 Database Schema

```typescript
// server/src/db/schema/events.ts
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: varchar("type", { length: 100 }).notNull(),
  version: varchar("version", { length: 20 }).notNull().default("1.0"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  source: varchar("source", { length: 50 }).notNull(),
  correlationId: uuid("correlation_id"),
  actorType: varchar("actor_type", { length: 50 }).notNull(),
  actorId: varchar("actor_id", { length: 100 }).notNull(),
  data: jsonb("data").notNull(),
  orgId: uuid("org_id").notNull(),
  projectId: uuid("project_id"),
  // Indexing
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  secret: varchar("secret", { length: 100 }).notNull(), // For HMAC signing
  events: jsonb("events").notNull(), // ["investor.*", "transfer.confirmed"]
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  endpointId: uuid("endpoint_id").notNull().references(() => webhookEndpoints.id),
  eventId: uuid("event_id").notNull().references(() => events.id),
  status: varchar("status", { length: 20 }).notNull(), // pending, delivered, failed
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  nextRetryAt: timestamp("next_retry_at"),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

#### 1.3 Event Emitter Service

```typescript
// server/src/services/eventService.ts
export class EventService {
  async emit(event: Omit<DomainEvent, "id" | "timestamp">): Promise<DomainEvent> {
    const fullEvent: DomainEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    // 1. Persist event
    await db.insert(events).values(fullEvent);

    // 2. Queue webhook deliveries
    await this.queueWebhooks(fullEvent);

    // 3. Emit to in-process subscribers (for real-time)
    this.eventEmitter.emit(event.type, fullEvent);

    return fullEvent;
  }

  async queueWebhooks(event: DomainEvent): Promise<void> {
    // Find matching endpoints
    const endpoints = await db.query.webhookEndpoints.findMany({
      where: and(
        eq(webhookEndpoints.orgId, event.metadata.orgId),
        eq(webhookEndpoints.enabled, true)
      ),
    });

    for (const endpoint of endpoints) {
      if (this.matchesEventFilter(event.type, endpoint.events)) {
        await db.insert(webhookDeliveries).values({
          endpointId: endpoint.id,
          eventId: event.id,
          status: "pending",
          nextRetryAt: new Date(),
        });
      }
    }
  }

  private matchesEventFilter(eventType: string, filters: string[]): boolean {
    return filters.some(filter => {
      if (filter.endsWith(".*")) {
        return eventType.startsWith(filter.slice(0, -2));
      }
      return eventType === filter;
    });
  }
}
```

#### 1.4 Webhook Delivery Worker

```typescript
// server/src/workers/webhookWorker.ts
export class WebhookWorker {
  private readonly MAX_ATTEMPTS = 5;
  private readonly RETRY_DELAYS = [60, 300, 900, 3600, 86400]; // seconds

  async processDeliveries(): Promise<void> {
    const pending = await db.query.webhookDeliveries.findMany({
      where: and(
        eq(webhookDeliveries.status, "pending"),
        lte(webhookDeliveries.nextRetryAt, new Date())
      ),
      limit: 100,
    });

    for (const delivery of pending) {
      await this.deliver(delivery);
    }
  }

  private async deliver(delivery: WebhookDelivery): Promise<void> {
    const endpoint = await db.query.webhookEndpoints.findFirst({
      where: eq(webhookEndpoints.id, delivery.endpointId),
    });
    const event = await db.query.events.findFirst({
      where: eq(events.id, delivery.eventId),
    });

    const signature = this.sign(event, endpoint.secret);

    try {
      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-ID": delivery.id,
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        await db.update(webhookDeliveries)
          .set({ status: "delivered", responseStatus: response.status })
          .where(eq(webhookDeliveries.id, delivery.id));
      } else {
        await this.handleFailure(delivery, response.status, await response.text());
      }
    } catch (error) {
      await this.handleFailure(delivery, 0, error.message);
    }
  }

  private sign(event: DomainEvent, secret: string): string {
    return createHmac("sha256", secret)
      .update(JSON.stringify(event))
      .digest("hex");
  }

  private async handleFailure(delivery: WebhookDelivery, status: number, body: string): Promise<void> {
    const attempts = delivery.attempts + 1;

    if (attempts >= this.MAX_ATTEMPTS) {
      await db.update(webhookDeliveries)
        .set({ status: "failed", attempts, responseStatus: status, responseBody: body })
        .where(eq(webhookDeliveries.id, delivery.id));
    } else {
      const delay = this.RETRY_DELAYS[attempts - 1];
      await db.update(webhookDeliveries)
        .set({
          attempts,
          nextRetryAt: new Date(Date.now() + delay * 1000),
          responseStatus: status,
          responseBody: body,
        })
        .where(eq(webhookDeliveries.id, delivery.id));
    }
  }
}
```

#### 1.5 API Endpoints

```typescript
// server/src/routes/events.ts
router.get("/events", async (req, res) => {
  const { type, since, until, limit = 100, cursor } = req.query;
  // Return paginated event list
});

router.get("/events/:id", async (req, res) => {
  // Return single event
});

// server/src/routes/webhooks.ts
router.post("/webhooks", async (req, res) => {
  const { url, events, secret } = req.body;
  // Create webhook endpoint
});

router.get("/webhooks", async (req, res) => {
  // List webhook endpoints
});

router.delete("/webhooks/:id", async (req, res) => {
  // Delete webhook endpoint
});

router.get("/webhooks/:id/deliveries", async (req, res) => {
  // List delivery attempts
});

router.post("/webhooks/:id/test", async (req, res) => {
  // Send test event
});
```

#### 1.6 SDK Integration

```typescript
// sdk/src/modules/events.ts
export class EventsModule {
  async list(params?: { type?: string; since?: string; until?: string; limit?: number }): Promise<PaginatedResponse<DomainEvent>>;
  async get(id: string): Promise<DomainEvent>;
}

// sdk/src/modules/webhooks.ts
export class WebhooksModule {
  async create(input: { url: string; events: string[]; secret?: string }): Promise<WebhookEndpoint>;
  async list(): Promise<WebhookEndpoint[]>;
  async delete(id: string): Promise<void>;
  async test(id: string): Promise<void>;
  async listDeliveries(id: string): Promise<PaginatedResponse<WebhookDelivery>>;
}
```

### Files to Create/Modify

| File | Action |
|------|--------|
| `server/src/db/schema/events.ts` | Create |
| `server/src/events/types.ts` | Create |
| `server/src/services/eventService.ts` | Create |
| `server/src/workers/webhookWorker.ts` | Create |
| `server/src/routes/events.ts` | Create |
| `server/src/routes/webhooks.ts` | Create |
| `sdk/src/modules/events.ts` | Create |
| `sdk/src/modules/webhooks.ts` | Create |
| `sdk/src/ApiClient.ts` | Modify (add modules) |
| All existing services | Modify (emit events) |

### Estimated Effort
- Database schema: 1 hour
- Event service: 2 hours
- Webhook worker: 2 hours
- API routes: 2 hours
- SDK modules: 1 hour
- Integration into existing services: 3 hours
- **Total: ~11 hours**

---

## 2. Audit Trail + Evidence Exports

### Current State
- No formal audit logging
- No evidence pack generation
- No compliance export functionality

### Target State
- All actions logged with actor, timestamp, before/after state
- Evidence packs exportable (PDF + JSON)
- Regulatory report generation

### Implementation

#### 2.1 Audit Log Schema

```typescript
// server/src/db/schema/audit.ts
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),

  // Who
  actorType: varchar("actor_type", { length: 50 }).notNull(), // user, api_key, system
  actorId: varchar("actor_id", { length: 100 }).notNull(),
  actorEmail: varchar("actor_email", { length: 255 }),
  actorIp: varchar("actor_ip", { length: 45 }),

  // What
  action: varchar("action", { length: 100 }).notNull(), // e.g., "investor.approve_kyc"
  resourceType: varchar("resource_type", { length: 50 }).notNull(), // investor, token, transfer
  resourceId: uuid("resource_id").notNull(),

  // Context
  orgId: uuid("org_id").notNull(),
  projectId: uuid("project_id"),
  correlationId: uuid("correlation_id"),

  // State
  previousState: jsonb("previous_state"),
  newState: jsonb("new_state"),
  changes: jsonb("changes"), // Diff of what changed

  // Metadata
  reason: text("reason"), // Optional reason for action
  metadata: jsonb("metadata"),
});

// Index for efficient queries
// CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
// CREATE INDEX idx_audit_timestamp ON audit_logs(org_id, timestamp DESC);
```

#### 2.2 Audit Service

```typescript
// server/src/services/auditService.ts
export class AuditService {
  async log(entry: {
    action: string;
    resourceType: string;
    resourceId: string;
    previousState?: unknown;
    newState?: unknown;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const actor = this.getActor(); // From request context
    const changes = this.computeChanges(entry.previousState, entry.newState);

    await db.insert(auditLogs).values({
      ...entry,
      actorType: actor.type,
      actorId: actor.id,
      actorEmail: actor.email,
      actorIp: actor.ip,
      orgId: actor.orgId,
      projectId: actor.projectId,
      correlationId: getCorrelationId(),
      changes,
    });
  }

  private computeChanges(prev: unknown, next: unknown): Record<string, { from: unknown; to: unknown }> {
    if (!prev || !next) return {};

    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);

    for (const key of allKeys) {
      if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
        changes[key] = { from: prev[key], to: next[key] };
      }
    }

    return changes;
  }

  async getHistory(resourceType: string, resourceId: string): Promise<AuditLog[]> {
    return db.query.auditLogs.findMany({
      where: and(
        eq(auditLogs.resourceType, resourceType),
        eq(auditLogs.resourceId, resourceId)
      ),
      orderBy: [desc(auditLogs.timestamp)],
    });
  }
}
```

#### 2.3 Evidence Pack Generator

```typescript
// server/src/services/evidenceService.ts
export class EvidenceService {
  async generateInvestorPack(investorId: string): Promise<EvidencePack> {
    const investor = await db.query.investors.findFirst({ where: eq(investors.id, investorId) });
    const wallets = await db.query.investorWallets.findMany({ where: eq(investorWallets.investorId, investorId) });
    const kycRecords = await db.query.kycRecords.findMany({ where: eq(kycRecords.investorId, investorId) });
    const auditHistory = await this.auditService.getHistory("investor", investorId);

    return {
      generatedAt: new Date().toISOString(),
      type: "investor_evidence_pack",
      version: "1.0",
      subject: {
        type: "investor",
        id: investorId,
      },
      data: {
        investor,
        wallets,
        kycRecords,
      },
      auditTrail: auditHistory,
      attestation: this.generateAttestation(investor, auditHistory),
    };
  }

  async generateTransferPack(transferId: string): Promise<EvidencePack> {
    const transfer = await db.query.transfers.findFirst({ where: eq(transfers.id, transferId) });
    const complianceDecisions = await db.query.complianceDecisions.findMany({
      where: eq(complianceDecisions.entityId, transferId)
    });
    const fromInvestor = await db.query.investors.findFirst({ /* ... */ });
    const toInvestor = await db.query.investors.findFirst({ /* ... */ });
    const auditHistory = await this.auditService.getHistory("transfer", transferId);

    return {
      generatedAt: new Date().toISOString(),
      type: "transfer_evidence_pack",
      version: "1.0",
      subject: {
        type: "transfer",
        id: transferId,
      },
      data: {
        transfer,
        complianceDecisions,
        parties: {
          from: { investor: fromInvestor, kycStatus: fromInvestor.kycStatus },
          to: { investor: toInvestor, kycStatus: toInvestor.kycStatus },
        },
      },
      auditTrail: auditHistory,
      attestation: this.generateAttestation(transfer, auditHistory),
    };
  }

  async exportAsPDF(pack: EvidencePack): Promise<Buffer> {
    // Use puppeteer or pdfkit to generate PDF
  }

  async exportAsJSON(pack: EvidencePack): Promise<string> {
    return JSON.stringify(pack, null, 2);
  }

  private generateAttestation(data: unknown, audit: AuditLog[]): Attestation {
    const hash = createHash("sha256")
      .update(JSON.stringify({ data, audit }))
      .digest("hex");

    return {
      hash,
      algorithm: "sha256",
      timestamp: new Date().toISOString(),
    };
  }
}
```

#### 2.4 API Endpoints

```typescript
// server/src/routes/audit.ts
router.get("/audit/logs", async (req, res) => {
  const { resourceType, resourceId, actorId, since, until, limit } = req.query;
  // Return paginated audit logs
});

router.get("/audit/:resourceType/:resourceId", async (req, res) => {
  // Return audit history for specific resource
});

// server/src/routes/evidence.ts
router.get("/evidence/investor/:id", async (req, res) => {
  const pack = await evidenceService.generateInvestorPack(req.params.id);
  res.json(pack);
});

router.get("/evidence/investor/:id/pdf", async (req, res) => {
  const pack = await evidenceService.generateInvestorPack(req.params.id);
  const pdf = await evidenceService.exportAsPDF(pack);
  res.contentType("application/pdf").send(pdf);
});

router.get("/evidence/transfer/:id", async (req, res) => {
  const pack = await evidenceService.generateTransferPack(req.params.id);
  res.json(pack);
});

router.get("/evidence/token/:id/cap-table", async (req, res) => {
  // Point-in-time cap table with full audit trail
});
```

### Files to Create/Modify

| File | Action |
|------|--------|
| `server/src/db/schema/audit.ts` | Create |
| `server/src/services/auditService.ts` | Create |
| `server/src/services/evidenceService.ts` | Create |
| `server/src/routes/audit.ts` | Create |
| `server/src/routes/evidence.ts` | Create |
| `sdk/src/modules/audit.ts` | Create |
| All existing services | Modify (add audit logging) |

### Estimated Effort
- Database schema: 30 minutes
- Audit service: 2 hours
- Evidence service: 3 hours
- PDF generation: 2 hours
- API routes: 1 hour
- SDK module: 1 hour
- Integration: 2 hours
- **Total: ~11.5 hours**

---

## 3. Clawback Implementation

### Current State
- Freeze exists (stops all transfers)
- No targeted clawback (recover tokens from specific address)

### Target State
- Authorized roles can clawback tokens from any address
- Clawback requires compliance approval
- Full audit trail

### Implementation

#### 3.1 Smart Contract

```solidity
// contracts/src/tokens/ComplianceTokenUpgradeable.sol

// Add to existing contract
bytes32 public constant CLAWBACK_ROLE = keccak256("CLAWBACK_ROLE");

event TokensClawedBack(
    address indexed from,
    address indexed to,
    uint256 amount,
    string reason,
    address indexed operator
);

function clawback(
    address from,
    address to,
    uint256 amount,
    string calldata reason
) external onlyRole(CLAWBACK_ROLE) whenNotFrozen {
    require(from != address(0), "Invalid from address");
    require(to != address(0), "Invalid to address");
    require(balanceOf(from) >= amount, "Insufficient balance");

    // Bypass normal transfer checks - this is an administrative action
    _transfer(from, to, amount);

    emit TokensClawedBack(from, to, amount, reason, msg.sender);
}

function grantClawbackRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
    grantRole(CLAWBACK_ROLE, account);
}

function revokeClawbackRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
    revokeRole(CLAWBACK_ROLE, account);
}
```

#### 3.2 Server Implementation

```typescript
// server/src/services/tokenService.ts

async clawback(tokenId: string, input: {
  fromWallet: string;
  toWallet: string;
  amount: string;
  reason: string;
  idempotencyKey: string;
}): Promise<Clawback> {
  return db.transaction(async (tx) => {
    // 1. Verify token exists and is deployed
    const token = await tx.query.tokens.findFirst({ where: eq(tokens.id, tokenId) });
    if (!token || token.status !== "deployed") {
      throw new Error("Token not found or not deployed");
    }

    // 2. Create clawback record
    const clawback = await tx.insert(clawbacks).values({
      tokenId,
      fromWallet: input.fromWallet,
      toWallet: input.toWallet,
      amount: input.amount,
      reason: input.reason,
      status: "pending",
      idempotencyKey: input.idempotencyKey,
    }).returning();

    // 3. Submit to blockchain
    const txHash = await this.chainService.clawback(
      token.contractAddress,
      input.fromWallet,
      input.toWallet,
      input.amount,
      input.reason
    );

    // 4. Update status
    await tx.update(clawbacks)
      .set({ status: "submitted", txHash })
      .where(eq(clawbacks.id, clawback[0].id));

    // 5. Emit event
    await this.eventService.emit({
      type: "token.clawback.submitted",
      source: "api",
      actor: { type: "user", id: getCurrentUserId() },
      data: { tokenId, ...input, txHash },
      metadata: { orgId: token.orgId },
    });

    // 6. Audit log
    await this.auditService.log({
      action: "token.clawback",
      resourceType: "token",
      resourceId: tokenId,
      reason: input.reason,
      metadata: { fromWallet: input.fromWallet, toWallet: input.toWallet, amount: input.amount },
    });

    return clawback[0];
  });
}
```

#### 3.3 API & SDK

```typescript
// server/src/routes/tokens.ts
router.post("/tokens/:id/clawback", async (req, res) => {
  const { fromWallet, toWallet, amount, reason, idempotencyKey } = req.body;
  const result = await tokenService.clawback(req.params.id, { fromWallet, toWallet, amount, reason, idempotencyKey });
  res.json(result);
});

// sdk/src/modules/tokens.ts
async clawback(tokenId: string, input: {
  fromWallet: string;
  toWallet: string;
  amount: string;
  reason: string;
  idempotencyKey: string;
}): Promise<Clawback> {
  const validated = validate(ClawbackInputSchema, input);
  const response = await this.http.post(`/api/v1/tokens/${tokenId}/clawback`, validated, {
    idempotencyKey: validated.idempotencyKey,
  });
  return response.data;
}
```

### Estimated Effort
- Smart contract update: 1 hour
- Database schema: 30 minutes
- Service implementation: 2 hours
- API & SDK: 1 hour
- Tests: 2 hours
- **Total: ~6.5 hours**

---

## 4. Vesting Schedules

### Current State
- Tranches with `lockedUntil` date exist
- No gradual vesting (cliff + linear)

### Target State
- Define vesting schedules (cliff, linear, milestone-based)
- Track vested vs unvested amounts
- Automatic unlocking

### Implementation

#### 4.1 Database Schema

```typescript
// server/src/db/schema/vesting.ts
export const vestingSchedules = pgTable("vesting_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenId: uuid("token_id").notNull().references(() => tokens.id),
  investorId: uuid("investor_id").notNull().references(() => investors.id),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull(),

  // Vesting parameters
  totalAmount: decimal("total_amount", { precision: 78, scale: 0 }).notNull(),
  vestingType: varchar("vesting_type", { length: 20 }).notNull(), // linear, cliff, milestone
  startDate: timestamp("start_date").notNull(),
  cliffDate: timestamp("cliff_date"), // Optional cliff
  endDate: timestamp("end_date").notNull(),
  cliffAmount: decimal("cliff_amount", { precision: 78, scale: 0 }), // Amount released at cliff

  // Current state
  vestedAmount: decimal("vested_amount", { precision: 78, scale: 0 }).notNull().default("0"),
  releasedAmount: decimal("released_amount", { precision: 78, scale: 0 }).notNull().default("0"),

  // Status
  status: varchar("status", { length: 20 }).notNull().default("active"), // active, completed, cancelled

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const vestingMilestones = pgTable("vesting_milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  scheduleId: uuid("schedule_id").notNull().references(() => vestingSchedules.id),
  name: varchar("name", { length: 100 }).notNull(),
  amount: decimal("amount", { precision: 78, scale: 0 }).notNull(),
  targetDate: timestamp("target_date"),
  completedAt: timestamp("completed_at"),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, completed
});
```

#### 4.2 Vesting Service

```typescript
// server/src/services/vestingService.ts
export class VestingService {
  async createSchedule(input: CreateVestingInput): Promise<VestingSchedule> {
    // Validate and create vesting schedule
  }

  async calculateVestedAmount(scheduleId: string, asOfDate?: Date): Promise<string> {
    const schedule = await this.getSchedule(scheduleId);
    const now = asOfDate || new Date();

    if (now < schedule.startDate) return "0";
    if (now >= schedule.endDate) return schedule.totalAmount;

    // Check cliff
    if (schedule.cliffDate && now < schedule.cliffDate) {
      return "0";
    }

    switch (schedule.vestingType) {
      case "linear":
        return this.calculateLinearVesting(schedule, now);
      case "cliff":
        return now >= schedule.cliffDate ? schedule.totalAmount : "0";
      case "milestone":
        return this.calculateMilestoneVesting(schedule);
      default:
        throw new Error(`Unknown vesting type: ${schedule.vestingType}`);
    }
  }

  private calculateLinearVesting(schedule: VestingSchedule, now: Date): string {
    const totalDuration = schedule.endDate.getTime() - schedule.startDate.getTime();
    const elapsed = now.getTime() - schedule.startDate.getTime();
    const percentage = elapsed / totalDuration;

    let vested = BigInt(schedule.totalAmount) * BigInt(Math.floor(percentage * 10000)) / 10000n;

    // Add cliff amount if past cliff
    if (schedule.cliffAmount && schedule.cliffDate && now >= schedule.cliffDate) {
      vested = vested > BigInt(schedule.cliffAmount) ? vested : BigInt(schedule.cliffAmount);
    }

    return vested.toString();
  }

  async releaseVestedTokens(scheduleId: string): Promise<void> {
    const schedule = await this.getSchedule(scheduleId);
    const vestedAmount = await this.calculateVestedAmount(scheduleId);
    const releasableAmount = BigInt(vestedAmount) - BigInt(schedule.releasedAmount);

    if (releasableAmount <= 0n) return;

    // Transfer releasable tokens
    await this.tokenService.transfer({
      tokenId: schedule.tokenId,
      fromWallet: VESTING_ESCROW_ADDRESS,
      toWallet: schedule.walletAddress,
      amount: releasableAmount.toString(),
      idempotencyKey: `vesting-release-${scheduleId}-${Date.now()}`,
    });

    // Update released amount
    await db.update(vestingSchedules)
      .set({
        releasedAmount: (BigInt(schedule.releasedAmount) + releasableAmount).toString(),
        vestedAmount,
      })
      .where(eq(vestingSchedules.id, scheduleId));
  }
}
```

### Estimated Effort
- Database schema: 1 hour
- Vesting service: 4 hours
- API endpoints: 1 hour
- SDK module: 1 hour
- Worker for automatic releases: 2 hours
- Tests: 2 hours
- **Total: ~11 hours**

---

## 5. Distribution Engine

### Current State
- No dividend/distribution functionality

### Target State
- Define distribution (dividend, interest, redemption)
- Calculate per-holder amounts from cap table
- Execute on-chain + record off-chain
- Support stablecoin and bank rails

### Implementation

#### 5.1 Database Schema

```typescript
// server/src/db/schema/distributions.ts
export const distributions = pgTable("distributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenId: uuid("token_id").notNull().references(() => tokens.id),

  // Distribution details
  type: varchar("type", { length: 20 }).notNull(), // dividend, interest, redemption, other
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),

  // Amount
  totalAmount: decimal("total_amount", { precision: 78, scale: 0 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull(), // USD, USDC, ETH, etc.
  amountPerToken: decimal("amount_per_token", { precision: 78, scale: 18 }).notNull(),

  // Timing
  recordDate: timestamp("record_date").notNull(), // Snapshot date for cap table
  paymentDate: timestamp("payment_date").notNull(),

  // Status
  status: varchar("status", { length: 20 }).notNull().default("draft"), // draft, approved, processing, completed, cancelled

  // Execution
  paymentMethod: varchar("payment_method", { length: 20 }).notNull(), // on_chain, bank_transfer, mixed

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const distributionPayments = pgTable("distribution_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  distributionId: uuid("distribution_id").notNull().references(() => distributions.id),
  investorId: uuid("investor_id").notNull().references(() => investors.id),
  walletAddress: varchar("wallet_address", { length: 42 }),

  // Amounts
  tokenBalance: decimal("token_balance", { precision: 78, scale: 0 }).notNull(), // At record date
  paymentAmount: decimal("payment_amount", { precision: 78, scale: 0 }).notNull(),

  // Payment details
  paymentMethod: varchar("payment_method", { length: 20 }).notNull(),
  txHash: varchar("tx_hash", { length: 66 }),
  bankReference: varchar("bank_reference", { length: 100 }),

  // Status
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, processing, completed, failed

  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});
```

#### 5.2 Distribution Service

```typescript
// server/src/services/distributionService.ts
export class DistributionService {
  async create(input: CreateDistributionInput): Promise<Distribution> {
    // Create distribution record
  }

  async calculatePayments(distributionId: string): Promise<DistributionPayment[]> {
    const distribution = await this.getDistribution(distributionId);

    // Get cap table at record date
    const capTable = await this.tokenService.getCapTableAtDate(
      distribution.tokenId,
      distribution.recordDate
    );

    const payments: DistributionPayment[] = [];

    for (const holder of capTable.holders) {
      const paymentAmount = BigInt(holder.balance) * BigInt(distribution.amountPerToken) / BigInt(10 ** 18);

      payments.push({
        distributionId,
        investorId: holder.investorId,
        walletAddress: holder.walletAddress,
        tokenBalance: holder.balance,
        paymentAmount: paymentAmount.toString(),
        paymentMethod: this.determinePaymentMethod(holder),
        status: "pending",
      });
    }

    return payments;
  }

  async approve(distributionId: string): Promise<void> {
    const distribution = await this.getDistribution(distributionId);

    // Calculate and create payment records
    const payments = await this.calculatePayments(distributionId);
    await db.insert(distributionPayments).values(payments);

    // Update status
    await db.update(distributions)
      .set({ status: "approved" })
      .where(eq(distributions.id, distributionId));
  }

  async execute(distributionId: string): Promise<void> {
    const payments = await db.query.distributionPayments.findMany({
      where: and(
        eq(distributionPayments.distributionId, distributionId),
        eq(distributionPayments.status, "pending")
      ),
    });

    for (const payment of payments) {
      if (payment.paymentMethod === "on_chain") {
        await this.executeOnChainPayment(payment);
      } else {
        await this.queueBankPayment(payment);
      }
    }
  }

  private async executeOnChainPayment(payment: DistributionPayment): Promise<void> {
    // Transfer stablecoin to investor wallet
    const txHash = await this.chainService.transferStablecoin(
      payment.walletAddress,
      payment.paymentAmount
    );

    await db.update(distributionPayments)
      .set({ status: "completed", txHash, completedAt: new Date() })
      .where(eq(distributionPayments.id, payment.id));
  }
}
```

### Estimated Effort
- Database schema: 1 hour
- Distribution service: 5 hours
- On-chain payment execution: 3 hours
- Bank payment integration: 4 hours (depends on provider)
- API endpoints: 2 hours
- SDK module: 1 hour
- **Total: ~16 hours**

---

## 6. Corporate Actions Engine

### Current State
- No corporate actions support

### Target State
- Stock splits
- Reverse splits
- Token conversions
- Mergers/consolidations

### Implementation

#### 6.1 Database Schema

```typescript
// server/src/db/schema/corporateActions.ts
export const corporateActions = pgTable("corporate_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenId: uuid("token_id").notNull().references(() => tokens.id),

  type: varchar("type", { length: 30 }).notNull(), // split, reverse_split, conversion, merger
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),

  // Parameters (type-specific)
  parameters: jsonb("parameters").notNull(),
  // For split: { ratio: "2:1" }
  // For conversion: { newTokenId: "...", conversionRate: "1.5" }
  // For merger: { survivingTokenId: "...", exchangeRatio: "0.8" }

  // Timing
  announcementDate: timestamp("announcement_date").notNull(),
  recordDate: timestamp("record_date").notNull(),
  effectiveDate: timestamp("effective_date").notNull(),

  // Status
  status: varchar("status", { length: 20 }).notNull().default("announced"),
  // announced, approved, processing, completed, cancelled

  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const corporateActionEntitlements = pgTable("corporate_action_entitlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  corporateActionId: uuid("corporate_action_id").notNull(),
  investorId: uuid("investor_id").notNull(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull(),

  // Before
  originalBalance: decimal("original_balance", { precision: 78, scale: 0 }).notNull(),

  // After
  newBalance: decimal("new_balance", { precision: 78, scale: 0 }),
  newTokenId: uuid("new_token_id"), // For conversions

  status: varchar("status", { length: 20 }).notNull().default("pending"),
  processedAt: timestamp("processed_at"),
});
```

#### 6.2 Corporate Action Service

```typescript
// server/src/services/corporateActionService.ts
export class CorporateActionService {
  async createSplit(tokenId: string, input: {
    name: string;
    ratio: string; // e.g., "2:1" means 2 new for 1 old
    recordDate: Date;
    effectiveDate: Date;
  }): Promise<CorporateAction> {
    const [newShares, oldShares] = input.ratio.split(":").map(Number);

    return db.insert(corporateActions).values({
      tokenId,
      type: "split",
      name: input.name,
      parameters: { ratio: input.ratio, multiplier: newShares / oldShares },
      recordDate: input.recordDate,
      effectiveDate: input.effectiveDate,
      announcementDate: new Date(),
      status: "announced",
    }).returning();
  }

  async executeSplit(actionId: string): Promise<void> {
    const action = await this.getCorporateAction(actionId);
    const { multiplier } = action.parameters;

    // Get cap table at record date
    const capTable = await this.tokenService.getCapTableAtDate(action.tokenId, action.recordDate);

    // Calculate entitlements
    for (const holder of capTable.holders) {
      const newBalance = BigInt(holder.balance) * BigInt(Math.floor(multiplier * 1000000)) / 1000000n;

      await db.insert(corporateActionEntitlements).values({
        corporateActionId: actionId,
        investorId: holder.investorId,
        walletAddress: holder.walletAddress,
        originalBalance: holder.balance,
        newBalance: newBalance.toString(),
        status: "pending",
      });
    }

    // Execute on-chain (mint additional tokens)
    for (const entitlement of entitlements) {
      const additionalTokens = BigInt(entitlement.newBalance) - BigInt(entitlement.originalBalance);
      if (additionalTokens > 0n) {
        await this.tokenService.mint(action.tokenId, entitlement.walletAddress, additionalTokens.toString());
      }
    }

    // Update max supply
    await this.tokenService.updateMaxSupply(action.tokenId, newMaxSupply);
  }
}
```

### Estimated Effort
- Database schema: 1 hour
- Corporate action service: 6 hours
- Split/reverse split: 3 hours
- Conversion logic: 3 hours
- API endpoints: 2 hours
- SDK module: 1 hour
- **Total: ~16 hours**

---

## 7-15: Remaining Features (Summary)

Due to length, here's a summary of the remaining implementations:

### 7. KYC Provider Integration (~12 hours)
- Abstract KYC provider interface
- Sumsub integration
- Onfido integration
- Webhook handlers for status updates

### 8. Custody Integration (~16 hours)
- Abstract custody provider interface
- Fireblocks integration
- BitGo integration
- Transaction signing flow

### 9. Payment Rails (~20 hours)
- Stablecoin payments (USDC, USDT)
- Bank transfer integration (Plaid, Stripe)
- Payment status tracking

### 10. Event Ingestion Pipeline (~12 hours)
- External data source connectors
- Event normalization
- Storage and indexing

### 11. Truth View API (~8 hours)
- Point-in-time queries
- Change tracking
- Snapshot generation

### 12. Reconciliation Reports (~10 hours)
- Chain state fetching
- Database comparison
- Discrepancy reporting

### 13. Embeddable KYC Widget (~16 hours)
- React component library
- Iframe embed option
- Customization options

### 14. Investor Portal Components (~20 hours)
- Holdings dashboard
- Document viewer
- Payout history
- Transaction history

### 15. Compliance Decision Viewer (~8 hours)
- Decision timeline
- Rule-by-rule breakdown
- Appeal workflow

---

## Total Estimated Effort

| Phase | Features | Hours |
|-------|----------|-------|
| Phase 1 | Events, Audit, Clawback | ~29 hours |
| Phase 2 | Vesting, Distributions, Corporate Actions | ~43 hours |
| Phase 3 | KYC, Custody, Payments | ~48 hours |
| Phase 4 | Event Ingestion, Truth View, Reconciliation | ~30 hours |
| Phase 5 | UI Components | ~44 hours |
| **Total** | | **~194 hours** |

---

## Execution Order

1. **Events + Webhooks** — Foundation for everything else
2. **Audit Trail** — Required for compliance
3. **Clawback** — Regulatory requirement
4. **Vesting** — Completes issuance flow
5. **Distributions** — Revenue-generating feature
6. **KYC Integration** — Enterprise requirement
7. ... continue based on priority

Ready to start implementing?
