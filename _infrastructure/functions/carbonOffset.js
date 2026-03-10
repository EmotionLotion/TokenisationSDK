/**
 * Chainlink Functions: Carbon Offset Calculator
 *
 * Calculates carbon offsets using real emission factors from climate APIs.
 * Falls back to regional defaults if API is unavailable.
 *
 * Args:
 *   args[0] - Utility type: "WATER", "ELECTRICITY", "GAS", "COLD_CHAIN"
 *   args[1] - Quantity consumed (as string number)
 *   args[2] - Region code: "UAE", "EU", "US", etc.
 *
 * Returns:
 *   JSON with offset amount and factor used
 */

const [utilityType, quantityStr, region] = args;
const quantity = parseFloat(quantityStr);

// Map utility types to Climatiq activity IDs
const activityIds = {
  WATER: 'water-supply_water',
  ELECTRICITY: 'electricity-energy_source_grid_mix',
  GAS: 'fuel-type_natural_gas-fuel_use_stationary_combustion',
  COLD_CHAIN: 'freight_vehicle-vehicle_type_hgv-fuel_source_diesel-vehicle_weight_gt_17t-percentage_load_50',
};

// Map region names to ISO codes
const regionCodes = {
  UAE: 'AE',
  EU: 'EU',
  US: 'US',
  UK: 'GB',
  SAUDI: 'SA',
  QATAR: 'QA',
  INDIA: 'IN',
  CHINA: 'CN',
};

// Regional default factors (kg CO2e per unit)
const defaultFactors = {
  UAE: { WATER: 0.0012, ELECTRICITY: 0.45, GAS: 2.0, COLD_CHAIN: 0.12 },
  EU: { WATER: 0.0008, ELECTRICITY: 0.25, GAS: 1.9, COLD_CHAIN: 0.08 },
  US: { WATER: 0.001, ELECTRICITY: 0.42, GAS: 1.95, COLD_CHAIN: 0.1 },
};

let factor = null;
let source = 'default';

// Try to fetch from Climatiq API
try {
  const activityId = activityIds[utilityType];
  const regionCode = regionCodes[region] || region;

  if (activityId) {
    // Note: In production, API key would be passed via encrypted secrets
    // const apiKey = secrets.CLIMATIQ_API_KEY;

    const response = await Functions.makeHttpRequest({
      url: 'https://api.climatiq.io/data/v1/estimate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': `Bearer ${apiKey}`,
      },
      data: {
        emission_factor: {
          activity_id: activityId,
          source: 'GHG Protocol',
          region: regionCode,
        },
        parameters: getParameters(utilityType),
      },
      timeout: 5000,
    });

    if (!response.error && response.data && response.data.co2e) {
      factor = response.data.co2e;
      source = 'climatiq';
    }
  }
} catch (e) {
  // API call failed, will use defaults
}

// Fall back to defaults if API didn't return a factor
if (factor === null) {
  const regionDefaults = defaultFactors[region] || defaultFactors.UAE;
  factor = regionDefaults[utilityType] || 0.5;
  source = 'default';
}

// Calculate offset
const offsetKg = quantity * factor;

// Prepare result
const result = {
  offsetKg: Math.round(offsetKg * 1000) / 1000,
  factor: factor,
  utilityType: utilityType,
  region: region,
  source: source,
  timestamp: Date.now(),
};

// Return encoded result
return Functions.encodeString(JSON.stringify(result));

// Helper function to get API parameters for each utility type
function getParameters(type) {
  switch (type) {
    case 'WATER':
      return { volume: 1, volume_unit: 'l' };
    case 'ELECTRICITY':
      return { energy: 1, energy_unit: 'kWh' };
    case 'GAS':
      return { volume: 1, volume_unit: 'm3' };
    case 'COLD_CHAIN':
      return { weight: 1, weight_unit: 't', distance: 1, distance_unit: 'km' };
    default:
      return { energy: 1, energy_unit: 'kWh' };
  }
}
