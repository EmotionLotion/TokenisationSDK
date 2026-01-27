# Postman Collection

Postman collection and environment for the TokenisationSDK API.

## Files

- `Tokenisation_SDK.postman_collection.json` - Complete API collection
- `Tokenisation_SDK.postman_environment.json` - Environment variables

## Import

1. Open Postman
2. Click **Import** in the top left
3. Drag both files or click **Upload Files**
4. Select the imported environment from the dropdown (top right)

## Setup

### Configure Environment Variables

1. Click the **eye icon** next to the environment dropdown
2. Click **Edit** on the "Tokenisation SDK - Local" environment
3. Fill in required values:

| Variable | Description | Example |
|----------|-------------|---------|
| `base_url` | API server URL | `http://localhost:3001` |
| `api_key` | Your API key | `sk_test_xxx` |
| `oauth_client_id` | OAuth client ID | `client_xxx` |
| `oauth_client_secret` | OAuth client secret | `secret_xxx` |

Other variables are populated automatically as you make requests.

## Collection Structure

### Health
- **Health Check** - Verify server is running

### OAuth2
- **Get Token (Client Credentials)** - Get access token
- **Refresh Token** - Refresh expired token
- **Server Metadata** - OAuth2 discovery document
- **List Scopes** - Available OAuth scopes

### Projects
- **List Projects** - Get all projects
- **Create Project** - Create new project
- **Get Project** - Get project by ID

### Assets
- **List Assets** - Get all assets
- **Create Asset** - Create new asset
- **Get Asset** - Get asset by ID

### Tokens
- **List Tokens** - Get all tokens
- **Create Token** - Create new token
- **Get Token** - Get token by ID
- **Deploy Token** - Deploy token to blockchain

### Investors
- **List Investors** - Get all investors
- **Create Investor** - Create new investor
- **Get Investor** - Get investor by ID
- **Add Investor Wallet** - Add wallet to investor

### Transfers
- **List Transfers** - Get all transfers
- **Create Transfer** - Create new transfer
- **Get Transfer** - Get transfer by ID

### Compliance
- **Evaluate Transfer** - Pre-check transfer compliance
- **List Policies** - Get compliance policies

### Webhooks
- **List Endpoints** - Get webhook endpoints
- **Create Endpoint** - Register webhook endpoint

### Ledger
- **Get Positions** - Get token holder positions
- **Get Events** - Get ledger events

## Workflow Examples

### Create and Tokenize an Asset

1. **Create Project** → Copy `project_id` from response
2. **Create Asset** → Copy `asset_id` from response
3. **Create Token** → Copy `token_id` from response
4. **Deploy Token** → Token is now on-chain

### Register an Investor

1. **Create Investor** → Copy `investor_id` from response
2. **Add Investor Wallet** → Wallet linked to investor

### Execute a Transfer

1. **Evaluate Transfer** → Check compliance (optional)
2. **Create Transfer** → Execute the transfer
3. **Get Transfer** → Monitor transfer status

## Using with OAuth2

1. Run **Get Token (Client Credentials)** first
2. Copy `access_token` from response
3. The collection uses Bearer token auth automatically

Or use refresh tokens:
1. Run **Refresh Token** with stored refresh token
2. New access token is issued

## Tips

### Auto-populate Variables

Many requests include test scripts that auto-populate variables:

```javascript
// After Create Project
pm.environment.set("project_id", pm.response.json().data.id);
```

### Run Collection

Use Postman's Collection Runner to execute multiple requests:
1. Click **Run** on the collection
2. Select requests to run
3. Set iteration count
4. Click **Run Tokenisation SDK API**

### Environment Switching

Create additional environments for:
- **Staging**: `https://staging-api.example.com`
- **Production**: `https://api.example.com`

## Troubleshooting

### 401 Unauthorized

- Check `api_key` is set correctly
- Verify token hasn't expired (run Get Token again)

### 404 Not Found

- Verify `base_url` is correct
- Check resource IDs are populated

### Connection Refused

- Ensure the API server is running
- Check `base_url` matches server address

## Updates

To update the collection after API changes:
1. Re-import the updated collection file
2. Choose **Replace** when prompted
3. Environment variables are preserved
