# Airline Ticket Tokenization Demo

This example demonstrates how to use the Tokenisation SDK to create and manage tokenized airline tickets.

## Features

- Issue tokenized airline tickets as NFTs
- Transfer tickets between passengers
- Handle flight changes and cancellations
- Process refunds
- Webhook integration for real-time updates

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
   # Issue a ticket
   curl -X POST http://localhost:3002/tickets \
     -H "Content-Type: application/json" \
     -d '{
       "passengerId": "passenger_123",
       "flight": {
         "number": "TK1234",
         "departure": "DXB",
         "arrival": "LHR",
         "date": "2024-06-15",
         "class": "business"
       }
     }'

   # Transfer a ticket
   curl -X POST http://localhost:3002/tickets/ticket_123/transfer \
     -H "Content-Type: application/json" \
     -d '{
       "toPassengerId": "passenger_456"
     }'
   ```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tickets` | Issue a new ticket |
| GET | `/tickets/:id` | Get ticket details |
| GET | `/tickets` | List all tickets |
| POST | `/tickets/:id/transfer` | Transfer ticket to another passenger |
| POST | `/tickets/:id/cancel` | Cancel and refund a ticket |
| POST | `/webhooks` | Receive webhook events |

## Project Structure

```
airline-demo/
├── src/
│   ├── index.ts        # Express server setup
│   ├── routes/
│   │   ├── tickets.ts  # Ticket CRUD operations
│   │   └── webhooks.ts # Webhook handler
│   └── services/
│       └── airline.ts  # SDK integration layer
├── .env.example
├── package.json
└── README.md
```

## How It Works

### 1. Ticket Issuance

When a ticket is purchased, we create a tokenized asset representing the ticket:

```typescript
const ticket = await airlineService.issueTicket({
  passengerId: 'passenger_123',
  flight: {
    number: 'TK1234',
    departure: 'DXB',
    arrival: 'LHR',
    date: '2024-06-15',
    class: 'business',
  },
});
```

### 2. Ticket Transfer

Passengers can transfer tickets to others (subject to airline policy):

```typescript
await airlineService.transferTicket(
  ticketId,
  fromPassengerId,
  toPassengerId
);
```

### 3. Webhook Events

The demo listens for these events:
- `token.deployed` - Ticket NFT minted
- `transfer.confirmed` - Transfer completed
- `token.burned` - Ticket cancelled/refunded

## Compliance Rules

The demo implements these compliance rules:
- Transfers only allowed 24h+ before departure
- Same-day transfers blocked
- Refunds follow airline policy
- All transfers are audited
