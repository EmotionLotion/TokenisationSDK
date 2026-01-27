/**
 * Airline Fixtures
 *
 * Test data for airline ticket tokenization demos.
 */

export const AIRLINES = [
  {
    code: 'TK',
    name: 'Token Airways',
    logo: 'https://example.com/token-airways.png',
  },
  {
    code: 'BC',
    name: 'BlockChain Air',
    logo: 'https://example.com/blockchain-air.png',
  },
];

export const AIRPORTS = {
  DXB: { name: 'Dubai International', city: 'Dubai', country: 'AE' },
  LHR: { name: 'London Heathrow', city: 'London', country: 'GB' },
  JFK: { name: 'John F Kennedy', city: 'New York', country: 'US' },
  SIN: { name: 'Changi Airport', city: 'Singapore', country: 'SG' },
  HKG: { name: 'Hong Kong International', city: 'Hong Kong', country: 'HK' },
};

export const FLIGHTS = [
  {
    number: 'TK1234',
    departure: 'DXB',
    arrival: 'LHR',
    date: '2024-06-15',
    departureTime: '08:00',
    arrivalTime: '13:00',
    prices: {
      economy: 500,
      premium_economy: 850,
      business: 2500,
      first: 5000,
    },
  },
  {
    number: 'TK5678',
    departure: 'LHR',
    arrival: 'JFK',
    date: '2024-06-20',
    departureTime: '10:30',
    arrivalTime: '14:30',
    prices: {
      economy: 650,
      premium_economy: 1100,
      business: 3500,
      first: 7000,
    },
  },
  {
    number: 'BC9012',
    departure: 'SIN',
    arrival: 'HKG',
    date: '2024-07-01',
    departureTime: '06:00',
    arrivalTime: '10:00',
    prices: {
      economy: 300,
      premium_economy: 500,
      business: 1500,
      first: null, // No first class
    },
  },
];

export const PASSENGERS = [
  {
    id: 'pax_001',
    name: 'Alice Smith',
    email: 'alice@example.com',
    wallet: '0xA111111111111111111111111111111111111111',
    frequentFlyer: 'TK-12345',
  },
  {
    id: 'pax_002',
    name: 'Bob Johnson',
    email: 'bob@example.com',
    wallet: '0xB222222222222222222222222222222222222222',
    frequentFlyer: null,
  },
  {
    id: 'pax_003',
    name: 'Carol Williams',
    email: 'carol@example.com',
    wallet: '0xC333333333333333333333333333333333333333',
    frequentFlyer: 'BC-99999',
  },
];

export const SAMPLE_TICKETS = [
  {
    passenger: 'pax_001',
    flight: 'TK1234',
    class: 'business' as const,
    seat: '1A',
    status: 'active' as const,
  },
  {
    passenger: 'pax_002',
    flight: 'TK1234',
    class: 'economy' as const,
    seat: '25C',
    status: 'active' as const,
  },
  {
    passenger: 'pax_003',
    flight: 'BC9012',
    class: 'premium_economy' as const,
    seat: '5F',
    status: 'active' as const,
  },
];
