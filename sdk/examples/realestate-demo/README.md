# Real Estate Tokenization Demo

This example demonstrates how to use the Tokenisation SDK to tokenize real estate properties with fractional ownership.

## Features

- Tokenize real estate properties as ERC-3643 security tokens
- Manage fractional ownership with investor qualification
- Process compliant peer-to-peer transfers
- Distribute rental income as dividends
- Integration with Dubai Land Department (DLD)

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API credentials
   ```

3. **Start the server**
   ```bash
   npm run dev
   ```

4. **Test the API**
   ```bash
   # Create a property
   curl -X POST http://localhost:3003/properties \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Marina Tower Unit 1501",
       "location": {
         "address": "Marina Walk, Dubai Marina",
         "city": "Dubai",
         "country": "AE"
       },
       "valuation": 2500000,
       "totalShares": 1000
     }'

   # Onboard an investor
   curl -X POST http://localhost:3003/investors \
     -H "Content-Type: application/json" \
     -d '{
       "name": "John Investor",
       "email": "john@example.com",
       "wallet": "0x1234...",
       "classification": "accredited"
     }'

   # Invest in a property
   curl -X POST http://localhost:3003/properties/prop_123/invest \
     -H "Content-Type: application/json" \
     -d '{
       "investorId": "inv_123",
       "shares": 100,
       "paymentAmount": 250000
     }'
   ```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/properties` | Create a new property |
| GET | `/properties/:id` | Get property details |
| GET | `/properties` | List all properties |
| POST | `/properties/:id/tokenize` | Deploy property token |
| POST | `/properties/:id/invest` | Invest in property |
| POST | `/investors` | Onboard new investor |
| GET | `/investors/:id` | Get investor details |
| POST | `/distributions` | Create dividend distribution |
| POST | `/webhooks` | Receive webhook events |

## How It Works

### 1. Property Tokenization

Properties are tokenized as ERC-3643 compliant security tokens:

```typescript
const property = await propertyService.createProperty({
  name: 'Marina Tower Unit 1501',
  location: { ... },
  valuation: 2500000,
  totalShares: 1000,
});

await propertyService.tokenizeProperty(property.id, {
  symbol: 'MARINA1501',
  chainId: 137, // Polygon
});
```

### 2. Investor Qualification

Investors must pass KYC and meet qualification requirements:

```typescript
const investor = await investorService.onboard({
  name: 'John Investor',
  email: 'john@example.com',
  wallet: '0x...',
  classification: 'accredited',
});

// KYC verification happens automatically
// Investor can only invest after KYC passes
```

### 3. Compliant Transfers

All transfers go through compliance checks:

```typescript
// Automatic compliance verification:
// - Both parties are KYC verified
// - Investor classifications match requirements
// - Country restrictions are enforced
// - Lock-up periods are respected
```

### 4. Dividend Distribution

Rental income can be distributed to token holders:

```typescript
await propertyService.distributeRent({
  propertyId: 'prop_123',
  amount: 50000, // Total rental income
  currency: 'USD',
  paymentDate: '2024-01-15',
});
```

## Compliance Rules

The demo implements Dubai real estate compliance rules:
- Minimum investment thresholds
- Accredited investor requirements
- Anti-money laundering checks
- DLD registration requirements
- Lock-up periods for new investments
