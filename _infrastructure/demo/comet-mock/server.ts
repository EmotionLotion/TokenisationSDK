/**
 * Mock COMET API Server
 *
 * Simulates the real COMET logistics backend for demo purposes.
 * Run this locally to demonstrate the full tokenization flow.
 *
 * Usage: npx ts-node server.ts
 */

import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================
// MOCK DATA - Simulates real COMET database
// ============================================================

const drivers: Record<string, any> = {
  'DRV-001': {
    id: 'DRV-001',
    name: 'Ahmed Al Mansouri',
    vehicleId: 'VEH-A1234',
    status: 'ACTIVE',
    tier: 'GOLD',
    totalDeliveries: 847,
    rating: 4.8,
    joinedAt: '2023-06-15',
  },
  'DRV-002': {
    id: 'DRV-002',
    name: 'Fatima Hassan',
    vehicleId: 'VEH-B5678',
    status: 'ON_DELIVERY',
    tier: 'PLATINUM',
    totalDeliveries: 1523,
    rating: 4.95,
    joinedAt: '2022-11-20',
  },
  'DRV-003': {
    id: 'DRV-003',
    name: 'Mohammed Khan',
    vehicleId: 'VEH-C9012',
    status: 'ACTIVE',
    tier: 'SILVER',
    totalDeliveries: 234,
    rating: 4.5,
    joinedAt: '2024-01-10',
  },
};

// Telematics events per driver (simulated history)
const telematicsEvents: Record<string, any[]> = {
  'DRV-001': [
    { type: 'HARD_BRAKE', timestamp: '2025-01-09T14:23:00Z', severity: 'MEDIUM' },
    { type: 'SPEEDING', timestamp: '2025-01-08T09:15:00Z', severity: 'LOW' },
  ],
  'DRV-002': [
    // Platinum driver - very few events
    { type: 'HARSH_CORNERING', timestamp: '2025-01-05T11:30:00Z', severity: 'LOW' },
  ],
  'DRV-003': [
    { type: 'HARD_BRAKE', timestamp: '2025-01-09T16:45:00Z', severity: 'HIGH' },
    { type: 'HARD_BRAKE', timestamp: '2025-01-09T10:20:00Z', severity: 'MEDIUM' },
    { type: 'RAPID_ACCELERATION', timestamp: '2025-01-08T08:30:00Z', severity: 'MEDIUM' },
    { type: 'SPEEDING', timestamp: '2025-01-08T14:00:00Z', severity: 'HIGH' },
    { type: 'SPEEDING', timestamp: '2025-01-07T17:30:00Z', severity: 'MEDIUM' },
    { type: 'IDLE_TIME', timestamp: '2025-01-07T12:00:00Z', severity: 'LOW' },
  ],
};

const deliveries: Record<string, any> = {
  'DEL-10001': {
    id: 'DEL-10001',
    driverId: 'DRV-001',
    status: 'DELIVERED',
    pickupLocation: { lat: 25.2048, lng: 55.2708, address: 'Dubai Mall' },
    dropoffLocation: { lat: 25.1123, lng: 55.1389, address: 'JBR Beach' },
    estimatedTime: '2025-01-09T15:00:00Z',
    actualTime: '2025-01-09T14:45:00Z',
    distance: 12.5,
    customerRating: 5,
  },
  'DEL-10002': {
    id: 'DEL-10002',
    driverId: 'DRV-002',
    status: 'IN_TRANSIT',
    pickupLocation: { lat: 25.0657, lng: 55.1713, address: 'Dubai Marina' },
    dropoffLocation: { lat: 25.2566, lng: 55.3047, address: 'Deira' },
    estimatedTime: '2025-01-10T12:30:00Z',
    actualTime: null,
    distance: 18.3,
    customerRating: null,
  },
};

// Safety penalty configuration (what Chainlink Functions would fetch)
const safetyPenalties = {
  HARD_BRAKE: 2,
  RAPID_ACCELERATION: 1,
  SPEEDING: 5,
  HARSH_CORNERING: 2,
  IDLE_TIME: 0.5,
  ROUTE_DEVIATION: 1,
};

// Webhook subscribers
const webhookSubscribers: string[] = [];

// ============================================================
// API ENDPOINTS - Mimics real COMET API
// ============================================================

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'comet-mock', timestamp: new Date().toISOString() });
});

// Get all drivers
app.get('/v1/drivers', (req, res) => {
  const status = req.query.status as string;
  let result = Object.values(drivers);

  if (status) {
    result = result.filter(d => d.status === status);
  }

  res.json(result);
});

// Get single driver
app.get('/v1/drivers/:id', (req, res) => {
  const driver = drivers[req.params.id];
  if (!driver) {
    return res.status(404).json({ error: 'Driver not found' });
  }
  res.json(driver);
});

// Get driver telematics (GPS readings)
app.get('/v1/drivers/:id/telematics', (req, res) => {
  const driverId = req.params.id;
  if (!drivers[driverId]) {
    return res.status(404).json({ error: 'Driver not found' });
  }

  // Generate mock telematics readings
  const readings = [];
  const baseTime = Date.now();

  for (let i = 0; i < 10; i++) {
    readings.push({
      vehicle_id: drivers[driverId].vehicleId,
      driver_id: driverId,
      timestamp: new Date(baseTime - i * 60000).toISOString(),
      location: {
        latitude: 25.2048 + (Math.random() - 0.5) * 0.05,
        longitude: 55.2708 + (Math.random() - 0.5) * 0.05,
      },
      speed: 40 + Math.random() * 40,
      heading: Math.random() * 360,
      fuel_level: 65 + Math.random() * 20,
      engine_status: 'ON',
      events: [],
    });
  }

  res.json(readings);
});

// Get driver safety events (the key data for scoring)
app.get('/v1/drivers/:id/events', (req, res) => {
  const driverId = req.params.id;
  if (!drivers[driverId]) {
    return res.status(404).json({ error: 'Driver not found' });
  }

  const events = telematicsEvents[driverId] || [];
  res.json(events);
});

// Get delivery
app.get('/v1/deliveries/:id', (req, res) => {
  const delivery = deliveries[req.params.id];
  if (!delivery) {
    return res.status(404).json({ error: 'Delivery not found' });
  }
  res.json(delivery);
});

// Get safety penalty configuration (Chainlink Functions fetches this)
app.get('/v1/config/safety-penalties', (req, res) => {
  res.json(safetyPenalties);
});

// Get loyalty multiplier configuration
app.get('/v1/config/loyalty-multipliers', (req, res) => {
  res.json({
    tierBonuses: {
      BRONZE: 0,
      SILVER: 0.05,
      GOLD: 0.1,
      PLATINUM: 0.2,
      DIAMOND: 0.3,
    },
    actionMultipliers: {
      PERFECT_DELIVERY: 1.0,
      OFF_PEAK_BOOKING: 1.5,
      ECO_FRIENDLY_DROPOFF: 2.0,
      EARLY_BOOKING: 1.2,
      REFERRAL: 1.0,
    },
  });
});

// Subscribe to webhooks
app.post('/v1/webhooks/subscribe', (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  webhookSubscribers.push(url);
  res.json({ success: true, message: 'Subscribed to webhooks' });
});

// ============================================================
// SIMULATION ENDPOINTS - Trigger events for demo
// ============================================================

// Simulate a delivery completion
app.post('/simulate/delivery-complete', async (req, res) => {
  const { driverId, rating } = req.body;

  if (!drivers[driverId]) {
    return res.status(404).json({ error: 'Driver not found' });
  }

  const deliveryId = 'DEL-' + Date.now();
  const delivery = {
    id: deliveryId,
    driverId,
    status: 'DELIVERED',
    pickupLocation: { lat: 25.2048, lng: 55.2708, address: 'Pickup Location' },
    dropoffLocation: { lat: 25.1123, lng: 55.1389, address: 'Dropoff Location' },
    estimatedTime: new Date(Date.now() - 30 * 60000).toISOString(),
    actualTime: new Date().toISOString(),
    distance: 8 + Math.random() * 10,
    customerRating: rating || 5,
  };

  deliveries[deliveryId] = delivery;
  drivers[driverId].totalDeliveries++;

  // Send webhook
  const webhookPayload = {
    event: 'delivery.completed',
    timestamp: new Date().toISOString(),
    signature: 'mock_signature_' + Date.now(),
    data: {
      delivery_id: deliveryId,
      driver_id: driverId,
      rating: delivery.customerRating,
      on_time: new Date(delivery.actualTime) <= new Date(delivery.estimatedTime),
    },
  };

  console.log('\n📦 DELIVERY COMPLETED');
  console.log(`   Driver: ${drivers[driverId].name} (${driverId})`);
  console.log(`   Rating: ${delivery.customerRating}/5`);
  console.log(`   On-time: ${webhookPayload.data.on_time ? 'Yes ✓' : 'No ✗'}`);

  // Notify webhook subscribers
  for (const url of webhookSubscribers) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });
    } catch (e) {
      console.log(`   Failed to notify ${url}`);
    }
  }

  res.json({ success: true, delivery, webhook: webhookPayload });
});

// Simulate a telematics safety event
app.post('/simulate/safety-event', async (req, res) => {
  const { driverId, eventType, severity } = req.body;

  if (!drivers[driverId]) {
    return res.status(404).json({ error: 'Driver not found' });
  }

  const validEvents = ['HARD_BRAKE', 'RAPID_ACCELERATION', 'SPEEDING', 'HARSH_CORNERING', 'IDLE_TIME', 'ROUTE_DEVIATION'];
  if (!validEvents.includes(eventType)) {
    return res.status(400).json({ error: 'Invalid event type', valid: validEvents });
  }

  const event = {
    type: eventType,
    timestamp: new Date().toISOString(),
    severity: severity || 'MEDIUM',
  };

  if (!telematicsEvents[driverId]) {
    telematicsEvents[driverId] = [];
  }
  telematicsEvents[driverId].push(event);

  console.log('\n⚠️  SAFETY EVENT');
  console.log(`   Driver: ${drivers[driverId].name} (${driverId})`);
  console.log(`   Event: ${eventType}`);
  console.log(`   Severity: ${severity || 'MEDIUM'}`);
  console.log(`   Penalty: -${safetyPenalties[eventType as keyof typeof safetyPenalties]} points`);

  // Send webhook
  const webhookPayload = {
    event: 'telematics.event',
    timestamp: new Date().toISOString(),
    signature: 'mock_signature_' + Date.now(),
    data: {
      driver_id: driverId,
      event_type: eventType,
      severity: severity || 'MEDIUM',
    },
  };

  for (const url of webhookSubscribers) {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });
    } catch (e) {
      // Ignore webhook errors
    }
  }

  res.json({ success: true, event, webhook: webhookPayload });
});

// Calculate and return safety score (what the oracle would verify)
app.get('/simulate/safety-score/:driverId', (req, res) => {
  const driverId = req.params.driverId;

  if (!drivers[driverId]) {
    return res.status(404).json({ error: 'Driver not found' });
  }

  const events = telematicsEvents[driverId] || [];

  // Count events by type
  const eventCounts: Record<string, number> = {};
  for (const event of events) {
    eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
  }

  // Calculate score
  let score = 100;
  for (const [type, count] of Object.entries(eventCounts)) {
    const penalty = safetyPenalties[type as keyof typeof safetyPenalties] || 0;
    score -= penalty * count;
  }
  score = Math.max(0, score);

  console.log('\n📊 SAFETY SCORE CALCULATED');
  console.log(`   Driver: ${drivers[driverId].name} (${driverId})`);
  console.log(`   Score: ${score.toFixed(1)}/100`);
  console.log(`   Events: ${JSON.stringify(eventCounts)}`);

  res.json({
    driverId,
    driverName: drivers[driverId].name,
    score: Math.round(score * 10) / 10,
    eventCounts,
    penalties: safetyPenalties,
    calculatedAt: new Date().toISOString(),
    source: 'comet-mock-api',
  });
});

// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    COMET Mock API Server                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Running on: http://localhost:${PORT}                            ║
║                                                               ║
║  This simulates the real COMET logistics backend.             ║
║  Use /simulate/* endpoints to trigger events for demo.        ║
╠═══════════════════════════════════════════════════════════════╣
║  Available Drivers:                                           ║
║    DRV-001: Ahmed Al Mansouri (GOLD tier)                     ║
║    DRV-002: Fatima Hassan (PLATINUM tier)                     ║
║    DRV-003: Mohammed Khan (SILVER tier)                       ║
╠═══════════════════════════════════════════════════════════════╣
║  Demo Endpoints:                                              ║
║    POST /simulate/delivery-complete                           ║
║    POST /simulate/safety-event                                ║
║    GET  /simulate/safety-score/:driverId                      ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});

export default app;
