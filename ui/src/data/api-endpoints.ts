export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface EndpointParam {
    name: string;
    type: string;
    required: boolean;
    description: string;
}

export interface ApiEndpoint {
    id: string;
    method: HttpMethod;
    path: string;
    summary: string;
    description: string;
    group: string;
    params?: EndpointParam[];
    bodyParams?: EndpointParam[];
    queryParams?: EndpointParam[];
    requestExample?: string;
    responseExample?: string;
    curlExample?: string;
    jsExample?: string;
    pythonExample?: string;
}

export interface EndpointGroup {
    name: string;
    endpoints: ApiEndpoint[];
}

const ENDPOINTS: ApiEndpoint[] = [
    // Assets
    {
        id: 'create-asset',
        method: 'POST',
        path: '/v1/assets',
        summary: 'Create an asset',
        description: 'Creates a new tokenised asset in DRAFT state. The asset must be transitioned through the lifecycle before tokens can be minted.',
        group: 'Assets',
        bodyParams: [
            { name: 'name', type: 'string', required: true, description: 'Human-readable name for the asset' },
            { name: 'rightType', type: 'string', required: true, description: 'Type of right: OWNERSHIP, USAGE, REVENUE, ACCESS' },
            { name: 'jurisdiction', type: 'string', required: true, description: 'ISO country code (e.g. AE, US, GB)' },
            { name: 'metadata', type: 'object', required: false, description: 'Arbitrary metadata for the asset' },
        ],
        requestExample: `{
  "name": "Marina Tower Unit 2501",
  "rightType": "OWNERSHIP",
  "jurisdiction": "AE",
  "metadata": {
    "propertyType": "residential",
    "valuation": 2500000
  }
}`,
        responseExample: `{
  "id": "asset_01HQXYZ",
  "name": "Marina Tower Unit 2501",
  "rightType": "OWNERSHIP",
  "jurisdiction": "AE",
  "state": "DRAFT",
  "createdAt": "2025-01-08T10:30:00Z",
  "metadata": {
    "propertyType": "residential",
    "valuation": 2500000
  }
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/assets \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Marina Tower Unit 2501","rightType":"OWNERSHIP","jurisdiction":"AE"}'`,
        jsExample: `const asset = await sdk.assets.create({
  name: 'Marina Tower Unit 2501',
  rightType: 'OWNERSHIP',
  jurisdiction: 'AE',
  metadata: { propertyType: 'residential' },
});`,
        pythonExample: `asset = sdk.assets.create(
    name="Marina Tower Unit 2501",
    right_type="OWNERSHIP",
    jurisdiction="AE",
    metadata={"propertyType": "residential"}
)`,
    },
    {
        id: 'list-assets',
        method: 'GET',
        path: '/v1/assets',
        summary: 'List all assets',
        description: 'Returns a paginated list of all assets in your account.',
        group: 'Assets',
        queryParams: [
            { name: 'limit', type: 'integer', required: false, description: 'Number of results (default 20, max 100)' },
            { name: 'offset', type: 'integer', required: false, description: 'Pagination offset' },
            { name: 'state', type: 'string', required: false, description: 'Filter by lifecycle state' },
        ],
        responseExample: `{
  "data": [
    { "id": "asset_01HQXYZ", "name": "Marina Tower Unit 2501", "state": "ACTIVE" },
    { "id": "asset_02ABCDE", "name": "FlyPlus Ticket #1042", "state": "DRAFT" }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}`,
        curlExample: `curl https://api.ahoy.fund/v1/assets?limit=20 \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `const assets = await sdk.assets.list({ limit: 20, state: 'ACTIVE' });`,
        pythonExample: `assets = sdk.assets.list(limit=20, state="ACTIVE")`,
    },
    {
        id: 'get-asset',
        method: 'GET',
        path: '/v1/assets/:id',
        summary: 'Retrieve an asset',
        description: 'Retrieves an asset by its ID with full metadata and current state.',
        group: 'Assets',
        params: [
            { name: 'id', type: 'string', required: true, description: 'Asset ID' },
        ],
        responseExample: `{
  "id": "asset_01HQXYZ",
  "name": "Marina Tower Unit 2501",
  "rightType": "OWNERSHIP",
  "state": "ACTIVE",
  "jurisdiction": "AE",
  "totalSupply": "1000",
  "createdAt": "2025-01-08T10:30:00Z"
}`,
        curlExample: `curl https://api.ahoy.fund/v1/assets/asset_01HQXYZ \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `const asset = await sdk.assets.get('asset_01HQXYZ');`,
        pythonExample: `asset = sdk.assets.get("asset_01HQXYZ")`,
    },
    {
        id: 'transition-asset',
        method: 'POST',
        path: '/v1/assets/:id/transition',
        summary: 'Transition asset state',
        description: 'Moves an asset to the next lifecycle state. Valid transitions: DRAFT → PENDING_VERIFICATION → VERIFIED → ACTIVE → FROZEN/REDEEMED.',
        group: 'Assets',
        params: [
            { name: 'id', type: 'string', required: true, description: 'Asset ID' },
        ],
        bodyParams: [
            { name: 'targetState', type: 'string', required: true, description: 'Target lifecycle state' },
            { name: 'partyId', type: 'string', required: false, description: 'Party performing the transition' },
        ],
        requestExample: `{
  "targetState": "ACTIVE",
  "partyId": "party_01ABC"
}`,
        responseExample: `{
  "id": "asset_01HQXYZ",
  "state": "ACTIVE",
  "previousState": "VERIFIED",
  "transitionedAt": "2025-01-08T11:00:00Z"
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/assets/asset_01HQXYZ/transition \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"targetState":"ACTIVE"}'`,
        jsExample: `await sdk.assets.transition('asset_01HQXYZ', 'ACTIVE');`,
        pythonExample: `sdk.assets.transition("asset_01HQXYZ", "ACTIVE")`,
    },
    {
        id: 'update-valuation',
        method: 'PATCH',
        path: '/v1/assets/:id/valuation',
        summary: 'Update asset valuation',
        description: 'Updates the current valuation of an asset via oracle or manual input.',
        group: 'Assets',
        params: [
            { name: 'id', type: 'string', required: true, description: 'Asset ID' },
        ],
        bodyParams: [
            { name: 'value', type: 'number', required: true, description: 'New valuation amount' },
            { name: 'currency', type: 'string', required: false, description: 'Currency code (default USD)' },
            { name: 'source', type: 'string', required: false, description: 'Valuation source (oracle, manual, appraisal)' },
        ],
        requestExample: `{ "value": 2750000, "currency": "USD", "source": "appraisal" }`,
        responseExample: `{
  "assetId": "asset_01HQXYZ",
  "valuation": 2750000,
  "currency": "USD",
  "source": "appraisal",
  "updatedAt": "2025-01-08T12:00:00Z"
}`,
        curlExample: `curl -X PATCH https://api.ahoy.fund/v1/assets/asset_01HQXYZ/valuation \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"value":2750000,"source":"appraisal"}'`,
        jsExample: `await sdk.assets.updateValuation('asset_01HQXYZ', { value: 2750000 });`,
        pythonExample: `sdk.assets.update_valuation("asset_01HQXYZ", value=2750000)`,
    },
    // Tokens
    {
        id: 'mint-tokens',
        method: 'POST',
        path: '/v1/tokens/mint',
        summary: 'Mint tokens',
        description: 'Mints new tokens for an ACTIVE asset and assigns them to a party.',
        group: 'Tokens',
        bodyParams: [
            { name: 'assetId', type: 'string', required: true, description: 'The asset to mint tokens for' },
            { name: 'to', type: 'string', required: true, description: 'Recipient party ID or address' },
            { name: 'amount', type: 'string', required: true, description: 'Amount of tokens to mint' },
        ],
        requestExample: `{ "assetId": "asset_01HQXYZ", "to": "party_01ABC", "amount": "1000" }`,
        responseExample: `{
  "txId": "tx_mint_001",
  "assetId": "asset_01HQXYZ",
  "to": "party_01ABC",
  "amount": "1000",
  "totalSupply": "1000",
  "status": "confirmed"
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/tokens/mint \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"assetId":"asset_01HQXYZ","to":"party_01ABC","amount":"1000"}'`,
        jsExample: `await sdk.tokens.mint({ assetId: 'asset_01HQXYZ', to: 'party_01ABC', amount: '1000' });`,
        pythonExample: `sdk.tokens.mint(asset_id="asset_01HQXYZ", to="party_01ABC", amount="1000")`,
    },
    {
        id: 'transfer-tokens',
        method: 'POST',
        path: '/v1/tokens/transfer',
        summary: 'Transfer tokens',
        description: 'Transfers tokens between two verified parties. Compliance checks run automatically.',
        group: 'Tokens',
        bodyParams: [
            { name: 'assetId', type: 'string', required: true, description: 'The asset whose tokens to transfer' },
            { name: 'from', type: 'string', required: true, description: 'Sender party ID' },
            { name: 'to', type: 'string', required: true, description: 'Recipient party ID' },
            { name: 'amount', type: 'string', required: true, description: 'Number of tokens to transfer' },
        ],
        requestExample: `{ "assetId": "asset_01HQXYZ", "from": "party_01ABC", "to": "party_02DEF", "amount": "500" }`,
        responseExample: `{
  "txId": "tx_transfer_002",
  "assetId": "asset_01HQXYZ",
  "from": "party_01ABC",
  "to": "party_02DEF",
  "amount": "500",
  "complianceResult": "PASS",
  "status": "confirmed"
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/tokens/transfer \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"assetId":"asset_01HQXYZ","from":"party_01ABC","to":"party_02DEF","amount":"500"}'`,
        jsExample: `await sdk.tokens.transfer({
  assetId: 'asset_01HQXYZ',
  from: 'party_01ABC',
  to: 'party_02DEF',
  amount: '500',
});`,
        pythonExample: `sdk.tokens.transfer(
    asset_id="asset_01HQXYZ",
    from_party="party_01ABC",
    to_party="party_02DEF",
    amount="500"
)`,
    },
    {
        id: 'burn-tokens',
        method: 'POST',
        path: '/v1/tokens/burn',
        summary: 'Burn tokens',
        description: 'Burns (destroys) tokens, reducing total supply. Requires issuer permissions.',
        group: 'Tokens',
        bodyParams: [
            { name: 'assetId', type: 'string', required: true, description: 'Asset ID' },
            { name: 'from', type: 'string', required: true, description: 'Party whose tokens to burn' },
            { name: 'amount', type: 'string', required: true, description: 'Amount to burn' },
        ],
        requestExample: `{ "assetId": "asset_01HQXYZ", "from": "party_01ABC", "amount": "100" }`,
        responseExample: `{ "txId": "tx_burn_003", "amount": "100", "newTotalSupply": "900" }`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/tokens/burn \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"assetId":"asset_01HQXYZ","from":"party_01ABC","amount":"100"}'`,
        jsExample: `await sdk.tokens.burn({ assetId: 'asset_01HQXYZ', from: 'party_01ABC', amount: '100' });`,
        pythonExample: `sdk.tokens.burn(asset_id="asset_01HQXYZ", from_party="party_01ABC", amount="100")`,
    },
    {
        id: 'get-balance',
        method: 'GET',
        path: '/v1/tokens/balance/:assetId/:partyId',
        summary: 'Get token balance',
        description: 'Returns the token balance for a specific party and asset.',
        group: 'Tokens',
        params: [
            { name: 'assetId', type: 'string', required: true, description: 'Asset ID' },
            { name: 'partyId', type: 'string', required: true, description: 'Party ID' },
        ],
        responseExample: `{ "assetId": "asset_01HQXYZ", "partyId": "party_01ABC", "balance": "500" }`,
        curlExample: `curl https://api.ahoy.fund/v1/tokens/balance/asset_01HQXYZ/party_01ABC \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `const balance = await sdk.tokens.getBalance('asset_01HQXYZ', 'party_01ABC');`,
        pythonExample: `balance = sdk.tokens.get_balance("asset_01HQXYZ", "party_01ABC")`,
    },
    // Transfers
    {
        id: 'list-transfers',
        method: 'GET',
        path: '/v1/transfers',
        summary: 'List transfers',
        description: 'Returns a paginated list of token transfers with filtering.',
        group: 'Transfers',
        queryParams: [
            { name: 'assetId', type: 'string', required: false, description: 'Filter by asset' },
            { name: 'partyId', type: 'string', required: false, description: 'Filter by sender or receiver' },
            { name: 'limit', type: 'integer', required: false, description: 'Number of results' },
        ],
        responseExample: `{
  "data": [
    { "txId": "tx_002", "from": "party_01ABC", "to": "party_02DEF", "amount": "500", "status": "confirmed" }
  ],
  "total": 15
}`,
        curlExample: `curl https://api.ahoy.fund/v1/transfers?assetId=asset_01HQXYZ \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `const transfers = await sdk.transfers.list({ assetId: 'asset_01HQXYZ' });`,
        pythonExample: `transfers = sdk.transfers.list(asset_id="asset_01HQXYZ")`,
    },
    // Investors / Parties
    {
        id: 'create-party',
        method: 'POST',
        path: '/v1/parties',
        summary: 'Create a party',
        description: 'Creates a new party (investor, issuer, or counterparty) in the system.',
        group: 'Investors',
        bodyParams: [
            { name: 'name', type: 'string', required: true, description: 'Full name or entity name' },
            { name: 'type', type: 'string', required: true, description: 'Party type: individual, institutional, fund' },
            { name: 'jurisdiction', type: 'string', required: true, description: 'ISO country code' },
            { name: 'email', type: 'string', required: false, description: 'Contact email' },
        ],
        requestExample: `{ "name": "Dubai Holdings LLC", "type": "institutional", "jurisdiction": "AE", "email": "ops@dubai-holdings.ae" }`,
        responseExample: `{
  "id": "party_01ABC",
  "name": "Dubai Holdings LLC",
  "type": "institutional",
  "jurisdiction": "AE",
  "kycStatus": "pending",
  "createdAt": "2025-01-08T10:00:00Z"
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/parties \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"name":"Dubai Holdings LLC","type":"institutional","jurisdiction":"AE"}'`,
        jsExample: `const party = await sdk.parties.create({
  name: 'Dubai Holdings LLC',
  type: 'institutional',
  jurisdiction: 'AE',
});`,
        pythonExample: `party = sdk.parties.create(
    name="Dubai Holdings LLC",
    type="institutional",
    jurisdiction="AE"
)`,
    },
    {
        id: 'list-parties',
        method: 'GET',
        path: '/v1/parties',
        summary: 'List parties',
        description: 'Returns all parties with optional filtering by type and KYC status.',
        group: 'Investors',
        queryParams: [
            { name: 'type', type: 'string', required: false, description: 'Filter by party type' },
            { name: 'kycStatus', type: 'string', required: false, description: 'Filter by KYC status' },
            { name: 'limit', type: 'integer', required: false, description: 'Number of results' },
        ],
        responseExample: `{
  "data": [
    { "id": "party_01ABC", "name": "Dubai Holdings LLC", "type": "institutional", "kycStatus": "verified" }
  ],
  "total": 8
}`,
        curlExample: `curl https://api.ahoy.fund/v1/parties?kycStatus=verified \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `const parties = await sdk.parties.list({ kycStatus: 'verified' });`,
        pythonExample: `parties = sdk.parties.list(kyc_status="verified")`,
    },
    {
        id: 'get-party',
        method: 'GET',
        path: '/v1/parties/:id',
        summary: 'Retrieve a party',
        description: 'Gets full details for a specific party including KYC status and holdings.',
        group: 'Investors',
        params: [{ name: 'id', type: 'string', required: true, description: 'Party ID' }],
        responseExample: `{
  "id": "party_01ABC",
  "name": "Dubai Holdings LLC",
  "type": "institutional",
  "kycStatus": "verified",
  "kycLevel": "enhanced",
  "holdings": [
    { "assetId": "asset_01HQXYZ", "balance": "500" }
  ]
}`,
        curlExample: `curl https://api.ahoy.fund/v1/parties/party_01ABC \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `const party = await sdk.parties.get('party_01ABC');`,
        pythonExample: `party = sdk.parties.get("party_01ABC")`,
    },
    // Compliance
    {
        id: 'check-transfer',
        method: 'POST',
        path: '/v1/compliance/check-transfer',
        summary: 'Check transfer eligibility',
        description: 'Evaluates whether a proposed transfer would pass compliance rules without executing it.',
        group: 'Compliance',
        bodyParams: [
            { name: 'assetId', type: 'string', required: true, description: 'Asset ID' },
            { name: 'from', type: 'string', required: true, description: 'Sender party ID' },
            { name: 'to', type: 'string', required: true, description: 'Recipient party ID' },
            { name: 'amount', type: 'string', required: true, description: 'Amount to check' },
        ],
        requestExample: `{ "assetId": "asset_01HQXYZ", "from": "party_01ABC", "to": "party_02DEF", "amount": "500" }`,
        responseExample: `{
  "result": "ALLOW",
  "checks": [
    { "rule": "KYC_VERIFIED", "status": "pass" },
    { "rule": "JURISDICTION_ALLOWED", "status": "pass" },
    { "rule": "HOLDING_PERIOD", "status": "pass" },
    { "rule": "AML_SCREENING", "status": "pass" }
  ],
  "violations": []
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/compliance/check-transfer \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"assetId":"asset_01HQXYZ","from":"party_01ABC","to":"party_02DEF","amount":"500"}'`,
        jsExample: `const result = await sdk.compliance.checkTransfer({
  assetId: 'asset_01HQXYZ',
  from: 'party_01ABC',
  to: 'party_02DEF',
  amount: '500',
});`,
        pythonExample: `result = sdk.compliance.check_transfer(
    asset_id="asset_01HQXYZ",
    from_party="party_01ABC",
    to_party="party_02DEF",
    amount="500"
)`,
    },
    {
        id: 'list-policies',
        method: 'GET',
        path: '/v1/compliance/policies',
        summary: 'List compliance policies',
        description: 'Returns all active compliance policies.',
        group: 'Compliance',
        responseExample: `{
  "data": [
    { "id": "pol_001", "name": "KYC Required", "type": "kyc", "status": "active" },
    { "id": "pol_002", "name": "Jurisdiction Whitelist", "type": "jurisdiction", "status": "active" }
  ]
}`,
        curlExample: `curl https://api.ahoy.fund/v1/compliance/policies \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `const policies = await sdk.compliance.listPolicies();`,
        pythonExample: `policies = sdk.compliance.list_policies()`,
    },
    {
        id: 'verify-kyc',
        method: 'POST',
        path: '/v1/compliance/kyc/:partyId/verify',
        summary: 'Verify KYC',
        description: 'Initiates or completes KYC verification for a party.',
        group: 'Compliance',
        params: [{ name: 'partyId', type: 'string', required: true, description: 'Party ID' }],
        bodyParams: [
            { name: 'level', type: 'string', required: false, description: 'Verification level: standard, enhanced' },
            { name: 'documents', type: 'array', required: false, description: 'Document references for verification' },
        ],
        requestExample: `{ "level": "enhanced", "documents": ["doc_passport_001"] }`,
        responseExample: `{
  "partyId": "party_01ABC",
  "kycStatus": "verified",
  "kycLevel": "enhanced",
  "verifiedAt": "2025-01-08T10:15:00Z"
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/compliance/kyc/party_01ABC/verify \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"level":"enhanced"}'`,
        jsExample: `await sdk.compliance.verifyKyc('party_01ABC', { level: 'enhanced' });`,
        pythonExample: `sdk.compliance.verify_kyc("party_01ABC", level="enhanced")`,
    },
    // Webhooks
    {
        id: 'create-webhook',
        method: 'POST',
        path: '/v1/webhooks',
        summary: 'Create a webhook endpoint',
        description: 'Registers a new webhook endpoint to receive real-time event notifications.',
        group: 'Webhooks',
        bodyParams: [
            { name: 'url', type: 'string', required: true, description: 'HTTPS endpoint URL' },
            { name: 'events', type: 'string[]', required: true, description: 'Event types to subscribe to' },
            { name: 'secret', type: 'string', required: false, description: 'Signing secret for verification' },
        ],
        requestExample: `{
  "url": "https://api.myapp.com/webhooks/ahoy",
  "events": ["asset.created", "asset.transferred", "identity.verified"]
}`,
        responseExample: `{
  "id": "wh_001",
  "url": "https://api.myapp.com/webhooks/ahoy",
  "events": ["asset.created", "asset.transferred", "identity.verified"],
  "status": "active",
  "secret": "whsec_xxxxxxxxxxxx",
  "createdAt": "2025-01-08T10:00:00Z"
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/webhooks \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"url":"https://api.myapp.com/webhooks/ahoy","events":["asset.created"]}'`,
        jsExample: `const webhook = await sdk.webhooks.create({
  url: 'https://api.myapp.com/webhooks/ahoy',
  events: ['asset.created', 'identity.verified'],
});`,
        pythonExample: `webhook = sdk.webhooks.create(
    url="https://api.myapp.com/webhooks/ahoy",
    events=["asset.created", "identity.verified"]
)`,
    },
    {
        id: 'list-webhooks',
        method: 'GET',
        path: '/v1/webhooks',
        summary: 'List webhook endpoints',
        description: 'Returns all registered webhook endpoints.',
        group: 'Webhooks',
        responseExample: `{
  "data": [
    { "id": "wh_001", "url": "https://api.myapp.com/webhooks/ahoy", "status": "active", "events": ["asset.created"] }
  ]
}`,
        curlExample: `curl https://api.ahoy.fund/v1/webhooks \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `const webhooks = await sdk.webhooks.list();`,
        pythonExample: `webhooks = sdk.webhooks.list()`,
    },
    {
        id: 'delete-webhook',
        method: 'DELETE',
        path: '/v1/webhooks/:id',
        summary: 'Delete a webhook endpoint',
        description: 'Removes a webhook endpoint. Events will no longer be delivered.',
        group: 'Webhooks',
        params: [{ name: 'id', type: 'string', required: true, description: 'Webhook ID' }],
        responseExample: `{ "deleted": true }`,
        curlExample: `curl -X DELETE https://api.ahoy.fund/v1/webhooks/wh_001 \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `await sdk.webhooks.delete('wh_001');`,
        pythonExample: `sdk.webhooks.delete("wh_001")`,
    },
    {
        id: 'test-webhook',
        method: 'POST',
        path: '/v1/webhooks/:id/test',
        summary: 'Test a webhook endpoint',
        description: 'Sends a test event to the webhook endpoint to verify it is reachable.',
        group: 'Webhooks',
        params: [{ name: 'id', type: 'string', required: true, description: 'Webhook ID' }],
        responseExample: `{ "delivered": true, "statusCode": 200, "latencyMs": 145 }`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/webhooks/wh_001/test \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `await sdk.webhooks.test('wh_001');`,
        pythonExample: `sdk.webhooks.test("wh_001")`,
    },
    // Distributions
    {
        id: 'create-distribution',
        method: 'POST',
        path: '/v1/distributions',
        summary: 'Create a distribution',
        description: 'Schedules a dividend or revenue distribution to token holders.',
        group: 'Distributions',
        bodyParams: [
            { name: 'assetId', type: 'string', required: true, description: 'Asset ID' },
            { name: 'amount', type: 'number', required: true, description: 'Total distribution amount' },
            { name: 'currency', type: 'string', required: true, description: 'Currency (USD, AED, etc.)' },
            { name: 'scheduledAt', type: 'string', required: false, description: 'ISO 8601 date for scheduled distribution' },
        ],
        requestExample: `{ "assetId": "asset_01HQXYZ", "amount": 50000, "currency": "USD" }`,
        responseExample: `{
  "id": "dist_001",
  "assetId": "asset_01HQXYZ",
  "totalAmount": 50000,
  "currency": "USD",
  "status": "scheduled",
  "recipients": 12
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/distributions \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"assetId":"asset_01HQXYZ","amount":50000,"currency":"USD"}'`,
        jsExample: `await sdk.distributions.create({ assetId: 'asset_01HQXYZ', amount: 50000, currency: 'USD' });`,
        pythonExample: `sdk.distributions.create(asset_id="asset_01HQXYZ", amount=50000, currency="USD")`,
    },
    {
        id: 'list-distributions',
        method: 'GET',
        path: '/v1/distributions',
        summary: 'List distributions',
        description: 'Returns scheduled and completed distributions.',
        group: 'Distributions',
        queryParams: [
            { name: 'assetId', type: 'string', required: false, description: 'Filter by asset' },
            { name: 'status', type: 'string', required: false, description: 'Filter: scheduled, completed, failed' },
        ],
        responseExample: `{
  "data": [
    { "id": "dist_001", "assetId": "asset_01HQXYZ", "totalAmount": 50000, "status": "completed" }
  ]
}`,
        curlExample: `curl https://api.ahoy.fund/v1/distributions \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `const distributions = await sdk.distributions.list();`,
        pythonExample: `distributions = sdk.distributions.list()`,
    },
    // Oracles
    {
        id: 'update-oracle',
        method: 'POST',
        path: '/v1/oracles/:assetId/update',
        summary: 'Push oracle data',
        description: 'Pushes new price/valuation data from an oracle source.',
        group: 'Oracles',
        params: [{ name: 'assetId', type: 'string', required: true, description: 'Asset ID' }],
        bodyParams: [
            { name: 'value', type: 'number', required: true, description: 'New oracle value' },
            { name: 'source', type: 'string', required: true, description: 'Oracle source identifier' },
            { name: 'confidence', type: 'number', required: false, description: 'Confidence score 0-1' },
        ],
        requestExample: `{ "value": 2800000, "source": "chainlink_rwa", "confidence": 0.95 }`,
        responseExample: `{
  "assetId": "asset_01HQXYZ",
  "value": 2800000,
  "source": "chainlink_rwa",
  "confidence": 0.95,
  "timestamp": "2025-01-08T12:30:00Z"
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/oracles/asset_01HQXYZ/update \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"value":2800000,"source":"chainlink_rwa","confidence":0.95}'`,
        jsExample: `await sdk.oracles.update('asset_01HQXYZ', { value: 2800000, source: 'chainlink_rwa' });`,
        pythonExample: `sdk.oracles.update("asset_01HQXYZ", value=2800000, source="chainlink_rwa")`,
    },
    {
        id: 'get-oracle-history',
        method: 'GET',
        path: '/v1/oracles/:assetId/history',
        summary: 'Get oracle history',
        description: 'Returns the price/valuation history from oracle feeds.',
        group: 'Oracles',
        params: [{ name: 'assetId', type: 'string', required: true, description: 'Asset ID' }],
        queryParams: [
            { name: 'from', type: 'string', required: false, description: 'Start date (ISO 8601)' },
            { name: 'to', type: 'string', required: false, description: 'End date (ISO 8601)' },
        ],
        responseExample: `{
  "assetId": "asset_01HQXYZ",
  "data": [
    { "value": 2500000, "timestamp": "2025-01-01T00:00:00Z" },
    { "value": 2650000, "timestamp": "2025-01-04T00:00:00Z" },
    { "value": 2800000, "timestamp": "2025-01-08T12:30:00Z" }
  ]
}`,
        curlExample: `curl https://api.ahoy.fund/v1/oracles/asset_01HQXYZ/history \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `const history = await sdk.oracles.getHistory('asset_01HQXYZ');`,
        pythonExample: `history = sdk.oracles.get_history("asset_01HQXYZ")`,
    },
    // Evidence
    {
        id: 'create-evidence',
        method: 'POST',
        path: '/v1/evidence',
        summary: 'Create evidence record',
        description: 'Creates an immutable evidence record linked to an asset.',
        group: 'Evidence',
        bodyParams: [
            { name: 'assetId', type: 'string', required: true, description: 'Asset ID' },
            { name: 'type', type: 'string', required: true, description: 'Evidence type: document, appraisal, audit, legal' },
            { name: 'hash', type: 'string', required: true, description: 'SHA-256 hash of the document' },
            { name: 'description', type: 'string', required: false, description: 'Evidence description' },
        ],
        requestExample: `{
  "assetId": "asset_01HQXYZ",
  "type": "appraisal",
  "hash": "sha256:a1b2c3d4...",
  "description": "Q1 2025 property valuation report"
}`,
        responseExample: `{
  "id": "ev_001",
  "assetId": "asset_01HQXYZ",
  "type": "appraisal",
  "hash": "sha256:a1b2c3d4...",
  "verified": true,
  "createdAt": "2025-01-08T13:00:00Z"
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/evidence \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"assetId":"asset_01HQXYZ","type":"appraisal","hash":"sha256:a1b2c3d4..."}'`,
        jsExample: `await sdk.evidence.create({
  assetId: 'asset_01HQXYZ',
  type: 'appraisal',
  hash: 'sha256:a1b2c3d4...',
});`,
        pythonExample: `sdk.evidence.create(
    asset_id="asset_01HQXYZ",
    type="appraisal",
    hash="sha256:a1b2c3d4..."
)`,
    },
    {
        id: 'list-evidence',
        method: 'GET',
        path: '/v1/evidence/:assetId',
        summary: 'List evidence for asset',
        description: 'Returns all evidence records linked to a specific asset.',
        group: 'Evidence',
        params: [{ name: 'assetId', type: 'string', required: true, description: 'Asset ID' }],
        responseExample: `{
  "data": [
    { "id": "ev_001", "type": "appraisal", "verified": true, "createdAt": "2025-01-08T13:00:00Z" }
  ]
}`,
        curlExample: `curl https://api.ahoy.fund/v1/evidence/asset_01HQXYZ \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `const evidence = await sdk.evidence.list('asset_01HQXYZ');`,
        pythonExample: `evidence = sdk.evidence.list("asset_01HQXYZ")`,
    },
    // API Keys
    {
        id: 'create-api-key',
        method: 'POST',
        path: '/v1/api-keys',
        summary: 'Create an API key',
        description: 'Creates a new API key with specified type and permissions.',
        group: 'API Keys',
        bodyParams: [
            { name: 'name', type: 'string', required: true, description: 'Human-readable key name' },
            { name: 'type', type: 'string', required: true, description: 'Key type: secret, publishable, restricted' },
            { name: 'permissions', type: 'string[]', required: false, description: 'Permission scopes (for restricted keys)' },
        ],
        requestExample: `{ "name": "Mobile App Key", "type": "restricted", "permissions": ["assets:read", "tokens:read"] }`,
        responseExample: `{
  "id": "key_004",
  "name": "Mobile App Key",
  "type": "restricted",
  "key": "rk_live_ahoy_newkey...",
  "permissions": ["assets:read", "tokens:read"],
  "createdAt": "2025-01-08T14:00:00Z"
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/api-keys \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"name":"Mobile App Key","type":"restricted","permissions":["assets:read"]}'`,
        jsExample: `const key = await sdk.apiKeys.create({ name: 'Mobile App Key', type: 'restricted' });`,
        pythonExample: `key = sdk.api_keys.create(name="Mobile App Key", type="restricted")`,
    },
    {
        id: 'list-api-keys',
        method: 'GET',
        path: '/v1/api-keys',
        summary: 'List API keys',
        description: 'Returns all API keys. Secret key values are masked.',
        group: 'API Keys',
        responseExample: `{
  "data": [
    { "id": "key_001", "name": "Production Secret", "type": "secret", "lastUsed": "2025-01-08T09:45:00Z" }
  ]
}`,
        curlExample: `curl https://api.ahoy.fund/v1/api-keys \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `const keys = await sdk.apiKeys.list();`,
        pythonExample: `keys = sdk.api_keys.list()`,
    },
    {
        id: 'revoke-api-key',
        method: 'DELETE',
        path: '/v1/api-keys/:id',
        summary: 'Revoke an API key',
        description: 'Permanently revokes an API key. This cannot be undone.',
        group: 'API Keys',
        params: [{ name: 'id', type: 'string', required: true, description: 'Key ID' }],
        responseExample: `{ "deleted": true, "id": "key_004" }`,
        curlExample: `curl -X DELETE https://api.ahoy.fund/v1/api-keys/key_004 \\
  -H "Authorization: Bearer sk_live_ahoy_xxx"`,
        jsExample: `await sdk.apiKeys.revoke('key_004');`,
        pythonExample: `sdk.api_keys.revoke("key_004")`,
    },
    // Staking
    {
        id: 'stake-tokens',
        method: 'POST',
        path: '/v1/staking/stake',
        summary: 'Stake tokens',
        description: 'Stakes tokens for a specific asset to earn rewards.',
        group: 'Staking',
        bodyParams: [
            { name: 'assetId', type: 'string', required: true, description: 'Asset ID' },
            { name: 'partyId', type: 'string', required: true, description: 'Party staking the tokens' },
            { name: 'amount', type: 'string', required: true, description: 'Amount to stake' },
            { name: 'lockPeriod', type: 'integer', required: false, description: 'Lock period in days' },
        ],
        requestExample: `{ "assetId": "asset_01HQXYZ", "partyId": "party_01ABC", "amount": "200", "lockPeriod": 90 }`,
        responseExample: `{
  "stakeId": "stake_001",
  "assetId": "asset_01HQXYZ",
  "amount": "200",
  "apy": "8.5%",
  "unlockDate": "2025-04-08T10:00:00Z"
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/staking/stake \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"assetId":"asset_01HQXYZ","partyId":"party_01ABC","amount":"200","lockPeriod":90}'`,
        jsExample: `await sdk.staking.stake({ assetId: 'asset_01HQXYZ', amount: '200', lockPeriod: 90 });`,
        pythonExample: `sdk.staking.stake(asset_id="asset_01HQXYZ", amount="200", lock_period=90)`,
    },
    {
        id: 'unstake-tokens',
        method: 'POST',
        path: '/v1/staking/unstake',
        summary: 'Unstake tokens',
        description: 'Unstakes tokens after the lock period has elapsed.',
        group: 'Staking',
        bodyParams: [
            { name: 'stakeId', type: 'string', required: true, description: 'Stake ID' },
        ],
        requestExample: `{ "stakeId": "stake_001" }`,
        responseExample: `{ "stakeId": "stake_001", "amount": "200", "rewards": "4.25", "status": "unstaked" }`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/staking/unstake \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"stakeId":"stake_001"}'`,
        jsExample: `await sdk.staking.unstake('stake_001');`,
        pythonExample: `sdk.staking.unstake("stake_001")`,
    },
    // Governance
    {
        id: 'create-proposal',
        method: 'POST',
        path: '/v1/governance/proposals',
        summary: 'Create a governance proposal',
        description: 'Creates a new governance proposal for token holder voting.',
        group: 'Governance',
        bodyParams: [
            { name: 'assetId', type: 'string', required: true, description: 'Asset ID' },
            { name: 'title', type: 'string', required: true, description: 'Proposal title' },
            { name: 'description', type: 'string', required: true, description: 'Detailed description' },
            { name: 'votingPeriod', type: 'integer', required: false, description: 'Voting period in hours (default 72)' },
        ],
        requestExample: `{
  "assetId": "asset_01HQXYZ",
  "title": "Increase maintenance budget",
  "description": "Proposal to increase annual maintenance allocation by 15%",
  "votingPeriod": 72
}`,
        responseExample: `{
  "id": "prop_001",
  "title": "Increase maintenance budget",
  "status": "active",
  "votesFor": 0,
  "votesAgainst": 0,
  "endsAt": "2025-01-11T10:00:00Z"
}`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/governance/proposals \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"assetId":"asset_01HQXYZ","title":"Increase maintenance budget","description":"...","votingPeriod":72}'`,
        jsExample: `await sdk.governance.createProposal({
  assetId: 'asset_01HQXYZ',
  title: 'Increase maintenance budget',
  description: '...',
});`,
        pythonExample: `sdk.governance.create_proposal(
    asset_id="asset_01HQXYZ",
    title="Increase maintenance budget",
    description="..."
)`,
    },
    {
        id: 'vote-proposal',
        method: 'POST',
        path: '/v1/governance/proposals/:id/vote',
        summary: 'Vote on a proposal',
        description: 'Casts a vote on an active governance proposal. Voting power is proportional to token holdings.',
        group: 'Governance',
        params: [{ name: 'id', type: 'string', required: true, description: 'Proposal ID' }],
        bodyParams: [
            { name: 'partyId', type: 'string', required: true, description: 'Voter party ID' },
            { name: 'vote', type: 'string', required: true, description: 'Vote: for, against, abstain' },
        ],
        requestExample: `{ "partyId": "party_01ABC", "vote": "for" }`,
        responseExample: `{ "proposalId": "prop_001", "vote": "for", "weight": 500, "recorded": true }`,
        curlExample: `curl -X POST https://api.ahoy.fund/v1/governance/proposals/prop_001/vote \\
  -H "Authorization: Bearer sk_live_ahoy_xxx" \\
  -d '{"partyId":"party_01ABC","vote":"for"}'`,
        jsExample: `await sdk.governance.vote('prop_001', { partyId: 'party_01ABC', vote: 'for' });`,
        pythonExample: `sdk.governance.vote("prop_001", party_id="party_01ABC", vote="for")`,
    },
];

export function getEndpointGroups(): EndpointGroup[] {
    const groupMap = new Map<string, ApiEndpoint[]>();
    for (const ep of ENDPOINTS) {
        const list = groupMap.get(ep.group) || [];
        list.push(ep);
        groupMap.set(ep.group, list);
    }
    return Array.from(groupMap.entries()).map(([name, endpoints]) => ({ name, endpoints }));
}

export function getEndpointById(id: string): ApiEndpoint | undefined {
    return ENDPOINTS.find(ep => ep.id === id);
}

export { ENDPOINTS };
