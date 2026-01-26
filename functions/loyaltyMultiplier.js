/**
 * Chainlink Functions: Loyalty Multiplier Calculator
 *
 * Calculates dynamic loyalty point multipliers based on tier and action.
 * Fetches current configuration from Ahoy governance API.
 *
 * Args:
 *   args[0] - Driver tier: "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND"
 *   args[1] - Action type: "PERFECT_DELIVERY", "OFF_PEAK_BOOKING", "ECO_FRIENDLY", etc.
 *
 * Returns:
 *   Multiplier as uint256 with 4 decimal places (10000 = 1.0)
 */

const [tier, actionType] = args;

// Try to fetch current configuration from Ahoy governance API
let config;
try {
  const response = await Functions.makeHttpRequest({
    url: 'https://api.ahoy.dev/v1/config/loyalty-multipliers',
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 5000,
  });

  if (!response.error && response.data) {
    config = response.data;
  }
} catch (e) {
  // API unavailable
}

// Default configuration if API fails
if (!config) {
  config = {
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
      LOCATION_DATA_SHARE: 1.0,
      ALGORITHM_PUBLISH: 3.0,
      COMPUTE_CONTRIBUTION: 1.5,
    },
    streakBonuses: {
      daily_7: 0.1,   // 7-day streak = +10%
      weekly_4: 0.2,  // 4-week streak = +20%
      monthly_3: 0.3, // 3-month streak = +30%
    },
  };
}

// Get tier bonus (percentage increase)
const tierBonus = config.tierBonuses[tier] || 0;

// Get action multiplier
const actionMult = config.actionMultipliers[actionType] || 1.0;

// Calculate final multiplier
// Base: 1.0 + tier bonus, then multiply by action multiplier
const finalMultiplier = (1 + tierBonus) * actionMult;

// Convert to uint256 with 4 decimal places
// 1.0 = 10000, 1.5 = 15000, 2.0 = 20000
const multiplierInt = Math.round(finalMultiplier * 10000);

// Return as uint256
return Functions.encodeUint256(multiplierInt);
