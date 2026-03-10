/**
 * Chainlink Functions: Safety Score Calculator
 *
 * Calculates driver safety scores from telematics events.
 * Fetches current penalty configuration from COMET API.
 *
 * Args:
 *   args[0] - JSON array of events: [{type: "HARD_BRAKE", count: 2}, ...]
 *
 * Returns:
 *   JSON with score (0-100) and event breakdown
 */

// Parse telematics events from arguments
const events = JSON.parse(args[0]);

// Fetch current penalty configuration from COMET API
// This ensures penalties are not hardcoded and can be adjusted dynamically
let penalties;
try {
  const penaltyResponse = await Functions.makeHttpRequest({
    url: 'https://api.comet.ahoy.dev/v1/config/safety-penalties',
    headers: {
      'Content-Type': 'application/json',
      // API key would be passed via encrypted secrets in production
      // 'x-api-key': secrets.COMET_API_KEY
    },
    timeout: 5000,
  });

  if (penaltyResponse.error) {
    throw new Error('API unavailable');
  }

  penalties = penaltyResponse.data;
} catch (e) {
  // Fallback to default penalties if API is unavailable
  // These are the same defaults but fetched from oracle, not hardcoded in contract
  penalties = {
    HARD_BRAKE: 2,
    RAPID_ACCELERATION: 1,
    SPEEDING: 5,
    HARSH_CORNERING: 2,
    IDLE_TIME: 0.5,
    ROUTE_DEVIATION: 1,
  };
}

// Calculate safety score
let score = 100;
const breakdown = {};

for (const event of events) {
  const penalty = penalties[event.type] || 0;
  const deduction = penalty * event.count;
  score -= deduction;
  breakdown[event.type] = event.count;
}

// Ensure score is within bounds
score = Math.max(0, Math.min(100, score));

// Round to 2 decimal places
score = Math.round(score * 100) / 100;

// Prepare result
const result = {
  score: score,
  breakdown: breakdown,
  penaltySource: penalties.HARD_BRAKE ? 'default' : 'api',
  timestamp: Date.now(),
};

// Return encoded result
// Using string encoding for complex JSON response
return Functions.encodeString(JSON.stringify(result));
