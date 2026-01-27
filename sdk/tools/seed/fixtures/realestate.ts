/**
 * Real Estate Fixtures
 *
 * Test data for real estate tokenization demos.
 */

export const PROPERTY_TYPES = ['residential', 'commercial', 'industrial', 'land'] as const;

export const LOCATIONS = {
  dubai_marina: {
    address: '123 Marina Walk',
    city: 'Dubai',
    country: 'AE',
    postalCode: '00000',
    district: 'Dubai Marina',
  },
  downtown_dubai: {
    address: '45 Boulevard Plaza',
    city: 'Dubai',
    country: 'AE',
    postalCode: '00000',
    district: 'Downtown Dubai',
  },
  london_canary: {
    address: '1 Canada Square',
    city: 'London',
    country: 'GB',
    postalCode: 'E14 5AB',
    district: 'Canary Wharf',
  },
  singapore_cbd: {
    address: '1 Raffles Place',
    city: 'Singapore',
    country: 'SG',
    postalCode: '048616',
    district: 'Central Business District',
  },
};

export const PROPERTIES = [
  {
    id: 'prop_seed_001',
    name: 'Marina Heights Tower',
    description: 'Luxury residential tower with stunning marina views',
    propertyType: 'residential' as const,
    location: LOCATIONS.dubai_marina,
    valuation: 50_000_000,
    currency: 'USD',
    totalShares: 1000,
    attributes: {
      floors: 45,
      units: 200,
      amenities: ['pool', 'gym', 'concierge', 'parking'],
      yearBuilt: 2022,
      occupancyRate: 0.95,
    },
    dldTitleDeedId: 'DLD-2024-001234',
  },
  {
    id: 'prop_seed_002',
    name: 'Boulevard Business Center',
    description: 'Grade A office space in prime Downtown location',
    propertyType: 'commercial' as const,
    location: LOCATIONS.downtown_dubai,
    valuation: 120_000_000,
    currency: 'USD',
    totalShares: 10000,
    attributes: {
      floors: 30,
      leasableArea: 50000,
      areaUnit: 'sqm',
      amenities: ['parking', 'conference_rooms', 'cafeteria'],
      yearBuilt: 2020,
      occupancyRate: 0.88,
    },
    dldTitleDeedId: 'DLD-2024-005678',
  },
  {
    id: 'prop_seed_003',
    name: 'Thames Riverside Apartments',
    description: 'Modern apartments overlooking the Thames',
    propertyType: 'residential' as const,
    location: LOCATIONS.london_canary,
    valuation: 25_000_000,
    currency: 'GBP',
    totalShares: 500,
    attributes: {
      floors: 12,
      units: 48,
      amenities: ['gym', 'rooftop_garden', 'parking'],
      yearBuilt: 2021,
      occupancyRate: 0.92,
    },
  },
  {
    id: 'prop_seed_004',
    name: 'Raffles Commerce Hub',
    description: 'Premium commercial space in Singapore CBD',
    propertyType: 'commercial' as const,
    location: LOCATIONS.singapore_cbd,
    valuation: 80_000_000,
    currency: 'SGD',
    totalShares: 8000,
    attributes: {
      floors: 25,
      leasableArea: 35000,
      areaUnit: 'sqm',
      amenities: ['parking', 'meeting_rooms', 'sky_lounge'],
      yearBuilt: 2019,
      occupancyRate: 0.91,
    },
  },
];

export const PROPERTY_INVESTORS = [
  {
    id: 'prop_inv_001',
    propertyId: 'prop_seed_001',
    investorId: 'inv_seed_001',
    shares: 50,
    purchasePrice: 2_500_000,
    purchaseDate: '2024-01-15',
  },
  {
    id: 'prop_inv_002',
    propertyId: 'prop_seed_001',
    investorId: 'inv_seed_002',
    shares: 100,
    purchasePrice: 5_000_000,
    purchaseDate: '2024-02-01',
  },
  {
    id: 'prop_inv_003',
    propertyId: 'prop_seed_002',
    investorId: 'inv_seed_003',
    shares: 500,
    purchasePrice: 6_000_000,
    purchaseDate: '2024-01-20',
  },
  {
    id: 'prop_inv_004',
    propertyId: 'prop_seed_003',
    investorId: 'inv_seed_001',
    shares: 25,
    purchasePrice: 1_250_000,
    purchaseDate: '2024-03-01',
  },
];

export const DISTRIBUTIONS = [
  {
    id: 'dist_001',
    propertyId: 'prop_seed_001',
    name: 'Q1 2024 Rental Income',
    type: 'rent' as const,
    amount: 750_000,
    currency: 'USD',
    paymentDate: '2024-04-01',
    status: 'completed' as const,
  },
  {
    id: 'dist_002',
    propertyId: 'prop_seed_002',
    name: 'Q1 2024 Lease Revenue',
    type: 'rent' as const,
    amount: 2_400_000,
    currency: 'USD',
    paymentDate: '2024-04-01',
    status: 'completed' as const,
  },
  {
    id: 'dist_003',
    propertyId: 'prop_seed_001',
    name: 'Q2 2024 Rental Income',
    type: 'rent' as const,
    amount: 780_000,
    currency: 'USD',
    paymentDate: '2024-07-01',
    status: 'pending' as const,
  },
];

export const TOKEN_CONFIGS = {
  marina_heights: {
    symbol: 'MARINA',
    name: 'Marina Heights Token',
    chainId: 137, // Polygon
    standard: 'ERC3643',
    decimals: 0,
  },
  boulevard_center: {
    symbol: 'BLVD',
    name: 'Boulevard Business Token',
    chainId: 137,
    standard: 'ERC3643',
    decimals: 0,
  },
  thames_apartments: {
    symbol: 'THAMES',
    name: 'Thames Riverside Token',
    chainId: 1, // Ethereum
    standard: 'ERC3643',
    decimals: 0,
  },
  raffles_hub: {
    symbol: 'RAFF',
    name: 'Raffles Commerce Token',
    chainId: 137,
    standard: 'ERC3643',
    decimals: 0,
  },
};
