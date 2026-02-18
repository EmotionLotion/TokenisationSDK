/**
 * OpenAPI 3.0.3 path definitions for all API endpoints.
 * Auto-merged into the swagger spec via openapi.ts.
 */

// Helper to create standard responses
const ok = (desc: string, schema?: any) => ({
  200: { description: desc, content: schema ? { 'application/json': { schema } } : undefined },
  401: { $ref: '#/components/responses/Unauthorized' },
});
const created = (desc: string, schema?: any) => ({
  201: { description: desc, content: schema ? { 'application/json': { schema } } : undefined },
  400: { $ref: '#/components/responses/BadRequest' },
  401: { $ref: '#/components/responses/Unauthorized' },
});
const list = (desc: string) => ({
  200: { description: desc, content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { type: 'object' } }, count: { type: 'integer' } } } } } },
  401: { $ref: '#/components/responses/Unauthorized' },
});
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const pag = [{ $ref: '#/components/parameters/limitParam' }, { $ref: '#/components/parameters/offsetParam' }];
const json = (props: Record<string, any>, required?: string[]) => ({
  required: true, content: { 'application/json': { schema: { type: 'object', properties: props, ...(required ? { required } : {}) } } },
});

export const additionalTags = [
  { name: 'Parties', description: 'Party management and KYC' },
  { name: 'KYC', description: 'KYC verification workflows' },
  { name: 'Custody', description: 'Key management and signing' },
  { name: 'Relayer', description: 'Transaction relay and chain interaction' },
  { name: 'Gas', description: 'Gas estimation and pricing' },
  { name: 'Indexer', description: 'On-chain event indexing' },
  { name: 'EventBus', description: 'Internal event bus and subscriptions' },
  { name: 'Idempotency', description: 'Idempotency key management' },
  { name: 'Issuance', description: 'Primary issuance offerings and allocations' },
  { name: 'Redemption', description: 'Token redemption workflows' },
  { name: 'Vesting', description: 'Token vesting schedules' },
  { name: 'Corporate Actions', description: 'Dividends, splits, and corporate events' },
  { name: 'Payment Rails', description: 'Fiat on/off-ramp integrations (Stripe, Circle)' },
  { name: 'Reports', description: 'Report generation and download' },
  { name: 'Export', description: 'CSV exports and evidence packs' },
  { name: 'Metrics', description: 'Dashboard metrics and analytics' },
  { name: 'NAV', description: 'Net Asset Value and valuation' },
  { name: 'Scheduler', description: 'Scheduled job management' },
  { name: 'SSE', description: 'Server-Sent Events for real-time updates' },
  { name: 'Themes', description: 'White-label theming' },
  { name: 'Accreditation', description: 'Investor accreditation verification' },
  { name: 'Tickets', description: 'Airline ticket NFT lifecycle' },
  { name: 'Hotels', description: 'Hotel reservation NFT lifecycle' },
  { name: 'Car Rentals', description: 'Car rental NFT lifecycle' },
  { name: 'Concerts', description: 'Concert ticket NFT lifecycle' },
  { name: 'Boarding Passes', description: 'Digital boarding pass generation' },
  { name: 'Flight Oracle', description: 'Flight status oracle integration' },
  { name: 'Wallet Pass', description: 'Apple/Google Wallet pass generation' },
  { name: 'GPU Compute', description: 'DePIN GPU node tokenization' },
  { name: 'Prediction Market', description: 'Flight delay prediction markets' },
  { name: 'Travel Shield', description: 'Travel insurance policies' },
  { name: 'Proof of Funds', description: 'ZK proof of funds verification' },
  { name: 'DePIN', description: 'Decentralized physical infrastructure' },
  { name: 'Chains', description: 'Blockchain network configuration' },
  { name: 'Events', description: 'Asset event log' },
];

export const paths: Record<string, any> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH
  // ═══════════════════════════════════════════════════════════════════════════
  '/auth/register': {
    post: { tags: ['Auth'], summary: 'Register a new user', requestBody: json({ email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 }, name: { type: 'string' } }, ['email', 'password']), responses: created('User registered'), security: [] },
  },
  '/auth/login': {
    post: { tags: ['Auth'], summary: 'Login', requestBody: json({ email: { type: 'string', format: 'email' }, password: { type: 'string' } }, ['email', 'password']), responses: { 200: { description: 'Login successful', content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' }, refreshToken: { type: 'string' }, user: { type: 'object' } } } } } }, 401: { $ref: '#/components/responses/Unauthorized' } }, security: [] },
  },
  '/auth/refresh': {
    post: { tags: ['Auth'], summary: 'Refresh JWT token', requestBody: json({ refreshToken: { type: 'string' } }, ['refreshToken']), responses: ok('Token refreshed'), security: [] },
  },
  '/auth/me': {
    get: { tags: ['Auth'], summary: 'Get current user', responses: ok('Current user details'), security: [{ BearerAuth: [] }] },
  },
  '/auth/api-keys': {
    post: { tags: ['Auth'], summary: 'Create API key', requestBody: json({ name: { type: 'string' }, scopes: { type: 'array', items: { type: 'string' } } }, ['name']), responses: created('API key created') },
    get: { tags: ['Auth'], summary: 'List API keys', responses: list('API keys') },
  },
  '/auth/api-keys/{id}': {
    delete: { tags: ['Auth'], summary: 'Delete API key', parameters: [idParam], responses: ok('API key deleted') },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSETS
  // ═══════════════════════════════════════════════════════════════════════════
  '/assets': {
    post: { tags: ['Assets'], summary: 'Create a new asset', requestBody: json({ projectId: { type: 'string', format: 'uuid' }, name: { type: 'string' }, description: { type: 'string' }, assetType: { type: 'string' }, jurisdiction: { type: 'string' }, totalValue: { type: 'number' }, currency: { type: 'string' }, metadata: { type: 'object' } }, ['name', 'assetType', 'jurisdiction']), responses: created('Asset created') },
    get: { tags: ['Assets'], summary: 'List assets', parameters: [{ name: 'projectId', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'assetType', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Assets') },
  },
  '/assets/{id}': {
    get: { tags: ['Assets'], summary: 'Get asset by ID', parameters: [idParam], responses: ok('Asset details') },
    patch: { tags: ['Assets'], summary: 'Update asset', parameters: [idParam], requestBody: json({ name: { type: 'string' }, description: { type: 'string' }, metadata: { type: 'object' } }), responses: ok('Asset updated') },
  },
  '/assets/{id}/submit-verification': { post: { tags: ['Assets'], summary: 'Submit asset for verification', parameters: [idParam], responses: ok('Submitted') } },
  '/assets/{id}/verify': { post: { tags: ['Assets'], summary: 'Verify asset', parameters: [idParam], responses: ok('Verified') } },
  '/assets/{id}/activate': { post: { tags: ['Assets'], summary: 'Activate asset', parameters: [idParam], responses: ok('Activated') } },
  '/assets/{id}/freeze': { post: { tags: ['Assets'], summary: 'Freeze asset', parameters: [idParam], requestBody: json({ reason: { type: 'string' } }, ['reason']), responses: ok('Frozen') } },
  '/assets/{id}/unfreeze': { post: { tags: ['Assets'], summary: 'Unfreeze asset', parameters: [idParam], responses: ok('Unfrozen') } },
  '/assets/{id}/close': { post: { tags: ['Assets'], summary: 'Close asset', parameters: [idParam], responses: ok('Closed') } },
  '/assets/{id}/timeline': { get: { tags: ['Assets'], summary: 'Get asset event timeline', parameters: [idParam], responses: list('Timeline events') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // TOKENS
  // ═══════════════════════════════════════════════════════════════════════════
  '/tokens': {
    post: { tags: ['Tokens'], summary: 'Create a new token', requestBody: json({ projectId: { type: 'string', format: 'uuid' }, assetId: { type: 'string', format: 'uuid' }, name: { type: 'string' }, symbol: { type: 'string' }, decimals: { type: 'integer' }, standard: { type: 'string', enum: ['ERC-3643', 'ERC-20', 'ERC-721', 'ERC-1155'] }, totalSupply: { type: 'string' }, chainId: { type: 'integer' } }, ['name', 'symbol', 'totalSupply', 'chainId']), responses: created('Token created') },
    get: { tags: ['Tokens'], summary: 'List tokens', parameters: [{ name: 'projectId', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'chainId', in: 'query', schema: { type: 'integer' } }, ...pag], responses: list('Tokens') },
  },
  '/tokens/{id}': {
    get: { tags: ['Tokens'], summary: 'Get token by ID', parameters: [idParam], responses: ok('Token details') },
    patch: { tags: ['Tokens'], summary: 'Update token', parameters: [idParam], requestBody: json({ metadata: { type: 'object' } }), responses: ok('Updated') },
  },
  '/tokens/{id}/deploy': { post: { tags: ['Tokens'], summary: 'Deploy token contract', parameters: [idParam], requestBody: json({ deployerAddress: { type: 'string' } }, ['deployerAddress']), responses: ok('Deployment initiated') } },
  '/tokens/{id}/confirm-deployment': { post: { tags: ['Tokens'], summary: 'Confirm token deployment', parameters: [idParam], requestBody: json({ contractAddress: { type: 'string' }, txHash: { type: 'string' }, blockNumber: { type: 'integer' } }, ['contractAddress', 'txHash', 'blockNumber']), responses: ok('Confirmed') } },
  '/tokens/{id}/pause': { post: { tags: ['Tokens'], summary: 'Pause token', parameters: [idParam], responses: ok('Paused') } },
  '/tokens/{id}/unpause': { post: { tags: ['Tokens'], summary: 'Unpause token', parameters: [idParam], responses: ok('Unpaused') } },
  '/tokens/{id}/freeze': { post: { tags: ['Tokens'], summary: 'Freeze token', parameters: [idParam], requestBody: json({ reason: { type: 'string' } }, ['reason']), responses: ok('Frozen') } },
  '/tokens/{tokenId}/tranches': {
    post: { tags: ['Tokens'], summary: 'Create tranche', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ name: { type: 'string' }, supply: { type: 'string' }, restrictions: { type: 'object' } }, ['name', 'supply']), responses: created('Tranche created') },
    get: { tags: ['Tokens'], summary: 'List tranches', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: list('Tranches') },
  },
  '/tokens/{tokenId}/issue': { post: { tags: ['Tokens'], summary: 'Issue tokens to investor', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ investorId: { type: 'string', format: 'uuid' }, walletAddress: { type: 'string' }, amount: { type: 'string' } }, ['investorId', 'walletAddress', 'amount']), responses: created('Tokens issued') } },
  '/tokens/{tokenId}/redeem': { post: { tags: ['Tokens'], summary: 'Redeem tokens', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ investorId: { type: 'string', format: 'uuid' }, walletAddress: { type: 'string' }, amount: { type: 'string' } }, ['investorId', 'walletAddress', 'amount']), responses: ok('Redeemed') } },
  '/tokens/{tokenId}/cap-table': { get: { tags: ['Tokens'], summary: 'Get cap table', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('Cap table', { type: 'object', properties: { positions: { type: 'array', items: { $ref: '#/components/schemas/LedgerPosition' } }, totalSupply: { type: 'string' }, holderCount: { type: 'integer' } } }) } },
  '/tokens/{tokenId}/positions': { get: { tags: ['Tokens'], summary: 'List token positions', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, ...pag], responses: list('Positions') } },
  '/tokens/{tokenId}/balance': { get: { tags: ['Tokens'], summary: 'Get wallet balance', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'wallet', in: 'query', required: true, schema: { type: 'string' } }], responses: ok('Balance') } },
  '/tokens/{tokenId}/burn': { post: { tags: ['Tokens'], summary: 'Burn tokens', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ fromWallet: { type: 'string' }, amount: { type: 'string' }, reason: { type: 'string' } }, ['fromWallet', 'amount']), responses: ok('Burned') } },
  '/tokens/{tokenId}/policies': { post: { tags: ['Tokens'], summary: 'Attach compliance policy', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ policyId: { type: 'string', format: 'uuid' }, priority: { type: 'integer' } }, ['policyId']), responses: ok('Policy attached') } },
  '/tokens/{tokenId}/clawback': { post: { tags: ['Tokens'], summary: 'Initiate clawback', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ fromWallet: { type: 'string' }, toWallet: { type: 'string' }, amount: { type: 'string' }, reason: { type: 'string' }, idempotencyKey: { type: 'string' } }, ['fromWallet', 'toWallet', 'amount', 'reason', 'idempotencyKey']), responses: created('Clawback initiated') } },
  '/tokens/{tokenId}/clawbacks': { get: { tags: ['Tokens'], summary: 'List clawbacks', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: list('Clawbacks') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLIANCE
  // ═══════════════════════════════════════════════════════════════════════════
  '/compliance/policies': {
    post: { tags: ['Compliance'], summary: 'Create compliance policy', requestBody: json({ name: { type: 'string' }, description: { type: 'string' }, type: { type: 'string', enum: ['transfer', 'issuance', 'redemption'] }, rules: { type: 'array', items: { $ref: '#/components/schemas/Rule' } } }, ['name', 'type', 'rules']), responses: created('Policy created', { $ref: '#/components/schemas/Policy' }) },
    get: { tags: ['Compliance'], summary: 'List policies', parameters: [{ name: 'type', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Policies') },
  },
  '/compliance/policies/{id}': {
    get: { tags: ['Compliance'], summary: 'Get policy', parameters: [idParam], responses: ok('Policy', { $ref: '#/components/schemas/Policy' }) },
    patch: { tags: ['Compliance'], summary: 'Update policy', parameters: [idParam], requestBody: json({ name: { type: 'string' }, rules: { type: 'array', items: { $ref: '#/components/schemas/Rule' } } }), responses: ok('Updated') },
    delete: { tags: ['Compliance'], summary: 'Archive policy', parameters: [idParam], responses: ok('Archived') },
  },
  '/compliance/policies/{id}/versions': {
    post: { tags: ['Compliance'], summary: 'Create policy version', parameters: [idParam], requestBody: json({ rules: { type: 'array', items: { $ref: '#/components/schemas/Rule' } }, changelog: { type: 'string' } }, ['rules']), responses: created('Version created') },
    get: { tags: ['Compliance'], summary: 'List policy versions', parameters: [idParam], responses: list('Policy versions') },
  },
  '/compliance/decisions/evaluate': { post: { tags: ['Compliance'], summary: 'Evaluate transfer compliance', requestBody: json({ tokenId: { type: 'string', format: 'uuid' }, fromWallet: { type: 'string' }, toWallet: { type: 'string' }, amount: { type: 'string' }, context: { type: 'object' } }, ['tokenId', 'fromWallet', 'toWallet', 'amount']), responses: ok('Decision', { $ref: '#/components/schemas/ComplianceDecision' }) } },
  '/compliance/decisions/transfer': { post: { tags: ['Compliance'], summary: 'Evaluate transfer decision', requestBody: json({ tokenId: { type: 'string', format: 'uuid' }, fromWallet: { type: 'string' }, toWallet: { type: 'string' }, amount: { type: 'string' } }, ['tokenId', 'fromWallet', 'toWallet', 'amount']), responses: ok('Transfer decision') } },
  '/compliance/decisions/issuance': { post: { tags: ['Compliance'], summary: 'Evaluate issuance decision', requestBody: json({ tokenId: { type: 'string', format: 'uuid' }, toWallet: { type: 'string' }, amount: { type: 'string' } }, ['tokenId', 'toWallet', 'amount']), responses: ok('Issuance decision') } },
  '/compliance/decisions': { get: { tags: ['Compliance'], summary: 'List decisions', parameters: [{ name: 'type', in: 'query', schema: { type: 'string' } }, { name: 'result', in: 'query', schema: { type: 'string', enum: ['allow', 'deny'] } }, ...pag], responses: list('Decisions') } },
  '/compliance/decisions/{id}': { get: { tags: ['Compliance'], summary: 'Get decision', parameters: [idParam], responses: ok('Decision', { $ref: '#/components/schemas/ComplianceDecision' }) } },
  '/compliance/decisions/{id}/verify': { get: { tags: ['Compliance'], summary: 'Verify decision signature', parameters: [idParam], responses: ok('Verification result') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT
  // ═══════════════════════════════════════════════════════════════════════════
  '/audit/logs': {
    get: { tags: ['Audit'], summary: 'List audit logs', parameters: [{ name: 'resourceType', in: 'query', schema: { type: 'string' } }, { name: 'action', in: 'query', schema: { type: 'string' } }, { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } }, { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } }, ...pag], responses: list('Audit logs') },
  },
  '/audit/logs/{id}': { get: { tags: ['Audit'], summary: 'Get audit log entry', parameters: [idParam], responses: ok('Log entry', { $ref: '#/components/schemas/AuditLogEntry' }) } },
  '/audit/logs/{id}/verify': { get: { tags: ['Audit'], summary: 'Verify log integrity', parameters: [idParam], responses: ok('Integrity check result') } },
  '/audit/trail/{resourceType}/{resourceId}': { get: { tags: ['Audit'], summary: 'Get audit trail for resource', parameters: [{ name: 'resourceType', in: 'path', required: true, schema: { type: 'string' } }, { name: 'resourceId', in: 'path', required: true, schema: { type: 'string' } }], responses: list('Audit trail') } },
  '/audit/chain/verify': { get: { tags: ['Audit'], summary: 'Verify hash chain', parameters: [{ name: 'startDate', in: 'query', schema: { type: 'string', format: 'date-time' } }, { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date-time' } }], responses: ok('Chain verification result') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROJECTS
  // ═══════════════════════════════════════════════════════════════════════════
  '/projects': {
    post: { tags: ['Projects'], summary: 'Create project', requestBody: json({ name: { type: 'string' }, description: { type: 'string' }, jurisdiction: { type: 'string' }, assetType: { type: 'string' }, settings: { type: 'object' }, metadata: { type: 'object' } }, ['name']), responses: created('Project created', { $ref: '#/components/schemas/Project' }) },
    get: { tags: ['Projects'], summary: 'List projects', parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'jurisdiction', in: 'query', schema: { type: 'string' } }, { name: 'search', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Projects') },
  },
  '/projects/{id}': {
    get: { tags: ['Projects'], summary: 'Get project', parameters: [idParam], responses: ok('Project', { $ref: '#/components/schemas/Project' }) },
    patch: { tags: ['Projects'], summary: 'Update project', parameters: [idParam], requestBody: json({ name: { type: 'string' }, description: { type: 'string' }, metadata: { type: 'object' } }), responses: ok('Updated') },
    delete: { tags: ['Projects'], summary: 'Delete project', parameters: [idParam], responses: ok('Deleted') },
  },
  '/projects/{id}/stats': { get: { tags: ['Projects'], summary: 'Get project stats', parameters: [idParam], responses: ok('Project statistics') } },
  '/projects/{id}/documents': { get: { tags: ['Projects'], summary: 'List project documents', parameters: [idParam], responses: list('Documents') } },
  '/projects/documents': {
    post: { tags: ['Projects'], summary: 'Create document', requestBody: json({ projectId: { type: 'string', format: 'uuid' }, type: { type: 'string' }, name: { type: 'string' }, uri: { type: 'string' }, sha256: { type: 'string' } }, ['type', 'name', 'uri', 'sha256']), responses: created('Document created') },
    get: { tags: ['Projects'], summary: 'List all documents', parameters: [...pag], responses: list('Documents') },
  },
  '/projects/documents/upload-url': { post: { tags: ['Projects'], summary: 'Generate upload URL', requestBody: json({ fileName: { type: 'string' }, contentType: { type: 'string' } }, ['fileName', 'contentType']), responses: ok('Upload URL') } },
  '/projects/documents/download-url': { post: { tags: ['Projects'], summary: 'Generate download URL', requestBody: json({ uri: { type: 'string' } }, ['uri']), responses: ok('Download URL') } },
  '/projects/documents/{id}': {
    get: { tags: ['Projects'], summary: 'Get document', parameters: [idParam], responses: ok('Document') },
    patch: { tags: ['Projects'], summary: 'Update document', parameters: [idParam], responses: ok('Updated') },
    delete: { tags: ['Projects'], summary: 'Delete document', parameters: [idParam], responses: ok('Deleted') },
  },
  '/projects/documents/{id}/verify': { post: { tags: ['Projects'], summary: 'Verify document', parameters: [idParam], responses: ok('Verified') } },
  '/projects/documents/{id}/reject': { post: { tags: ['Projects'], summary: 'Reject document', parameters: [idParam], requestBody: json({ reason: { type: 'string' } }), responses: ok('Rejected') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // PARTIES
  // ═══════════════════════════════════════════════════════════════════════════
  '/parties': {
    post: { tags: ['Parties'], summary: 'Create party', requestBody: json({ name: { type: 'string' }, type: { type: 'string' }, roles: { type: 'array', items: { type: 'string' } }, jurisdiction: { type: 'string' }, metadata: { type: 'object' } }, ['name', 'type', 'roles', 'jurisdiction']), responses: created('Party created') },
    get: { tags: ['Parties'], summary: 'List parties', parameters: [{ name: 'type', in: 'query', schema: { type: 'string' } }, { name: 'jurisdiction', in: 'query', schema: { type: 'string' } }, { name: 'search', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Parties') },
  },
  '/parties/{id}': {
    get: { tags: ['Parties'], summary: 'Get party', parameters: [idParam], responses: ok('Party') },
    patch: { tags: ['Parties'], summary: 'Update party', parameters: [idParam], requestBody: json({ name: { type: 'string' }, roles: { type: 'array', items: { type: 'string' } } }), responses: ok('Updated') },
  },
  '/parties/by-wallet/{address}': { get: { tags: ['Parties'], summary: 'Get party by wallet', parameters: [{ name: 'address', in: 'path', required: true, schema: { type: 'string' } }], responses: ok('Party') } },
  '/parties/{id}/kyc': { post: { tags: ['Parties'], summary: 'Update KYC status', parameters: [idParam], requestBody: json({ verified: { type: 'boolean' }, expiryDate: { type: 'string', format: 'date-time' }, verificationLevel: { type: 'string' } }, ['verified']), responses: ok('KYC updated') } },
  '/parties/{id}/freeze': { post: { tags: ['Parties'], summary: 'Freeze party', parameters: [idParam], requestBody: json({ reason: { type: 'string' } }), responses: ok('Frozen') } },
  '/parties/{id}/unfreeze': { post: { tags: ['Parties'], summary: 'Unfreeze party', parameters: [idParam], responses: ok('Unfrozen') } },
  '/parties/{id}/wallets': { post: { tags: ['Parties'], summary: 'Add wallet', parameters: [idParam], requestBody: json({ address: { type: 'string' }, chainId: { type: 'integer' }, isPrimary: { type: 'boolean' } }, ['address']), responses: created('Wallet added') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // IAM
  // ═══════════════════════════════════════════════════════════════════════════
  '/iam/orgs': {
    post: { tags: ['IAM'], summary: 'Create organization', requestBody: json({ name: { type: 'string' }, slug: { type: 'string' }, settings: { type: 'object' } }, ['name', 'slug']), responses: created('Org created') },
    get: { tags: ['IAM'], summary: 'List organizations', parameters: [...pag], responses: list('Organizations') },
  },
  '/iam/orgs/{id}': {
    get: { tags: ['IAM'], summary: 'Get organization', parameters: [idParam], responses: ok('Organization') },
    patch: { tags: ['IAM'], summary: 'Update organization', parameters: [idParam], requestBody: json({ name: { type: 'string' }, status: { type: 'string' } }), responses: ok('Updated') },
  },
  '/iam/orgs/{orgId}/users': {
    post: { tags: ['IAM'], summary: 'Create user', parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ email: { type: 'string', format: 'email' }, name: { type: 'string' }, password: { type: 'string' } }, ['email']), responses: created('User created') },
    get: { tags: ['IAM'], summary: 'List users', parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: list('Users') },
  },
  '/iam/orgs/{orgId}/roles': {
    post: { tags: ['IAM'], summary: 'Create role', parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ name: { type: 'string' }, permissions: { type: 'array', items: { type: 'string' } } }, ['name', 'permissions']), responses: created('Role created') },
    get: { tags: ['IAM'], summary: 'List roles', parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: list('Roles') },
  },
  '/iam/orgs/{orgId}/api-keys': {
    post: { tags: ['IAM'], summary: 'Create API key', parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ name: { type: 'string' }, scopes: { type: 'array', items: { type: 'string' } }, environment: { type: 'string', enum: ['sandbox', 'production'] } }, ['name']), responses: created('API key created') },
    get: { tags: ['IAM'], summary: 'List API keys', parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: list('API keys') },
  },
  '/iam/orgs/{orgId}/api-keys/{keyId}': {
    get: { tags: ['IAM'], summary: 'Get API key', parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'keyId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('API key') },
    delete: { tags: ['IAM'], summary: 'Revoke API key', parameters: [{ name: 'orgId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'keyId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('Revoked') },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTLEMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  '/settlements': {
    post: { tags: ['Settlements'], summary: 'Create settlement', requestBody: json({ txHash: { type: 'string' }, chainId: { type: 'integer' }, transferId: { type: 'string', format: 'uuid' } }, ['txHash', 'chainId']), responses: created('Settlement created') },
    get: { tags: ['Settlements'], summary: 'List settlements', parameters: [{ name: 'finalityStatus', in: 'query', schema: { type: 'string' } }, { name: 'chainId', in: 'query', schema: { type: 'integer' } }, ...pag], responses: list('Settlements') },
  },
  '/settlements/{id}': { get: { tags: ['Settlements'], summary: 'Get settlement', parameters: [idParam], responses: ok('Settlement') } },
  '/settlements/tx/{txHash}': { get: { tags: ['Settlements'], summary: 'Get by tx hash', parameters: [{ name: 'txHash', in: 'path', required: true, schema: { type: 'string' } }], responses: ok('Settlement') } },
  '/settlements/{id}/confirmations': { post: { tags: ['Settlements'], summary: 'Update confirmations', parameters: [idParam], requestBody: json({ currentBlock: { type: 'integer' } }, ['currentBlock']), responses: ok('Updated') } },
  '/settlements/stats/overview': { get: { tags: ['Settlements'], summary: 'Settlement statistics', responses: ok('Stats') } },
  '/settlements/chains/config': { get: { tags: ['Settlements'], summary: 'Chain finality configs', responses: list('Chain configs') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // DISTRIBUTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  '/distributions': {
    post: { tags: ['Distributions'], summary: 'Create distribution', requestBody: json({ tokenId: { type: 'string', format: 'uuid' }, type: { type: 'string', enum: ['dividend', 'rental_income', 'interest'] }, totalAmount: { type: 'string' }, currency: { type: 'string' }, recordDate: { type: 'string', format: 'date-time' }, description: { type: 'string' } }, ['tokenId', 'type', 'totalAmount', 'currency']), responses: created('Distribution created') },
    get: { tags: ['Distributions'], summary: 'List distributions', parameters: [{ name: 'tokenId', in: 'query', schema: { type: 'string' } }, { name: 'type', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Distributions') },
  },
  '/distributions/{id}': { get: { tags: ['Distributions'], summary: 'Get distribution', parameters: [idParam], responses: ok('Distribution') } },
  '/distributions/{id}/calculate': { post: { tags: ['Distributions'], summary: 'Calculate entitlements', parameters: [idParam], responses: ok('Calculated') } },
  '/distributions/{id}/approve': { post: { tags: ['Distributions'], summary: 'Approve distribution', parameters: [idParam], responses: ok('Approved') } },
  '/distributions/{id}/execute': { post: { tags: ['Distributions'], summary: 'Execute distribution', parameters: [idParam], responses: ok('Executed') } },
  '/distributions/{id}/cancel': { post: { tags: ['Distributions'], summary: 'Cancel distribution', parameters: [idParam], requestBody: json({ reason: { type: 'string' } }, ['reason']), responses: ok('Cancelled') } },
  '/distributions/{id}/entitlements': { get: { tags: ['Distributions'], summary: 'List entitlements', parameters: [idParam, ...pag], responses: list('Entitlements') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // CHAINS
  // ═══════════════════════════════════════════════════════════════════════════
  '/chains': { get: { tags: ['Chains'], summary: 'List supported chains', responses: list('Chains'), security: [] } },
  '/chains/{chainId}': { get: { tags: ['Chains'], summary: 'Get chain config', parameters: [{ name: 'chainId', in: 'path', required: true, schema: { type: 'integer' } }], responses: ok('Chain config'), security: [] } },
  '/chains/{chainId}/status': { get: { tags: ['Chains'], summary: 'Chain status', parameters: [{ name: 'chainId', in: 'path', required: true, schema: { type: 'integer' } }], responses: ok('Chain status'), security: [] } },

  // ═══════════════════════════════════════════════════════════════════════════
  // WEBHOOKS
  // ═══════════════════════════════════════════════════════════════════════════
  '/webhooks/endpoints': {
    post: { tags: ['Webhooks'], summary: 'Create webhook endpoint', requestBody: json({ url: { type: 'string', format: 'uri' }, description: { type: 'string' }, events: { type: 'array', items: { type: 'string' } } }, ['url', 'events']), responses: created('Endpoint created', { $ref: '#/components/schemas/WebhookEndpoint' }) },
    get: { tags: ['Webhooks'], summary: 'List endpoints', parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Endpoints') },
  },
  '/webhooks/endpoints/{id}': {
    get: { tags: ['Webhooks'], summary: 'Get endpoint', parameters: [idParam], responses: ok('Endpoint', { $ref: '#/components/schemas/WebhookEndpoint' }) },
    patch: { tags: ['Webhooks'], summary: 'Update endpoint', parameters: [idParam], requestBody: json({ url: { type: 'string' }, events: { type: 'array', items: { type: 'string' } } }), responses: ok('Updated') },
    delete: { tags: ['Webhooks'], summary: 'Delete endpoint', parameters: [idParam], responses: ok('Deleted') },
  },
  '/webhooks/endpoints/{id}/rotate-secret': { post: { tags: ['Webhooks'], summary: 'Rotate webhook secret', parameters: [idParam], responses: ok('Secret rotated') } },
  '/webhooks/deliveries': { get: { tags: ['Webhooks'], summary: 'List deliveries', parameters: [{ name: 'endpointId', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Deliveries') } },
  '/webhooks/deliveries/{id}/retry': { post: { tags: ['Webhooks'], summary: 'Retry delivery', parameters: [idParam], responses: ok('Retried') } },
  '/webhooks/test': { post: { tags: ['Webhooks'], summary: 'Send test event', requestBody: json({ eventType: { type: 'string' }, data: { type: 'object' } }, ['eventType']), responses: ok('Test sent') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEDGER
  // ═══════════════════════════════════════════════════════════════════════════
  '/ledger/positions': { get: { tags: ['Ledger'], summary: 'List positions', parameters: [{ name: 'tokenId', in: 'query', schema: { type: 'string' } }, { name: 'investorId', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Positions') } },
  '/ledger/positions/wallet/{walletAddress}': { get: { tags: ['Ledger'], summary: 'Positions by wallet', parameters: [{ name: 'walletAddress', in: 'path', required: true, schema: { type: 'string' } }], responses: list('Positions') } },
  '/ledger/positions/investor/{investorId}': { get: { tags: ['Ledger'], summary: 'Positions by investor', parameters: [{ name: 'investorId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: list('Positions') } },
  '/ledger/events': { get: { tags: ['Ledger'], summary: 'List ledger events', parameters: [{ name: 'tokenId', in: 'query', schema: { type: 'string' } }, { name: 'eventType', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Ledger events') } },
  '/ledger/snapshots': {
    post: { tags: ['Ledger'], summary: 'Create cap table snapshot', requestBody: json({ tokenId: { type: 'string', format: 'uuid' }, metadata: { type: 'object' } }, ['tokenId']), responses: created('Snapshot created', { $ref: '#/components/schemas/CapTableSnapshot' }) },
    get: { tags: ['Ledger'], summary: 'List snapshots', parameters: [...pag], responses: list('Snapshots') },
  },
  '/ledger/snapshots/{id}': { get: { tags: ['Ledger'], summary: 'Get snapshot', parameters: [idParam], responses: ok('Snapshot', { $ref: '#/components/schemas/CapTableSnapshot' }) } },
  '/ledger/snapshots/{id}/verify': { get: { tags: ['Ledger'], summary: 'Verify snapshot integrity', parameters: [idParam], responses: ok('Verification result') } },
  '/ledger/analytics/summary/{tokenId}': { get: { tags: ['Ledger'], summary: 'Position summary', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('Summary') } },
  '/ledger/analytics/distribution/{tokenId}': { get: { tags: ['Ledger'], summary: 'Token distribution analytics', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('Distribution') } },
  '/ledger/portfolio/{investorId}': { get: { tags: ['Ledger'], summary: 'Investor portfolio', parameters: [{ name: 'investorId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('Portfolio') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // DLD
  // ═══════════════════════════════════════════════════════════════════════════
  '/dld/titles': {
    post: { tags: ['DLD'], summary: 'Register DLD title', requestBody: json({ projectId: { type: 'string', format: 'uuid' }, dldTitleNumber: { type: 'string' }, propertyType: { type: 'string', enum: ['land', 'building', 'unit'] }, emirate: { type: 'string' }, area: { type: 'string' }, ownerName: { type: 'string' } }, ['dldTitleNumber', 'propertyType', 'emirate', 'ownerName']), responses: created('Title registered', { $ref: '#/components/schemas/DldTitle' }) },
    get: { tags: ['DLD'], summary: 'List DLD titles', parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'emirate', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Titles') },
  },
  '/dld/titles/{id}': { get: { tags: ['DLD'], summary: 'Get title', parameters: [idParam], responses: ok('Title', { $ref: '#/components/schemas/DldTitle' }) } },
  '/dld/titles/{id}/verify': { post: { tags: ['DLD'], summary: 'Verify title', parameters: [idParam], responses: ok('Verified') } },
  '/dld/titles/{id}/history': { get: { tags: ['DLD'], summary: 'Title history', parameters: [idParam], responses: list('History') } },
  '/dld/search': { post: { tags: ['DLD'], summary: 'Search DLD records', requestBody: json({ query: { type: 'string' }, emirate: { type: 'string' } }, ['query']), responses: list('Results') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTODY, VESTING, CORPORATE ACTIONS, ISSUANCE, REDEMPTION
  // ═══════════════════════════════════════════════════════════════════════════
  '/custody/vaults': {
    post: { tags: ['Custody'], summary: 'Create vault', requestBody: json({ name: { type: 'string' }, provider: { type: 'string' }, chainId: { type: 'integer' } }, ['name', 'provider', 'chainId']), responses: created('Vault created') },
    get: { tags: ['Custody'], summary: 'List vaults', responses: list('Vaults') },
  },
  '/custody/vaults/{id}': { get: { tags: ['Custody'], summary: 'Get vault', parameters: [idParam], responses: ok('Vault') } },
  '/custody/sign': { post: { tags: ['Custody'], summary: 'Sign transaction', requestBody: json({ vaultId: { type: 'string', format: 'uuid' }, chainId: { type: 'integer' }, to: { type: 'string' }, data: { type: 'string' } }, ['vaultId', 'chainId', 'to']), responses: ok('Signed transaction') } },
  '/custody/transactions': { get: { tags: ['Custody'], summary: 'List custody transactions', parameters: [{ name: 'vaultId', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Transactions') } },

  '/vesting/schedules': {
    post: { tags: ['Vesting'], summary: 'Create vesting schedule', requestBody: json({ tokenId: { type: 'string', format: 'uuid' }, investorId: { type: 'string', format: 'uuid' }, totalAmount: { type: 'string' }, vestingType: { type: 'string' }, vestingMonths: { type: 'integer' } }, ['tokenId', 'investorId', 'totalAmount', 'vestingType', 'vestingMonths']), responses: created('Schedule created') },
    get: { tags: ['Vesting'], summary: 'List schedules', parameters: [{ name: 'tokenId', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Schedules') },
  },
  '/vesting/schedules/{id}': { get: { tags: ['Vesting'], summary: 'Get schedule', parameters: [idParam], responses: ok('Schedule') } },
  '/vesting/schedules/{id}/calculate': { get: { tags: ['Vesting'], summary: 'Calculate vested amount', parameters: [idParam, { name: 'asOfDate', in: 'query', schema: { type: 'string', format: 'date-time' } }], responses: ok('Vested amount') } },
  '/vesting/schedules/{id}/release': { post: { tags: ['Vesting'], summary: 'Release vested tokens', parameters: [idParam], responses: ok('Released') } },
  '/vesting/schedules/{id}/releases': { get: { tags: ['Vesting'], summary: 'List releases', parameters: [idParam], responses: list('Releases') } },

  '/corporate-actions': {
    post: { tags: ['Corporate Actions'], summary: 'Create corporate action', requestBody: json({ tokenId: { type: 'string', format: 'uuid' }, type: { type: 'string', enum: ['dividend', 'stock_split', 'rights_issue', 'buyback'] }, name: { type: 'string' }, recordDate: { type: 'string', format: 'date-time' }, parameters: { type: 'object' } }, ['tokenId', 'type', 'name', 'recordDate', 'parameters']), responses: created('Created') },
    get: { tags: ['Corporate Actions'], summary: 'List corporate actions', parameters: [{ name: 'tokenId', in: 'query', schema: { type: 'string' } }, { name: 'type', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Corporate actions') },
  },
  '/corporate-actions/{id}': { get: { tags: ['Corporate Actions'], summary: 'Get corporate action', parameters: [idParam], responses: ok('Corporate action') } },
  '/corporate-actions/{id}/approve': { post: { tags: ['Corporate Actions'], summary: 'Approve', parameters: [idParam], responses: ok('Approved') } },
  '/corporate-actions/{id}/execute': { post: { tags: ['Corporate Actions'], summary: 'Execute', parameters: [idParam], responses: ok('Executed') } },
  '/corporate-actions/{id}/cancel': { post: { tags: ['Corporate Actions'], summary: 'Cancel', parameters: [idParam], requestBody: json({ reason: { type: 'string' } }, ['reason']), responses: ok('Cancelled') } },

  '/issuance/offerings': {
    post: { tags: ['Issuance'], summary: 'Create offering', requestBody: json({ tokenId: { type: 'string', format: 'uuid' }, name: { type: 'string' }, hardCap: { type: 'string' }, minInvestment: { type: 'string' }, pricePerToken: { type: 'string' }, currency: { type: 'string' } }, ['tokenId', 'name', 'hardCap', 'minInvestment', 'pricePerToken', 'currency']), responses: created('Offering created') },
    get: { tags: ['Issuance'], summary: 'List offerings', parameters: [...pag], responses: list('Offerings') },
  },
  '/issuance/offerings/{id}': { get: { tags: ['Issuance'], summary: 'Get offering', parameters: [idParam], responses: ok('Offering') } },
  '/issuance/offerings/{id}/settle': { post: { tags: ['Issuance'], summary: 'Settle offering', parameters: [idParam], responses: ok('Settled') } },
  '/issuance/allocations': {
    post: { tags: ['Issuance'], summary: 'Create allocation', requestBody: json({ offeringId: { type: 'string', format: 'uuid' }, investorId: { type: 'string', format: 'uuid' }, walletAddress: { type: 'string' }, amount: { type: 'string' }, investmentAmount: { type: 'string' }, currency: { type: 'string' } }, ['offeringId', 'investorId', 'walletAddress', 'amount', 'investmentAmount', 'currency']), responses: created('Allocation created') },
    get: { tags: ['Issuance'], summary: 'List allocations', parameters: [...pag], responses: list('Allocations') },
  },
  '/issuance/mint-queue': { get: { tags: ['Issuance'], summary: 'Get mint queue', responses: list('Mint queue') } },

  '/tokens/{tokenId}/redemptions': { get: { tags: ['Redemption'], summary: 'List redemptions', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, ...pag], responses: list('Redemptions') } },
  '/redemptions/{id}': { get: { tags: ['Redemption'], summary: 'Get redemption', parameters: [idParam], responses: ok('Redemption') } },
  '/redemptions/{id}/approve': { patch: { tags: ['Redemption'], summary: 'Approve redemption', parameters: [idParam], responses: ok('Approved') } },
  '/redemptions/{id}/reject': { patch: { tags: ['Redemption'], summary: 'Reject redemption', parameters: [idParam], requestBody: json({ reason: { type: 'string' } }, ['reason']), responses: ok('Rejected') } },
  '/redemptions/{id}/execute': { post: { tags: ['Redemption'], summary: 'Execute redemption', parameters: [idParam], responses: ok('Executed') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // INFRASTRUCTURE: RELAYER, GAS, INDEXER, SCHEDULER, SSE, METRICS, EXPORT
  // ═══════════════════════════════════════════════════════════════════════════
  '/relayer/chains': { get: { tags: ['Relayer'], summary: 'Supported chains', responses: list('Chains'), security: [] } },
  '/relayer/chains/{chainId}': { get: { tags: ['Relayer'], summary: 'Chain config', parameters: [{ name: 'chainId', in: 'path', required: true, schema: { type: 'integer' } }], responses: ok('Config'), security: [] } },
  '/relayer/chains/{chainId}/health': { get: { tags: ['Relayer'], summary: 'Chain health', parameters: [{ name: 'chainId', in: 'path', required: true, schema: { type: 'integer' } }], responses: ok('Health'), security: [] } },
  '/relayer/tx/build': { post: { tags: ['Relayer'], summary: 'Build transaction', requestBody: json({ chainId: { type: 'integer' }, to: { type: 'string' }, data: { type: 'string' }, value: { type: 'string' } }, ['chainId', 'to']), responses: ok('Built transaction') } },
  '/relayer/tx/sign': { post: { tags: ['Relayer'], summary: 'Sign transaction (custodial)', requestBody: json({ chainId: { type: 'integer' }, to: { type: 'string' }, data: { type: 'string' } }, ['chainId', 'to']), responses: ok('Signed') } },
  '/relayer/tx/submit': { post: { tags: ['Relayer'], summary: 'Submit signed transaction', requestBody: json({ chainId: { type: 'integer' }, signedTx: { type: 'string' } }, ['chainId', 'signedTx']), responses: ok('Submitted') } },
  '/relayer/tx/{chainId}/{txHash}': { get: { tags: ['Relayer'], summary: 'Get transaction receipt', parameters: [{ name: 'chainId', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'txHash', in: 'path', required: true, schema: { type: 'string' } }], responses: ok('Receipt') } },
  '/relayer/balance/{chainId}/{address}': { get: { tags: ['Relayer'], summary: 'Get ETH balance', parameters: [{ name: 'chainId', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'address', in: 'path', required: true, schema: { type: 'string' } }], responses: ok('Balance'), security: [] } },
  '/relayer/block/{chainId}': { get: { tags: ['Relayer'], summary: 'Get block number', parameters: [{ name: 'chainId', in: 'path', required: true, schema: { type: 'integer' } }], responses: ok('Block number'), security: [] } },

  '/gas/chains/{chainId}': { get: { tags: ['Gas'], summary: 'Get gas prices', parameters: [{ name: 'chainId', in: 'path', required: true, schema: { type: 'integer' } }], responses: ok('Gas prices') } },
  '/gas/estimate': { post: { tags: ['Gas'], summary: 'Estimate gas', requestBody: json({ chainId: { type: 'integer' }, to: { type: 'string' }, data: { type: 'string' } }, ['chainId']), responses: ok('Estimate') } },
  '/gas/compare': { get: { tags: ['Gas'], summary: 'Compare gas across chains', parameters: [{ name: 'chainIds', in: 'query', schema: { type: 'string' }, description: 'Comma-separated chain IDs' }], responses: ok('Comparison') } },

  '/indexer/status': { get: { tags: ['Indexer'], summary: 'All indexer statuses', responses: list('Statuses') } },
  '/indexer/status/{chainId}': { get: { tags: ['Indexer'], summary: 'Chain indexer status', parameters: [{ name: 'chainId', in: 'path', required: true, schema: { type: 'integer' } }], responses: ok('Status') } },
  '/indexer/start': { post: { tags: ['Indexer'], summary: 'Start indexer', requestBody: json({ chainId: { type: 'integer' }, startBlock: { type: 'integer' } }, ['chainId']), responses: ok('Started') } },
  '/indexer/stop/{chainId}': { post: { tags: ['Indexer'], summary: 'Stop indexer', parameters: [{ name: 'chainId', in: 'path', required: true, schema: { type: 'integer' } }], responses: ok('Stopped') } },
  '/indexer/reconcile/{tokenId}': { post: { tags: ['Indexer'], summary: 'Reconcile token', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('Reconciled') } },

  '/scheduler/jobs': {
    post: { tags: ['Scheduler'], summary: 'Create scheduled job', requestBody: json({ name: { type: 'string' }, jobType: { type: 'string' }, schedule: { type: 'string' } }, ['name', 'jobType', 'schedule']), responses: created('Job created') },
    get: { tags: ['Scheduler'], summary: 'List jobs', parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Jobs') },
  },
  '/scheduler/jobs/{id}': { get: { tags: ['Scheduler'], summary: 'Get job', parameters: [idParam], responses: ok('Job') } },
  '/scheduler/jobs/{id}/pause': { patch: { tags: ['Scheduler'], summary: 'Pause job', parameters: [idParam], responses: ok('Paused') } },
  '/scheduler/jobs/{id}/resume': { patch: { tags: ['Scheduler'], summary: 'Resume job', parameters: [idParam], responses: ok('Resumed') } },
  '/scheduler/jobs/{id}/trigger': { post: { tags: ['Scheduler'], summary: 'Trigger job manually', parameters: [idParam], responses: ok('Triggered') } },
  '/scheduler/status': { get: { tags: ['Scheduler'], summary: 'Scheduler health', responses: ok('Health') } },

  '/events/stream': { get: { tags: ['SSE'], summary: 'SSE event stream', parameters: [{ name: 'topics', in: 'query', schema: { type: 'string' }, description: 'Comma-separated topic names' }], responses: { 200: { description: 'SSE stream' } } } },
  '/events/stats': { get: { tags: ['SSE'], summary: 'SSE connection stats', responses: ok('Stats') } },

  '/metrics': { get: { tags: ['Metrics'], summary: 'Dashboard metrics', responses: ok('Metrics') } },

  '/export/cap-table/{tokenId}': { get: { tags: ['Export'], summary: 'Export cap table as CSV', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } } } } },
  '/export/audit': { get: { tags: ['Export'], summary: 'Export audit trail as CSV', parameters: [{ name: 'startDate', in: 'query', schema: { type: 'string' } }, { name: 'endDate', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'CSV file' } } } },
  '/export/transactions/{tokenId}': { get: { tags: ['Export'], summary: 'Export transactions as CSV', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'CSV file' } } } },
  '/export/evidence/investor/{id}': { get: { tags: ['Export'], summary: 'Investor evidence pack', parameters: [idParam, { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'html', 'text'] } }], responses: ok('Evidence pack') } },
  '/export/evidence/transfer/{id}': { get: { tags: ['Export'], summary: 'Transfer evidence pack', parameters: [idParam], responses: ok('Evidence pack') } },
  '/export/evidence/token/{id}': { get: { tags: ['Export'], summary: 'Token evidence pack', parameters: [idParam], responses: ok('Evidence pack') } },
  '/export/regulatory/token/{id}': { get: { tags: ['Export'], summary: 'Regulatory pack', parameters: [idParam, { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'html'] } }], responses: ok('Regulatory pack') } },

  '/reports': {
    post: { tags: ['Reports'], summary: 'Generate report', requestBody: json({ type: { type: 'string' }, format: { type: 'string' }, parameters: { type: 'object' } }, ['type']), responses: created('Report generated') },
    get: { tags: ['Reports'], summary: 'List reports', parameters: [{ name: 'type', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Reports') },
  },
  '/reports/{id}': { get: { tags: ['Reports'], summary: 'Get report', parameters: [idParam], responses: ok('Report') } },
  '/reports/{id}/download': { get: { tags: ['Reports'], summary: 'Download report', parameters: [idParam], responses: { 200: { description: 'Report file' } } } },

  // ═══════════════════════════════════════════════════════════════════════════
  // PAYMENT RAILS
  // ═══════════════════════════════════════════════════════════════════════════
  '/payment-rails': {
    post: { tags: ['Payment Rails'], summary: 'Create rail config', requestBody: json({ railType: { type: 'string', enum: ['stripe', 'circle', 'bank_transfer'] }, name: { type: 'string' }, config: { type: 'object' }, supportedCurrencies: { type: 'array', items: { type: 'string' } } }, ['railType', 'name', 'config', 'supportedCurrencies']), responses: created('Rail created') },
    get: { tags: ['Payment Rails'], summary: 'List rail configs', parameters: [{ name: 'railType', in: 'query', schema: { type: 'string' } }], responses: list('Configs') },
  },
  '/payment-rails/{id}': {
    get: { tags: ['Payment Rails'], summary: 'Get rail config', parameters: [idParam], responses: ok('Config') },
    patch: { tags: ['Payment Rails'], summary: 'Update rail config', parameters: [idParam], responses: ok('Updated') },
    delete: { tags: ['Payment Rails'], summary: 'Delete rail config', parameters: [idParam], responses: ok('Deleted') },
  },
  '/payment-rails/{railId}/payments': { post: { tags: ['Payment Rails'], summary: 'Create payment', parameters: [{ name: 'railId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ amount: { type: 'string' }, currency: { type: 'string' }, direction: { type: 'string', enum: ['inbound', 'outbound'] } }, ['amount', 'currency', 'direction']), responses: created('Payment created') } },
  '/payment-rails/payments': { get: { tags: ['Payment Rails'], summary: 'List payments', parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'direction', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Payments') } },
  '/payment-rails/payments/{id}': { get: { tags: ['Payment Rails'], summary: 'Get payment', parameters: [idParam], responses: ok('Payment') } },
  '/payment-rails/payments/{id}/process': { post: { tags: ['Payment Rails'], summary: 'Process payment', parameters: [idParam], responses: ok('Processed') } },
  '/payment-rails/payments/{id}/cancel': { post: { tags: ['Payment Rails'], summary: 'Cancel payment', parameters: [idParam], responses: ok('Cancelled') } },
  '/payment-rails/payments/analytics': { get: { tags: ['Payment Rails'], summary: 'Payment analytics', responses: ok('Analytics') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // NAV
  // ═══════════════════════════════════════════════════════════════════════════
  '/assets/{assetId}/nav': { get: { tags: ['NAV'], summary: 'Get current NAV', parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('NAV') } },
  '/assets/{assetId}/nav/history': { get: { tags: ['NAV'], summary: 'NAV history', parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'from', in: 'query', schema: { type: 'string' } }, { name: 'to', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('NAV history') } },
  '/assets/{assetId}/nav/valuations': { post: { tags: ['NAV'], summary: 'Submit manual valuation', parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ totalAssetValue: { type: 'number' }, liabilities: { type: 'number' }, currency: { type: 'string' }, reason: { type: 'string' } }, ['totalAssetValue']), responses: created('Valuation submitted') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // VERTICALS: TICKETS, HOTELS, CAR RENTALS, CONCERTS
  // ═══════════════════════════════════════════════════════════════════════════
  '/tickets': {
    post: { tags: ['Tickets'], summary: 'Issue airline ticket', requestBody: json({ flightNumber: { type: 'string' }, airline: { type: 'string' }, departureTime: { type: 'string', format: 'date-time' }, arrivalTime: { type: 'string', format: 'date-time' }, departureAirport: { type: 'string' }, arrivalAirport: { type: 'string' }, passengerName: { type: 'string' }, seatNumber: { type: 'string' } }, ['flightNumber', 'airline', 'departureTime', 'arrivalTime', 'departureAirport', 'arrivalAirport', 'passengerName']), responses: created('Ticket issued') },
    get: { tags: ['Tickets'], summary: 'List tickets', parameters: [{ name: 'flightNumber', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Tickets') },
  },
  '/tickets/{id}': { get: { tags: ['Tickets'], summary: 'Get ticket', parameters: [idParam], responses: ok('Ticket') } },
  '/tickets/{id}/check-in': { post: { tags: ['Tickets'], summary: 'Check in', parameters: [idParam], responses: ok('Checked in') } },
  '/tickets/{id}/board': { post: { tags: ['Tickets'], summary: 'Board passenger', parameters: [idParam], responses: ok('Boarded') } },
  '/tickets/{id}/complete': { post: { tags: ['Tickets'], summary: 'Complete flight', parameters: [idParam], requestBody: json({ burn: { type: 'boolean' } }), responses: ok('Completed') } },
  '/tickets/{id}/cancel': { post: { tags: ['Tickets'], summary: 'Cancel ticket', parameters: [idParam], responses: ok('Cancelled') } },
  '/tickets/{id}/transfer': { post: { tags: ['Tickets'], summary: 'Request transfer', parameters: [idParam], requestBody: json({ toPassengerName: { type: 'string' }, toAddress: { type: 'string' } }, ['toPassengerName', 'toAddress']), responses: created('Transfer requested') } },
  '/tickets/{id}/events': { get: { tags: ['Tickets'], summary: 'Ticket events', parameters: [idParam], responses: list('Events') } },

  '/hotels': {
    post: { tags: ['Hotels'], summary: 'Create reservation', requestBody: json({ guestName: { type: 'string' }, propertyName: { type: 'string' }, checkInDate: { type: 'string', format: 'date' }, checkOutDate: { type: 'string', format: 'date' }, roomType: { type: 'string' } }, ['guestName', 'propertyName', 'checkInDate', 'checkOutDate']), responses: created('Reservation created') },
    get: { tags: ['Hotels'], summary: 'List reservations', parameters: [...pag], responses: list('Reservations') },
  },
  '/hotels/{id}': { get: { tags: ['Hotels'], summary: 'Get reservation', parameters: [idParam], responses: ok('Reservation') } },
  '/hotels/{id}/confirm': { post: { tags: ['Hotels'], summary: 'Confirm reservation', parameters: [idParam], responses: ok('Confirmed') } },
  '/hotels/{id}/check-in': { post: { tags: ['Hotels'], summary: 'Check in', parameters: [idParam], requestBody: json({ roomNumber: { type: 'string' } }), responses: ok('Checked in') } },
  '/hotels/{id}/check-out': { post: { tags: ['Hotels'], summary: 'Check out', parameters: [idParam], responses: ok('Checked out') } },
  '/hotels/{id}/cancel': { post: { tags: ['Hotels'], summary: 'Cancel reservation', parameters: [idParam], responses: ok('Cancelled') } },
  '/hotels/{id}/extend': { post: { tags: ['Hotels'], summary: 'Extend stay', parameters: [idParam], requestBody: json({ newCheckOutDate: { type: 'string', format: 'date' } }, ['newCheckOutDate']), responses: ok('Extended') } },

  '/car-rentals': {
    post: { tags: ['Car Rentals'], summary: 'Create rental', requestBody: json({ driverName: { type: 'string' }, vehicleType: { type: 'string' }, pickUpDate: { type: 'string', format: 'date-time' }, returnDate: { type: 'string', format: 'date-time' }, pickUpLocation: { type: 'string' } }, ['driverName', 'vehicleType', 'pickUpDate', 'returnDate']), responses: created('Rental created') },
    get: { tags: ['Car Rentals'], summary: 'List rentals', parameters: [...pag], responses: list('Rentals') },
  },
  '/car-rentals/{id}': { get: { tags: ['Car Rentals'], summary: 'Get rental', parameters: [idParam], responses: ok('Rental') } },
  '/car-rentals/{id}/confirm': { post: { tags: ['Car Rentals'], summary: 'Confirm rental', parameters: [idParam], responses: ok('Confirmed') } },
  '/car-rentals/{id}/pick-up': { post: { tags: ['Car Rentals'], summary: 'Pick up vehicle', parameters: [idParam], requestBody: json({ mileageStart: { type: 'integer' } }, ['mileageStart']), responses: ok('Picked up') } },
  '/car-rentals/{id}/return': { post: { tags: ['Car Rentals'], summary: 'Return vehicle', parameters: [idParam], requestBody: json({ mileageEnd: { type: 'integer' } }, ['mileageEnd']), responses: ok('Returned') } },
  '/car-rentals/{id}/inspect': { post: { tags: ['Car Rentals'], summary: 'Inspect vehicle', parameters: [idParam], requestBody: json({ damageCharge: { type: 'number' }, notes: { type: 'string' } }), responses: ok('Inspected') } },
  '/car-rentals/{id}/cancel': { post: { tags: ['Car Rentals'], summary: 'Cancel rental', parameters: [idParam], responses: ok('Cancelled') } },

  '/concerts': {
    post: { tags: ['Concerts'], summary: 'Issue concert ticket', requestBody: json({ eventName: { type: 'string' }, venue: { type: 'string' }, eventDate: { type: 'string', format: 'date-time' }, seatSection: { type: 'string' }, seatNumber: { type: 'string' }, holderName: { type: 'string' } }, ['eventName', 'venue', 'eventDate', 'holderName']), responses: created('Ticket issued') },
    get: { tags: ['Concerts'], summary: 'List concert tickets', parameters: [...pag], responses: list('Tickets') },
  },
  '/concerts/{id}': { get: { tags: ['Concerts'], summary: 'Get concert ticket', parameters: [idParam], responses: ok('Ticket') } },
  '/concerts/{id}/admit': { post: { tags: ['Concerts'], summary: 'Admit entry', parameters: [idParam], responses: ok('Admitted') } },
  '/concerts/{id}/cancel': { post: { tags: ['Concerts'], summary: 'Cancel ticket', parameters: [idParam], responses: ok('Cancelled') } },
  '/concerts/{id}/refund': { post: { tags: ['Concerts'], summary: 'Refund ticket', parameters: [idParam], responses: ok('Refunded') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // MISC: THEMES, ACCREDITATION, EVENTBUS, IDEMPOTENCY, WALLET PASS, etc.
  // ═══════════════════════════════════════════════════════════════════════════
  '/themes': {
    get: { tags: ['Themes'], summary: 'Get theme config', responses: ok('Theme') },
    put: { tags: ['Themes'], summary: 'Create/update theme', requestBody: json({ primaryColor: { type: 'string' }, secondaryColor: { type: 'string' }, logoUrl: { type: 'string' }, fontFamily: { type: 'string' } }), responses: ok('Updated') },
    delete: { tags: ['Themes'], summary: 'Reset theme to default', responses: ok('Reset') },
  },

  '/accreditation/questionnaires': { post: { tags: ['Accreditation'], summary: 'Submit questionnaire', requestBody: json({ investorId: { type: 'string', format: 'uuid' }, answers: { type: 'object' } }, ['investorId', 'answers']), responses: created('Submitted') } },
  '/accreditation/questionnaires/{investorId}': { get: { tags: ['Accreditation'], summary: 'Get questionnaire answers', parameters: [{ name: 'investorId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('Answers') } },
  '/accreditation/verify': { post: { tags: ['Accreditation'], summary: 'Verify accreditation', requestBody: json({ investorId: { type: 'string', format: 'uuid' } }, ['investorId']), responses: ok('Verification result') } },
  '/accreditation/status/{investorId}': { get: { tags: ['Accreditation'], summary: 'Get accreditation status', parameters: [{ name: 'investorId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('Status') } },

  '/eventbus/subscriptions': {
    post: { tags: ['EventBus'], summary: 'Create subscription', requestBody: json({ topic: { type: 'string' }, callbackUrl: { type: 'string', format: 'uri' } }, ['topic', 'callbackUrl']), responses: created('Subscription created') },
    get: { tags: ['EventBus'], summary: 'List subscriptions', responses: list('Subscriptions') },
  },
  '/eventbus/subscriptions/{id}': { delete: { tags: ['EventBus'], summary: 'Delete subscription', parameters: [idParam], responses: ok('Deleted') } },
  '/eventbus/publish': { post: { tags: ['EventBus'], summary: 'Publish event', requestBody: json({ topic: { type: 'string' }, payload: { type: 'object' } }, ['topic', 'payload']), responses: ok('Published') } },
  '/eventbus/topics': { get: { tags: ['EventBus'], summary: 'List topics', responses: list('Topics') } },
  '/eventbus/stats': { get: { tags: ['EventBus'], summary: 'EventBus stats', responses: ok('Stats') } },

  '/idempotency/stats': { get: { tags: ['Idempotency'], summary: 'Idempotency stats', responses: ok('Stats') } },
  '/idempotency/cleanup': { post: { tags: ['Idempotency'], summary: 'Cleanup expired keys', responses: ok('Cleaned up') } },

  '/flights/{flightNumber}/status': { get: { tags: ['Flight Oracle'], summary: 'Get flight status', parameters: [{ name: 'flightNumber', in: 'path', required: true, schema: { type: 'string' } }, { name: 'departureDate', in: 'query', schema: { type: 'string', format: 'date' } }], responses: ok('Flight status') } },
  '/flights/watch': { post: { tags: ['Flight Oracle'], summary: 'Watch flight', requestBody: json({ flightNumber: { type: 'string' }, departureDate: { type: 'string', format: 'date' }, ticketId: { type: 'string' }, callbackUrl: { type: 'string' } }, ['flightNumber', 'departureDate']), responses: created('Watching') } },
  '/flights/watches': { get: { tags: ['Flight Oracle'], summary: 'List flight watches', parameters: [...pag], responses: list('Watches') } },

  '/boarding-passes/{ticketId}/generate': { post: { tags: ['Boarding Passes'], summary: 'Generate boarding pass', parameters: [{ name: 'ticketId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ format: { type: 'string', enum: ['apple', 'google', 'pdf'] } }), responses: created('Pass generated') } },
  '/boarding-passes/{ticketId}': { get: { tags: ['Boarding Passes'], summary: 'Get boarding pass', parameters: [{ name: 'ticketId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('Boarding pass') } },
  '/boarding-passes/{ticketId}/scan': { post: { tags: ['Boarding Passes'], summary: 'Scan boarding pass', parameters: [{ name: 'ticketId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('Scan result') } },

  '/wallet-passes/status': { get: { tags: ['Wallet Pass'], summary: 'Wallet pass config status', responses: ok('Config status') } },
  '/wallet-passes/tickets/{ticketId}/wallet-pass': { get: { tags: ['Wallet Pass'], summary: 'Generate ticket wallet pass', parameters: [{ name: 'ticketId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'platform', in: 'query', schema: { type: 'string', enum: ['apple', 'google'] } }], responses: ok('Wallet pass') } },
  '/wallet-passes/tokens/{tokenId}/wallet-pass': { get: { tags: ['Wallet Pass'], summary: 'Generate token wallet pass', parameters: [{ name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'platform', in: 'query', schema: { type: 'string', enum: ['apple', 'google'] } }], responses: ok('Wallet pass') } },

  // ═══════════════════════════════════════════════════════════════════════════
  // HACKATHON: GPU COMPUTE, PREDICTION MARKET, TRAVEL SHIELD, PROOF OF FUNDS, DEPIN
  // ═══════════════════════════════════════════════════════════════════════════
  '/gpu-nodes': {
    post: { tags: ['GPU Compute'], summary: 'Register GPU node', requestBody: json({ gpuModel: { type: 'string' }, gpuCount: { type: 'integer' }, vram: { type: 'integer' }, datacenter: { type: 'string' } }, ['gpuModel', 'gpuCount', 'vram']), responses: created('Node registered') },
    get: { tags: ['GPU Compute'], summary: 'List GPU nodes', parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'gpuModel', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Nodes') },
  },
  '/gpu-nodes/{nodeId}': { get: { tags: ['GPU Compute'], summary: 'Get GPU node', parameters: [{ name: 'nodeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('Node') } },
  '/gpu-nodes/{nodeId}/tokenize': { post: { tags: ['GPU Compute'], summary: 'Tokenize GPU node', parameters: [{ name: 'nodeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ tokenSymbol: { type: 'string' }, tokenName: { type: 'string' }, totalSupply: { type: 'string' }, pricePerToken: { type: 'string' } }, ['tokenSymbol', 'tokenName', 'totalSupply', 'pricePerToken']), responses: ok('Tokenized') } },
  '/gpu-nodes/{nodeId}/metrics': { get: { tags: ['GPU Compute'], summary: 'Node metrics', parameters: [{ name: 'nodeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: ok('Metrics') } },
  '/gpu-nodes/{nodeId}/revenue': {
    get: { tags: ['GPU Compute'], summary: 'Revenue history', parameters: [{ name: 'nodeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: list('Revenue') },
    post: { tags: ['GPU Compute'], summary: 'Record revenue', parameters: [{ name: 'nodeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: json({ grossRevenueUsd: { type: 'number' }, electricityCostUsd: { type: 'number' }, periodStart: { type: 'string' }, periodEnd: { type: 'string' } }, ['grossRevenueUsd', 'periodStart', 'periodEnd']), responses: created('Recorded') },
  },
  '/compute-market': { get: { tags: ['GPU Compute'], summary: 'Browse GPU marketplace', parameters: [{ name: 'gpuModel', in: 'query', schema: { type: 'string' } }, { name: 'minYield', in: 'query', schema: { type: 'number' } }, ...pag], responses: list('Listings') } },
  '/compute-market/analytics': { get: { tags: ['GPU Compute'], summary: 'Market analytics', responses: ok('Analytics') } },

  '/markets': {
    post: { tags: ['Prediction Market'], summary: 'Create prediction market', requestBody: json({ flightNumber: { type: 'string' }, departureDate: { type: 'string', format: 'date' }, thresholds: { type: 'object' }, closesAt: { type: 'string', format: 'date-time' } }, ['flightNumber', 'departureDate', 'thresholds', 'closesAt']), responses: created('Market created') },
    get: { tags: ['Prediction Market'], summary: 'List markets', parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Markets') },
  },
  '/markets/{id}': { get: { tags: ['Prediction Market'], summary: 'Get market', parameters: [idParam], responses: ok('Market') } },
  '/markets/bet': { post: { tags: ['Prediction Market'], summary: 'Place bet', requestBody: json({ marketId: { type: 'string', format: 'uuid' }, partyId: { type: 'string', format: 'uuid' }, outcome: { type: 'string' }, amount: { type: 'string' } }, ['marketId', 'partyId', 'outcome', 'amount']), responses: created('Bet placed') } },
  '/markets/settle': { post: { tags: ['Prediction Market'], summary: 'Settle market', requestBody: json({ marketId: { type: 'string', format: 'uuid' }, actualOutcome: { type: 'string' }, oracleProof: { type: 'object' } }, ['marketId', 'actualOutcome']), responses: ok('Settled') } },

  '/policies': {
    post: { tags: ['Travel Shield'], summary: 'Create insurance policy', requestBody: json({ partyId: { type: 'string', format: 'uuid' }, ticketId: { type: 'string', format: 'uuid' }, flightNumber: { type: 'string' }, departureDate: { type: 'string', format: 'date' }, coverage: { type: 'object' }, premium: { type: 'string' } }, ['partyId', 'ticketId', 'flightNumber', 'departureDate', 'coverage', 'premium']), responses: created('Policy created') },
    get: { tags: ['Travel Shield'], summary: 'List policies', parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Policies') },
  },
  '/policies/{id}': { get: { tags: ['Travel Shield'], summary: 'Get policy', parameters: [idParam], responses: ok('Policy') } },
  '/policies/claim': { post: { tags: ['Travel Shield'], summary: 'Trigger claim', requestBody: json({ policyId: { type: 'string', format: 'uuid' }, disruptionType: { type: 'string' }, severity: { type: 'string' } }, ['policyId', 'disruptionType', 'severity']), responses: created('Claim triggered') } },

  '/proofs': {
    post: { tags: ['Proof of Funds'], summary: 'Initiate proof of funds', requestBody: json({ partyId: { type: 'string', format: 'uuid' }, threshold: { type: 'string' }, currency: { type: 'string' }, provider: { type: 'string' } }, ['partyId', 'threshold', 'currency', 'provider']), responses: created('Proof initiated') },
    get: { tags: ['Proof of Funds'], summary: 'List proofs', parameters: [{ name: 'status', in: 'query', schema: { type: 'string' } }, ...pag], responses: list('Proofs') },
  },
  '/proofs/{id}': { get: { tags: ['Proof of Funds'], summary: 'Get proof', parameters: [idParam], responses: ok('Proof') } },
  '/proofs/{id}/verify': { post: { tags: ['Proof of Funds'], summary: 'Verify ZK proof', parameters: [idParam], responses: ok('Verification result') } },

  '/depin/devices': {
    post: { tags: ['DePIN'], summary: 'Register device', requestBody: json({ name: { type: 'string' }, deviceType: { type: 'string' }, location: { type: 'object' } }, ['name', 'deviceType']), responses: created('Device registered') },
    get: { tags: ['DePIN'], summary: 'List devices', parameters: [...pag], responses: list('Devices') },
  },
  '/depin/devices/{id}': { get: { tags: ['DePIN'], summary: 'Get device', parameters: [idParam], responses: ok('Device') } },
  '/depin/devices/{id}/readings': {
    post: { tags: ['DePIN'], summary: 'Submit reading', parameters: [idParam], requestBody: json({ readings: { type: 'array', items: { type: 'object' } } }, ['readings']), responses: created('Reading submitted') },
    get: { tags: ['DePIN'], summary: 'Get readings', parameters: [idParam], responses: list('Readings') },
  },
  '/depin/devices/{id}/tokenize': { post: { tags: ['DePIN'], summary: 'Tokenize device', parameters: [idParam], responses: ok('Tokenized') } },

  // KYC Webhooks (public, no auth)
  '/kyc-webhooks/{provider}': { post: { tags: ['KYC'], summary: 'KYC provider webhook', description: 'Receives webhooks from KYC providers (Sumsub, Onfido, Jumio). No API key required; uses provider-specific signature verification.', parameters: [{ name: 'provider', in: 'path', required: true, schema: { type: 'string', enum: ['sumsub', 'onfido', 'jumio'] } }], responses: ok('Processed'), security: [] } },
};
