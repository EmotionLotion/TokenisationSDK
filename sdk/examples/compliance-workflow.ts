/**
 * Compliance Workflow Example
 *
 * Demonstrates comprehensive compliance management:
 * 1. KYC verification with multiple providers
 * 2. Sanctions screening
 * 3. Transfer restriction rules
 * 4. Accredited investor verification
 * 5. Country-based restrictions
 */

import { TokenisationSDK } from '../src';
import { ethers } from 'ethers';

// Configuration
const config = {
  rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
  privateKey: process.env.PRIVATE_KEY!,
  chainId: 84532,
  kycProvider: process.env.KYC_PROVIDER || 'sumsub',
  sumsubApiKey: process.env.SUMSUB_API_KEY,
  sumsubSecretKey: process.env.SUMSUB_SECRET_KEY,
};

// Compliance configuration
const complianceRules = {
  // Countries with full access
  allowedCountries: [840, 826, 276, 250, 392, 784], // USA, UK, Germany, France, Japan, UAE

  // Sanctioned countries (OFAC list)
  restrictedCountries: [408, 364, 760, 729, 862], // North Korea, Iran, Syria, Sudan, Venezuela

  // KYC requirements by investment tier
  kycTiers: [
    { maxInvestment: 10000, kycLevel: 1 }, // Basic KYC for < $10K
    { maxInvestment: 100000, kycLevel: 2 }, // Standard KYC for < $100K
    { maxInvestment: Infinity, kycLevel: 3 }, // Enhanced KYC for >= $100K
  ],

  // Accredited investor requirements
  accreditedInvestor: {
    minNetWorth: 1_000_000, // $1M net worth, or
    minAnnualIncome: 200_000, // $200K annual income
    professionalCertification: ['CFA', 'CPA', 'Series 7'],
  },

  // Transfer restrictions
  transferRules: {
    maxHolders: 2000,
    minHoldingPeriod: 365 * 24 * 60 * 60, // 1 year lock-up
    maxOwnershipPercentage: 10, // Max 10% ownership per holder
  },
};

interface KYCApplicant {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  countryCode: number;
  walletAddress: string;
  intendedInvestment: number;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Compliance Workflow Example');
  console.log('='.repeat(60));

  // Initialize SDK
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = new ethers.Wallet(config.privateKey, provider);

  const sdk = new TokenisationSDK({
    signer,
    chainId: config.chainId,
  });

  // Example applicants
  const applicants: KYCApplicant[] = [
    {
      id: 'applicant-001',
      email: 'john.doe@example.com',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1985-06-15',
      countryCode: 840, // USA
      walletAddress: '0x1111111111111111111111111111111111111111',
      intendedInvestment: 50000,
    },
    {
      id: 'applicant-002',
      email: 'jane.smith@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
      dateOfBirth: '1990-03-22',
      countryCode: 826, // UK
      walletAddress: '0x2222222222222222222222222222222222222222',
      intendedInvestment: 250000,
    },
    {
      id: 'applicant-003',
      email: 'blocked@example.com',
      firstName: 'Test',
      lastName: 'User',
      dateOfBirth: '1980-01-01',
      countryCode: 408, // North Korea (sanctioned)
      walletAddress: '0x3333333333333333333333333333333333333333',
      intendedInvestment: 10000,
    },
  ];

  // Step 1: Country Eligibility Check
  console.log('\n[Step 1] Country Eligibility Check');
  console.log('-'.repeat(40));

  for (const applicant of applicants) {
    const isAllowed = complianceRules.allowedCountries.includes(applicant.countryCode);
    const isRestricted = complianceRules.restrictedCountries.includes(applicant.countryCode);

    let status = 'ALLOWED';
    if (isRestricted) status = 'SANCTIONED';
    else if (!isAllowed) status = 'NOT_ELIGIBLE';

    console.log(`  ${applicant.firstName} ${applicant.lastName} (Country: ${applicant.countryCode}): ${status}`);

    if (status !== 'ALLOWED') {
      applicant.id = ''; // Mark as ineligible
    }
  }

  // Step 2: Determine Required KYC Level
  console.log('\n[Step 2] KYC Level Determination');
  console.log('-'.repeat(40));

  const eligibleApplicants = applicants.filter((a) => a.id !== '');

  for (const applicant of eligibleApplicants) {
    const tier = complianceRules.kycTiers.find(
      (t) => applicant.intendedInvestment <= t.maxInvestment
    );

    const kycLevel = tier?.kycLevel || 3;
    const kycType =
      kycLevel === 1 ? 'BASIC' : kycLevel === 2 ? 'STANDARD' : 'ENHANCED';

    console.log(
      `  ${applicant.firstName} ${applicant.lastName}: Investment $${applicant.intendedInvestment.toLocaleString()} -> KYC Level ${kycLevel} (${kycType})`
    );
  }

  // Step 3: Sanctions Screening (Simulated)
  console.log('\n[Step 3] Sanctions Screening');
  console.log('-'.repeat(40));

  const sanctionsList = [
    'Kim Jong Un',
    'Ali Khamenei',
    'Bashar al-Assad',
  ];

  for (const applicant of eligibleApplicants) {
    const fullName = `${applicant.firstName} ${applicant.lastName}`;

    // Simulate fuzzy matching against sanctions list
    const matchFound = sanctionsList.some((sanctioned) => {
      const similarity = calculateSimilarity(fullName.toLowerCase(), sanctioned.toLowerCase());
      return similarity > 0.8; // 80% similarity threshold
    });

    const status = matchFound ? 'POTENTIAL_MATCH (Requires Review)' : 'CLEAR';
    console.log(`  ${fullName}: ${status}`);
  }

  // Step 4: Accredited Investor Check
  console.log('\n[Step 4] Accredited Investor Verification');
  console.log('-'.repeat(40));

  // Simulated accreditation data
  const accreditationData: Record<string, { netWorth: number; income: number; certs: string[] }> = {
    'applicant-001': { netWorth: 500000, income: 150000, certs: [] },
    'applicant-002': { netWorth: 2000000, income: 300000, certs: ['CFA'] },
  };

  for (const applicant of eligibleApplicants) {
    const data = accreditationData[applicant.id];
    if (!data) {
      console.log(`  ${applicant.firstName} ${applicant.lastName}: Data not provided`);
      continue;
    }

    const meetsNetWorth = data.netWorth >= complianceRules.accreditedInvestor.minNetWorth;
    const meetsIncome = data.income >= complianceRules.accreditedInvestor.minAnnualIncome;
    const hasCert = data.certs.some((c) =>
      complianceRules.accreditedInvestor.professionalCertification.includes(c)
    );

    const isAccredited = meetsNetWorth || meetsIncome || hasCert;
    const reason = meetsNetWorth
      ? 'Net Worth'
      : meetsIncome
      ? 'Income'
      : hasCert
      ? 'Professional Certification'
      : 'Not Qualified';

    console.log(
      `  ${applicant.firstName} ${applicant.lastName}: ${isAccredited ? 'ACCREDITED' : 'NOT ACCREDITED'} (${reason})`
    );
  }

  // Step 5: KYC Session Creation (Simulated)
  console.log('\n[Step 5] Creating KYC Sessions');
  console.log('-'.repeat(40));

  for (const applicant of eligibleApplicants) {
    // In production, this would create a real KYC session with the provider
    const sessionUrl = `https://kyc.example.com/verify/${applicant.id}`;
    console.log(`  ${applicant.firstName} ${applicant.lastName}:`);
    console.log(`    Session URL: ${sessionUrl}`);
    console.log(`    Status: PENDING`);
  }

  // Step 6: On-Chain Registration (After KYC Completion)
  console.log('\n[Step 6] On-Chain Identity Registration');
  console.log('-'.repeat(40));

  // Deploy identity registry
  const identityRegistry = await sdk.deployIdentityRegistry();
  console.log(`  Identity Registry: ${identityRegistry.address}`);

  for (const applicant of eligibleApplicants) {
    // Simulate successful KYC completion
    const tier = complianceRules.kycTiers.find(
      (t) => applicant.intendedInvestment <= t.maxInvestment
    );
    const kycLevel = tier?.kycLevel || 1;
    const kycExpiry = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

    await identityRegistry.registerIdentity(
      applicant.walletAddress,
      applicant.countryCode,
      kycLevel,
      kycExpiry
    );

    console.log(
      `  Registered: ${applicant.walletAddress.slice(0, 10)}... (KYC Level: ${kycLevel})`
    );
  }

  // Step 7: Transfer Compliance Check
  console.log('\n[Step 7] Transfer Compliance Check');
  console.log('-'.repeat(40));

  // Deploy compliance module
  const compliance = await sdk.deployCompliance({
    identityRegistry: identityRegistry.address,
    rules: {
      maxHolders: complianceRules.transferRules.maxHolders,
      restrictedCountries: complianceRules.restrictedCountries,
      minKycLevel: 1,
    },
  });

  // Test transfer scenarios
  const transferTests = [
    {
      from: eligibleApplicants[0].walletAddress,
      to: eligibleApplicants[1].walletAddress,
      amount: ethers.parseUnits('1000', 18),
      description: 'Verified to Verified',
    },
    {
      from: eligibleApplicants[0].walletAddress,
      to: '0x4444444444444444444444444444444444444444', // Unverified
      amount: ethers.parseUnits('1000', 18),
      description: 'Verified to Unverified',
    },
  ];

  for (const test of transferTests) {
    const canTransfer = await compliance.canTransfer(test.from, test.to, test.amount);
    const status = canTransfer ? 'ALLOWED' : 'BLOCKED';
    console.log(`  ${test.description}: ${status}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Compliance Workflow Complete');
  console.log('='.repeat(60));
  console.log('\nKey Contracts:');
  console.log(`  Identity Registry: ${identityRegistry.address}`);
  console.log(`  Compliance Module: ${compliance.address}`);

  console.log('\nCompliance Rules Active:');
  console.log(`  - Max Holders: ${complianceRules.transferRules.maxHolders}`);
  console.log(`  - Allowed Countries: ${complianceRules.allowedCountries.length}`);
  console.log(`  - Restricted Countries: ${complianceRules.restrictedCountries.length}`);
  console.log(`  - Minimum KYC Level: 1`);
}

// Utility: Calculate string similarity (Levenshtein-based)
function calculateSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const costs: number[] = [];
  for (let i = 0; i <= shorter.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= longer.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (shorter.charAt(i - 1) !== longer.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[longer.length] = lastValue;
  }

  return (longer.length - costs[longer.length]) / longer.length;
}

main().catch(console.error);
