#!/usr/bin/env node
/**
 * Sandbox Seeding CLI
 *
 * Seeds the TokenisationSDK sandbox environment with test data.
 *
 * Usage:
 *   npx ts-node index.ts [options]
 *
 * Options:
 *   --all           Seed all fixtures
 *   --airline       Seed airline demo data
 *   --realestate    Seed real estate demo data
 *   --investors     Seed common investor data
 *   --clean         Remove all seeded data first
 *   --dry-run       Show what would be seeded without making changes
 */

import { INVESTORS, JURISDICTIONS, COMPLIANCE_POLICIES } from './fixtures/common.js';
import { AIRLINES, AIRPORTS, FLIGHTS, PASSENGERS, SAMPLE_TICKETS } from './fixtures/airline.js';
import {
  PROPERTIES,
  PROPERTY_INVESTORS,
  DISTRIBUTIONS,
  TOKEN_CONFIGS,
  LOCATIONS,
} from './fixtures/realestate.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface SeedConfig {
  apiUrl: string;
  apiKey: string;
  projectId: string;
  dryRun: boolean;
}

function getConfig(): SeedConfig {
  const apiUrl = process.env.TOKENISATION_API_URL || 'http://localhost:3001';
  const apiKey = process.env.TOKENISATION_API_KEY;
  const projectId = process.env.PROJECT_ID || 'proj_seed_demo';

  if (!apiKey && !process.argv.includes('--dry-run')) {
    console.error('Error: TOKENISATION_API_KEY environment variable is required');
    console.error('Set it or use --dry-run to preview seed data');
    process.exit(1);
  }

  return {
    apiUrl,
    apiKey: apiKey || 'dry-run-key',
    projectId,
    dryRun: process.argv.includes('--dry-run'),
  };
}

// ============================================================================
// API CLIENT
// ============================================================================

class SeedClient {
  constructor(private config: SeedConfig) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    if (this.config.dryRun) {
      console.log(`  [DRY RUN] ${method} ${path}`);
      if (body) {
        console.log(`    Body: ${JSON.stringify(body, null, 2).slice(0, 200)}...`);
      }
      return {} as T;
    }

    const response = await fetch(`${this.config.apiUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  async createProject(data: { name: string; description: string }) {
    return this.request('POST', '/api/v1/projects', data);
  }

  async createAsset(data: unknown) {
    return this.request('POST', '/api/v1/assets', data);
  }

  async createToken(data: unknown) {
    return this.request('POST', '/api/v1/tokens', data);
  }

  async createInvestor(data: unknown) {
    return this.request('POST', '/api/v1/investors', data);
  }

  async addWallet(investorId: string, data: unknown) {
    return this.request('POST', `/api/v1/investors/${investorId}/wallets`, data);
  }

  async createTransfer(data: unknown) {
    return this.request('POST', '/api/v1/transfers', data);
  }

  async deleteAll() {
    // Note: This would need proper implementation based on available API endpoints
    console.log('  Cleaning existing seed data...');
  }
}

// ============================================================================
// SEEDERS
// ============================================================================

async function seedInvestors(client: SeedClient): Promise<void> {
  console.log('\n📊 Seeding Investors...');

  for (const investor of INVESTORS) {
    console.log(`  Creating investor: ${investor.email}`);
    await client.createInvestor({
      type: investor.type,
      email: investor.email,
      jurisdiction: investor.jurisdiction,
      classification: investor.classification,
    });

    if (investor.wallet) {
      await client.addWallet(investor.id, {
        address: investor.wallet,
        chainId: 137,
        label: 'Primary Wallet',
      });
    }
  }

  console.log(`  ✓ Created ${INVESTORS.length} investors`);
}

async function seedAirlineData(client: SeedClient, projectId: string): Promise<void> {
  console.log('\n✈️  Seeding Airline Demo Data...');

  // Create project
  console.log('  Creating airline project...');
  await client.createProject({
    name: 'Airline Ticketing Demo',
    description: 'Demo project for tokenized airline tickets',
  });

  // Create assets for each flight
  console.log('  Creating flight assets...');
  for (const flight of FLIGHTS) {
    const departure = AIRPORTS[flight.departure as keyof typeof AIRPORTS];
    const arrival = AIRPORTS[flight.arrival as keyof typeof AIRPORTS];

    await client.createAsset({
      name: `Flight ${flight.number}`,
      description: `${departure.city} to ${arrival.city} - ${flight.date}`,
      projectId,
      rightType: 'SERVICE_ACCESS',
      jurisdiction: {
        country: departure.country,
      },
      attributes: {
        flightNumber: flight.number,
        departure: flight.departure,
        arrival: flight.arrival,
        date: flight.date,
        departureTime: flight.departureTime,
        arrivalTime: flight.arrivalTime,
      },
    });
  }

  // Create passengers
  console.log('  Creating passenger records...');
  for (const passenger of PASSENGERS) {
    await client.createInvestor({
      type: 'individual',
      email: passenger.email,
      metadata: {
        passengerId: passenger.id,
        frequentFlyer: passenger.frequentFlyer,
      },
    });

    if (passenger.wallet) {
      await client.addWallet(passenger.id, {
        address: passenger.wallet,
        chainId: 137,
        label: 'Ticket Wallet',
      });
    }
  }

  console.log(`  ✓ Created ${FLIGHTS.length} flights`);
  console.log(`  ✓ Created ${PASSENGERS.length} passengers`);
  console.log(`  ✓ Airline demo data ready`);
}

async function seedRealEstateData(client: SeedClient, projectId: string): Promise<void> {
  console.log('\n🏢 Seeding Real Estate Demo Data...');

  // Create project
  console.log('  Creating real estate project...');
  await client.createProject({
    name: 'Real Estate Tokenization Demo',
    description: 'Demo project for fractional real estate ownership',
  });

  // Create property assets
  console.log('  Creating property assets...');
  for (const property of PROPERTIES) {
    await client.createAsset({
      name: property.name,
      description: property.description,
      projectId,
      rightType: 'OWNERSHIP',
      jurisdiction: {
        country: property.location.country,
      },
      attributes: {
        propertyType: property.propertyType,
        location: property.location,
        valuation: property.valuation,
        currency: property.currency,
        totalShares: property.totalShares,
        ...property.attributes,
        dldTitleDeedId: property.dldTitleDeedId,
      },
    });

    // Create token for property
    const tokenConfig = Object.values(TOKEN_CONFIGS).find(
      (t) => t.name.toLowerCase().includes(property.name.split(' ')[0].toLowerCase())
    );

    if (tokenConfig) {
      await client.createToken({
        name: tokenConfig.name,
        symbol: tokenConfig.symbol,
        projectId,
        assetId: property.id,
        standard: tokenConfig.standard,
        chainId: tokenConfig.chainId,
        decimals: tokenConfig.decimals,
      });
    }
  }

  console.log(`  ✓ Created ${PROPERTIES.length} properties`);
  console.log(`  ✓ Created ${Object.keys(TOKEN_CONFIGS).length} property tokens`);
  console.log(`  ✓ Real estate demo data ready`);
}

// ============================================================================
// CLI
// ============================================================================

function printUsage(): void {
  console.log(`
Sandbox Seeding CLI

Usage:
  npx ts-node index.ts [options]

Options:
  --all           Seed all fixtures
  --airline       Seed airline demo data
  --realestate    Seed real estate demo data
  --investors     Seed common investor data
  --clean         Remove all seeded data first
  --dry-run       Show what would be seeded without making changes
  --help          Show this help message

Environment Variables:
  TOKENISATION_API_URL   API URL (default: http://localhost:3001)
  TOKENISATION_API_KEY   API key (required unless --dry-run)
  PROJECT_ID             Project ID (default: proj_seed_demo)

Examples:
  # Seed all data
  TOKENISATION_API_KEY=sk_test_xxx npx ts-node index.ts --all

  # Preview airline data only
  npx ts-node index.ts --airline --dry-run

  # Clean and reseed real estate data
  TOKENISATION_API_KEY=sk_test_xxx npx ts-node index.ts --clean --realestate
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    printUsage();
    process.exit(0);
  }

  console.log('🌱 TokenisationSDK Sandbox Seeder');
  console.log('================================');

  const config = getConfig();
  const client = new SeedClient(config);

  console.log(`API URL: ${config.apiUrl}`);
  console.log(`Project: ${config.projectId}`);
  console.log(`Dry Run: ${config.dryRun}`);

  // Clean if requested
  if (args.includes('--clean')) {
    console.log('\n🧹 Cleaning existing data...');
    await client.deleteAll();
  }

  // Seed based on flags
  const seedAll = args.includes('--all');

  if (seedAll || args.includes('--investors')) {
    await seedInvestors(client);
  }

  if (seedAll || args.includes('--airline')) {
    await seedAirlineData(client, config.projectId);
  }

  if (seedAll || args.includes('--realestate')) {
    await seedRealEstateData(client, config.projectId);
  }

  console.log('\n✅ Seeding complete!');

  if (config.dryRun) {
    console.log('\n⚠️  This was a dry run. No data was actually created.');
    console.log('   Remove --dry-run and set TOKENISATION_API_KEY to seed for real.');
  }
}

// Run CLI
main().catch((error) => {
  console.error('\n❌ Seeding failed:', error.message);
  process.exit(1);
});
