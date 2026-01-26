# COMET Mock Server Demo

This demo simulates the real COMET logistics backend to demonstrate the full tokenization flow without needing access to the production API.

## Quick Start

```bash
# Install dependencies
npm install

# Terminal 1: Start mock COMET server
npm run server

# Terminal 2: Run the demo flow
npm run demo
```

## What This Demonstrates

1. **Driver data from COMET** → Telematics, deliveries, ratings
2. **Safety scoring via Chainlink** → Penalty weights fetched from API (not hardcoded)
3. **On-chain reputation** → Verified scores stored in ReputationSBT

## Available Endpoints

### COMET API (simulated)

| Endpoint | Description |
|----------|-------------|
| `GET /v1/drivers` | List all drivers |
| `GET /v1/drivers/:id` | Get driver details |
| `GET /v1/drivers/:id/telematics` | Get GPS/speed data |
| `GET /v1/drivers/:id/events` | Get safety events |
| `GET /v1/config/safety-penalties` | Get penalty configuration |

### Demo Simulation

| Endpoint | Description |
|----------|-------------|
| `POST /simulate/delivery-complete` | Simulate completed delivery |
| `POST /simulate/safety-event` | Simulate safety event (SPEEDING, etc.) |
| `GET /simulate/safety-score/:id` | Calculate current score |

## Example: Simulate Events

```bash
# Complete a delivery
curl -X POST http://localhost:3001/simulate/delivery-complete \
  -H "Content-Type: application/json" \
  -d '{"driverId": "DRV-001", "rating": 5}'

# Record a safety event
curl -X POST http://localhost:3001/simulate/safety-event \
  -H "Content-Type: application/json" \
  -d '{"driverId": "DRV-001", "eventType": "SPEEDING", "severity": "HIGH"}'

# Check score
curl http://localhost:3001/simulate/safety-score/DRV-001
```

## Connecting to Real COMET

When you have access to the real COMET API:

```typescript
import { CometDataAdapter } from '@tokenisation/sdk';

const adapter = new CometDataAdapter({
  apiUrl: 'https://api.comet.ahoy.dev',  // Real COMET
  apiKey: process.env.COMET_API_KEY,
  webhookSecret: process.env.WEBHOOK_SECRET,
  environment: 'production'
});
```

## Demo Drivers

| ID | Name | Tier | Deliveries |
|----|------|------|------------|
| DRV-001 | Ahmed Al Mansouri | GOLD | 847 |
| DRV-002 | Fatima Hassan | PLATINUM | 1523 |
| DRV-003 | Mohammed Khan | SILVER | 234 |
