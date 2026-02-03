import {
  Building, FileText, Shield, Coins, ArrowRightLeft, Banknote,
  Upload, CheckCircle, XCircle, AlertTriangle, Lock, Unlock,
  FileCheck, Scale, Globe, Users, Wallet, Hash, Clock, Eye
} from 'lucide-react';
import { PropertyMap, NavHistoryChart } from '@tokenisation/sdk/components';
import { sdkStore } from '../../store';
import { RightType, PartyType, PartyRole, LifecycleState, isKycVerified } from '../../types';
import type { ShowcaseConfig } from './types';

// ============================================================================
// REAL ESTATE TOKENIZATION - Complete End-to-End Demo
// ============================================================================
// This showcase walks through the COMPLETE property tokenization lifecycle:
// 1. Partner Onboarding - Organization setup, compliance, wallet
// 2. Property Creation - Documents, jurisdiction, legal wrapper
// 3. Token Configuration - ERC-3643, transfer rules, offering
// 4. Primary Distribution - KYC, minting, compliance receipts
// 5. Secondary Transfer - Success and failure cases with details
// 6. Corporate Actions - Yield, valuation, freeze/unfreeze
// ============================================================================

export const realEstateShowcase: ShowcaseConfig = {
  id: 'real-estate',
  name: 'Real Estate Tokenisation',
  shortName: 'Real Estate',
  description: 'Complete property tokenization — from title deed to corporate actions',
  color: 'amber',
  icon: <Building className="w-5 h-5" />,
  sections: [
    { id: 'partner-onboarding', label: 'A. Partner Onboarding' },
    { id: 'property-creation', label: 'B. Property Creation' },
    { id: 'token-config', label: 'C. Token Configuration' },
    { id: 'primary-distribution', label: 'D. Primary Distribution' },
    { id: 'secondary-transfer', label: 'E. Secondary Transfer' },
    { id: 'corporate-actions', label: 'F. Corporate Actions' },
  ],
  steps: [
    // =========================================================================
    // A. PARTNER ONBOARDING (steps 1-3)
    // =========================================================================
    {
      id: 1,
      sectionId: 'partner-onboarding',
      title: 'Register Organization',
      description: 'Register the issuing organization with ISSUER and VERIFIER roles',
      code: `const org = await client.parties.create({
  name: 'Dubai Properties LLC',
  type: 'ORGANIZATION',
  roles: ['ISSUER', 'VERIFIER'],
  jurisdiction: 'AE',
  metadata: {
    license: 'DLD-2024-08812',
    registeredName: 'Dubai Properties LLC',
  }
});`,
      action: async (addLog, setData) => {
        const issuer = await sdkStore.createParty({
          name: 'Dubai Properties LLC',
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
          jurisdiction: 'AE',
        });
        setData(prev => ({ ...prev, issuerId: issuer.id }));
        addLog(`✓ Created organization: Dubai Properties LLC`);
        addLog(`  Party ID: ${issuer.id}`);
        addLog(`  Type: ORGANIZATION`);
        addLog(`  Roles: ISSUER, VERIFIER`);
        addLog(`  Jurisdiction: AE`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const org = parties.find(p => p.name === 'Dubai Properties LLC');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-amber-500/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white font-bold text-lg">DP</div>
                <div>
                  <h3 className="text-lg font-bold text-white">Dubai Properties LLC</h3>
                  <p className="text-sm text-gray-400">Licensed Real Estate Issuer</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Jurisdiction</p>
                  <p className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span className="text-base">🇦🇪</span> UAE
                  </p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">License #</p>
                  <p className="text-sm font-mono text-white">DLD-2024-08812</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Roles</p>
                  <p className="text-sm font-bold text-amber-400">ISSUER, VERIFIER</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Party ID</p>
                  <p className="text-sm font-mono text-white">{org?.id.slice(0, 12) || '—'}...</p>
                </div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 2,
      sectionId: 'partner-onboarding',
      title: 'Configure Compliance',
      description: 'Set up KYC provider, AML rules, and accreditation requirements',
      code: `await client.parties.verifyKyc(org.id);

// Configure compliance rules
const compliance = {
  kycProvider: 'Onfido',
  amlRules: ['FATF', 'UAE-CBUAE'],
  accreditation: 'QUALIFIED_INVESTOR',
  holdingPeriod: 365, // days
  maxInvestors: 200,
};`,
      action: async (addLog, _setData, data) => {
        sdkStore.verifyKyc(data.issuerId);
        addLog(`✓ KYC verified for Dubai Properties LLC`);
        addLog(`  Provider: Onfido`);
        addLog(`  AML rules: FATF, UAE-CBUAE`);
        addLog(`  Accreditation: QUALIFIED_INVESTOR`);
        addLog(`  Holding period: 365 days`);
        addLog(`  Max investors: 200`);
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white mb-2">Compliance Configuration</h3>
          <div className="space-y-2">
            {[
              { label: 'KYC Provider', value: 'Onfido', status: true },
              { label: 'AML Screening', value: 'FATF + UAE-CBUAE', status: true },
              { label: 'Accreditation', value: 'Qualified Investor', status: true },
              { label: 'Holding Period', value: '365 days', status: true },
              { label: 'Max Investors', value: '200', status: true },
              { label: 'Jurisdiction Whitelist', value: 'AE, US, GB, SG, CH', status: true },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${item.status ? 'bg-green-500 text-white' : 'bg-white/10 text-gray-500'}`}>
                    {item.status ? '✓' : '○'}
                  </div>
                  <span className="text-sm text-gray-300">{item.label}</span>
                </div>
                <span className="text-sm font-bold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 3,
      sectionId: 'partner-onboarding',
      title: 'Setup Issuer Wallet',
      description: 'Generate multisig wallet for the issuing organization',
      code: `const wallet = await client.wallets.create({
  owner: org.id,
  chain: 'BASE',
  type: 'MULTISIG',
  signers: 3,
  threshold: 2,
});
// Wallet funded with gas credits`,
      action: async (addLog, setData, data) => {
        const wallet = sdkStore.createWallet(data.issuerId, {
          chain: 'BASE',
          type: 'MULTISIG',
          threshold: 2,
          signers: 3,
        });
        setData(prev => ({ ...prev, walletAddress: wallet.address }));
        addLog(`✓ Wallet created for issuer`);
        addLog(`  Address: ${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}`);
        addLog(`  Chain: ${wallet.chain} (L2)`);
        addLog(`  Type: ${wallet.threshold}-of-${wallet.signers} ${wallet.type}`);
        addLog(`  Gas balance: ${wallet.balance} ETH`);
      },
      render: (_data) => {
        const parties = sdkStore.getParties();
        const org = parties.find(p => p.name === 'Dubai Properties LLC');
        const wallet = org ? sdkStore.getWallet(org.id) : null;
        return (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-900/10 to-orange-900/5">
            <h3 className="text-lg font-bold text-white mb-4">Issuer Wallet</h3>
            <div className="bg-black/30 p-4 rounded-xl border border-white/10 mb-4 font-mono text-sm">
              <p className="text-gray-500 text-xs mb-1">Address</p>
              <p className="text-amber-400">{wallet ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}` : '—'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Chain</p>
                <p className="text-sm font-bold text-white">Base (L2)</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Gas Balance</p>
                <p className="text-sm font-bold text-green-400">{wallet?.balance || '0.05'} ETH</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Type</p>
                <p className="text-sm font-bold text-white">{wallet?.type || 'Multisig'}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Threshold</p>
                <p className="text-sm font-bold text-white">{wallet ? `${wallet.threshold} of ${wallet.signers}` : '2 of 3'}</p>
              </div>
            </div>
          </div>
        </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // B. PROPERTY CREATION (steps 4-6)
    // =========================================================================
    {
      id: 4,
      sectionId: 'property-creation',
      title: 'Upload Documents',
      description: 'Upload title deed and valuation report — hashed to IPFS',
      code: `// Upload property documents
const documents = await client.documents.upload({
  titleDeed: titleDeedFile,      // PDF from Dubai Land Department
  valuation: valuationFile,       // Certified valuation report
  propertyId: 'DM-2024-78923',   // DLD property ID
});

// Documents are hashed and stored on IPFS
console.log('Title Deed Hash:', documents.titleDeed.hash);
console.log('Valuation Hash:', documents.valuation.hash);`,
      action: async (addLog, setData) => {
        addLog('📄 Uploading title deed...');
        await new Promise(r => setTimeout(r, 500));
        const titleDeedHash = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        addLog(`✓ Title Deed uploaded`);
        addLog(`  Hash: ${titleDeedHash.slice(0, 20)}...`);
        addLog(`  Source: Dubai Land Department`);
        addLog(`  Property ID: DM-2024-78923`);

        addLog('');
        addLog('📄 Uploading valuation report...');
        await new Promise(r => setTimeout(r, 500));
        const valuationHash = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        addLog(`✓ Valuation Report uploaded`);
        addLog(`  Hash: ${valuationHash.slice(0, 20)}...`);
        addLog(`  Valuer: CBRE Dubai`);
        addLog(`  Date: 2024-01-15`);
        addLog(`  Value: AED 55,000,000 ($15M USD)`);

        setData(prev => ({
          ...prev,
          titleDeedHash,
          valuationHash,
          propertyId: 'DM-2024-78923',
          valuation: '55000000',
        }));
      },
      render: (data) => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Upload className="w-5 h-5 text-amber-400" />
            Document Upload
          </h3>

          {/* Title Deed */}
          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-red-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white">Title Deed</h4>
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Verified
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">Dubai Land Department Official Document</p>
                <div className="mt-2 p-2 bg-black/30 rounded font-mono text-xs text-gray-500">
                  {data.titleDeedHash ? `${data.titleDeedHash.slice(0, 32)}...` : 'Awaiting upload...'}
                </div>
              </div>
            </div>
          </div>

          {/* Valuation Report */}
          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Scale className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-white">Valuation Report</h4>
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Certified
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">CBRE Dubai — Certified Valuer</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-black/30 p-2 rounded">
                    <span className="text-gray-500">Value:</span>
                    <span className="text-white ml-2 font-bold">AED 55M</span>
                  </div>
                  <div className="bg-black/30 p-2 rounded">
                    <span className="text-gray-500">Date:</span>
                    <span className="text-white ml-2">2024-01-15</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 5,
      sectionId: 'property-creation',
      title: 'Select Jurisdiction',
      description: 'Choose regulatory framework: Dubai / ADGM / DIFC',
      code: `// Select jurisdiction and legal framework
const jurisdiction = await client.jurisdiction.select({
  region: 'DUBAI',           // Dubai mainland
  regulator: 'VARA',         // Virtual Assets Regulatory Authority
  framework: 'REAL_ESTATE',  // Real estate tokenization framework
});

// Auto-generates compliance profile
const compliance = jurisdiction.complianceProfile;`,
      action: async (addLog, setData) => {
        addLog('🌍 Analyzing jurisdictions...');
        await new Promise(r => setTimeout(r, 300));

        addLog('');
        addLog('Available Jurisdictions:');
        addLog('  1. DUBAI (Mainland) — VARA regulated');
        addLog('  2. ADGM — Abu Dhabi Global Market');
        addLog('  3. DIFC — Dubai International Financial Centre');

        await new Promise(r => setTimeout(r, 500));
        addLog('');
        addLog('✓ Selected: DUBAI (Mainland)');
        addLog('');
        addLog('📋 Compliance Profile Auto-Generated:');
        addLog('  Regulator: VARA');
        addLog('  KYC Required: Yes (Tier 2)');
        addLog('  AML Screening: FATF + UAE CBUAE');
        addLog('  Accreditation: Qualified Investor');
        addLog('  Min Investment: AED 50,000');
        addLog('  Holding Period: 12 months');

        setData(prev => ({
          ...prev,
          jurisdiction: 'DUBAI',
          regulator: 'VARA',
        }));
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-amber-400" />
            Jurisdiction Selection
          </h3>

          {/* Jurisdiction Cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'DUBAI', name: 'Dubai', flag: '🇦🇪', regulator: 'VARA', selected: true },
              { id: 'ADGM', name: 'ADGM', flag: '🇦🇪', regulator: 'FSRA', selected: false },
              { id: 'DIFC', name: 'DIFC', flag: '🇦🇪', regulator: 'DFSA', selected: false },
            ].map(j => (
              <div
                key={j.id}
                className={`p-3 rounded-xl border text-center transition-all ${
                  j.selected
                    ? 'bg-amber-500/20 border-amber-500/50'
                    : 'bg-white/5 border-white/10 opacity-50'
                }`}
              >
                <span className="text-2xl">{j.flag}</span>
                <p className="font-bold text-white mt-1">{j.name}</p>
                <p className="text-xs text-gray-400">{j.regulator}</p>
                {j.selected && (
                  <CheckCircle className="w-4 h-4 text-amber-400 mx-auto mt-2" />
                )}
              </div>
            ))}
          </div>

          {/* Auto-Generated Compliance Profile */}
          <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4 rounded-xl border border-amber-500/20">
            <h4 className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Auto-Generated Compliance Profile
            </h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { label: 'Regulator', value: 'VARA' },
                { label: 'KYC Tier', value: 'Tier 2' },
                { label: 'AML Rules', value: 'FATF + CBUAE' },
                { label: 'Accreditation', value: 'Qualified Investor' },
                { label: 'Min Investment', value: 'AED 50,000' },
                { label: 'Holding Period', value: '12 months' },
              ].map(item => (
                <div key={item.label} className="flex justify-between p-2 bg-black/20 rounded">
                  <span className="text-gray-400">{item.label}</span>
                  <span className="text-white font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 6,
      sectionId: 'property-creation',
      title: 'Create Asset with SPV',
      description: 'Register asset with legal wrapper and link documents',
      code: `const asset = await client.assets.create({
  name: 'Marina Heights Tower - Unit 4201',
  description: 'Luxury penthouse in Dubai Marina',
  rightType: 'OWNERSHIP',
  jurisdiction: { countryCode: 'AE', region: 'DUBAI' },

  // Legal wrapper
  legalWrapper: 'SPV_LLC',
  spvName: 'Marina Heights 4201 LLC',

  // Property metadata
  metadata: {
    propertyId: 'DM-2024-78923',
    propertyType: 'RESIDENTIAL',
    area: 4200, // sqft
    location: { lat: 25.0805, lng: 55.1403 },
    titleDeedHash: documents.titleDeed.hash,
    valuationHash: documents.valuation.hash,
  },
});`,
      action: async (addLog, setData, data) => {
        addLog('🏗️ Creating asset with legal wrapper...');
        await new Promise(r => setTimeout(r, 500));

        const asset = await sdkStore.createAsset({
          name: 'Marina Heights Tower - Unit 4201',
          description: 'Luxury penthouse in Dubai Marina',
          rightType: RightType.OWNERSHIP,
          jurisdiction: { countryCode: 'AE' },
          issuerId: data.issuerId,
          metadata: {
            propertyType: 'RESIDENTIAL',
            area: 4200,
            valuation: data.valuation || '55000000',
          },
        });

        addLog('✓ Asset created successfully');
        addLog('');
        addLog('📋 Asset Details:');
        addLog(`  ID: ${asset.id}`);
        addLog(`  Name: ${asset.name}`);
        addLog(`  State: ${asset.state}`);
        addLog(`  Right Type: OWNERSHIP`);
        addLog('');
        addLog('🏛️ Legal Wrapper:');
        addLog('  Type: SPV (Special Purpose Vehicle)');
        addLog('  Entity: Marina Heights 4201 LLC');
        addLog('  Registered: Dubai DED');
        addLog('');
        addLog('🔗 Document Hashes Linked:');
        addLog(`  Title Deed: ${(data.titleDeedHash || '').slice(0, 20)}...`);
        addLog(`  Valuation: ${(data.valuationHash || '').slice(0, 20)}...`);

        setData(prev => ({
          ...prev,
          assetId: asset.id,
          assetState: asset.state,
        }));
      },
      render: (data) => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Building className="w-5 h-5 text-amber-400" />
            Asset Created
          </h3>

          {/* Property Card with Map */}
          <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <div className="h-40">
              <PropertyMap
                address="Dubai Marina, Dubai"
                latitude={25.0805}
                longitude={55.1403}
                height="100%"
              />
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-white">Marina Heights Tower - Unit 4201</h4>
                <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                  {data.assetState || 'DRAFT'}
                </span>
              </div>
              <p className="text-sm text-gray-400">Luxury penthouse in Dubai Marina</p>
              <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
                <div className="text-center p-2 bg-black/20 rounded">
                  <p className="text-gray-500 text-xs">Area</p>
                  <p className="text-white font-bold">4,200 sqft</p>
                </div>
                <div className="text-center p-2 bg-black/20 rounded">
                  <p className="text-gray-500 text-xs">Valuation</p>
                  <p className="text-white font-bold">AED 55M</p>
                </div>
                <div className="text-center p-2 bg-black/20 rounded">
                  <p className="text-gray-500 text-xs">Type</p>
                  <p className="text-white font-bold">Residential</p>
                </div>
              </div>
            </div>
          </div>

          {/* Legal Wrapper */}
          <div className="bg-purple-500/10 p-4 rounded-xl border border-purple-500/20">
            <h4 className="text-sm font-bold text-purple-400 mb-2 flex items-center gap-2">
              <Scale className="w-4 h-4" />
              Legal Wrapper
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Structure</span>
                <span className="text-white">SPV (Special Purpose Vehicle)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Entity Name</span>
                <span className="text-white">Marina Heights 4201 LLC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Registry</span>
                <span className="text-white">Dubai DED</span>
              </div>
            </div>
          </div>

          {/* Asset ID */}
          <div className="bg-black/30 p-3 rounded-lg font-mono text-xs">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <Hash className="w-3 h-3" />
              Asset ID
            </div>
            <p className="text-amber-400">{data.assetId || 'Pending...'}</p>
          </div>
        </div>
      ),
      completed: false,
    },

    // =========================================================================
    // C. TOKEN CONFIGURATION (steps 7-9)
    // =========================================================================
    {
      id: 7,
      sectionId: 'token-config',
      title: 'Configure Offering',
      description: 'Set total supply, unit price, and ownership constraints',
      code: `const tokenConfig = {
  totalSupply: 10000,           // 10,000 tokens
  pricePerToken: 5500,          // AED 5,500 per token
  currency: 'AED',

  // Ownership constraints
  maxOwnershipPct: 25,          // Max 25% per investor
  minTokens: 10,                // Minimum 10 tokens
  maxTokens: 2500,              // Maximum 2,500 tokens

  // Accreditation
  accreditedOnly: true,
};
// Total offering = 10,000 × 5,500 = AED 55,000,000`,
      action: async (addLog, setData, data) => {
        addLog('⚙️ Configuring token economics...');
        await new Promise(r => setTimeout(r, 400));

        addLog('');
        addLog('📊 Token Configuration:');
        addLog('  Total Supply: 10,000 tokens');
        addLog('  Price per Token: AED 5,500');
        addLog('  Total Value: AED 55,000,000');
        addLog('');
        addLog('🔒 Ownership Constraints:');
        addLog('  Max Ownership: 25% (2,500 tokens)');
        addLog('  Min Investment: 10 tokens (AED 55,000)');
        addLog('  Accredited Only: Yes');

        if (data.assetId) {
          sdkStore.createOffering(data.assetId, {
            totalSupply: 10000,
            pricePerToken: 5500,
            minInvestment: 55000,
            maxInvestment: 13750000,
            currency: 'AED',
            startDate: '2024-02-01',
            endDate: '2024-06-01',
          });
        }

        setData(prev => ({
          ...prev,
          tokenConfig: {
            totalSupply: 10000,
            pricePerToken: 5500,
          },
        }));
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            Token Configuration
          </h3>

          {/* Token Economics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 text-center">
              <p className="text-xs text-gray-400">Total Supply</p>
              <p className="text-2xl font-bold text-white">10,000</p>
              <p className="text-xs text-amber-400">tokens</p>
            </div>
            <div className="bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 text-center">
              <p className="text-xs text-gray-400">Price per Token</p>
              <p className="text-2xl font-bold text-white">AED 5,500</p>
              <p className="text-xs text-amber-400">≈ $1,500 USD</p>
            </div>
          </div>

          {/* Ownership Constraints */}
          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              Ownership Constraints
            </h4>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-400">Max Ownership</span>
                  <span className="text-white">25%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-2">
                  <div className="bg-amber-500 h-2 rounded-full" style={{ width: '25%' }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-black/20 p-2 rounded">
                  <span className="text-gray-400">Min:</span>
                  <span className="text-white ml-2">10 tokens</span>
                </div>
                <div className="bg-black/20 p-2 rounded">
                  <span className="text-gray-400">Max:</span>
                  <span className="text-white ml-2">2,500 tokens</span>
                </div>
              </div>
            </div>
          </div>

          {/* Accreditation Badge */}
          <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
            <Shield className="w-5 h-5 text-green-400" />
            <span className="text-sm text-green-400">Qualified Investors Only</span>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 8,
      sectionId: 'token-config',
      title: 'Deploy ERC-3643 Token',
      description: 'Deploy compliant token with OnchainID identity registry',
      code: `const token = await client.tokens.deployERC3643({
  assetId: asset.id,
  name: 'Marina Heights 4201',
  symbol: 'MH4201',
  decimals: 0,

  // Identity Registry (T-REX)
  identityRegistry: {
    provider: 'ONCHAINID',
    claimTopics: [
      1,  // KYC verified
      2,  // Accredited investor
      7,  // Jurisdiction approved
    ],
  },

  // Compliance module
  compliance: {
    module: 'MODULAR_COMPLIANCE',
    rules: ['MaxBalance', 'CountryAllow', 'ConditionalTransfer'],
  },
});`,
      action: async (addLog, setData, data) => {
        addLog('🔧 Deploying ERC-3643 token...');
        await new Promise(r => setTimeout(r, 600));

        addLog('');
        addLog('📜 Token Standard: ERC-3643 (T-REX)');
        addLog('  Name: Marina Heights 4201');
        addLog('  Symbol: MH4201');
        addLog('  Decimals: 0 (non-divisible)');
        addLog('');
        addLog('🆔 Identity Registry (OnchainID):');
        addLog('  Claim Topic 1: KYC Verified');
        addLog('  Claim Topic 2: Accredited Investor');
        addLog('  Claim Topic 7: Jurisdiction Approved');
        addLog('');
        addLog('📋 Compliance Module:');
        addLog('  MaxBalance: 25% max ownership');
        addLog('  CountryAllow: AE, US, GB, SG, CH');
        addLog('  ConditionalTransfer: KYC + Accreditation check');

        // Transition to PENDING_VERIFICATION and VERIFIED
        if (data.assetId) {
          await sdkStore.transition(data.assetId, LifecycleState.PENDING_VERIFICATION, data.issuerId);
          await sdkStore.transition(data.assetId, LifecycleState.VERIFIED, data.issuerId);
        }

        const tokenAddress = '0x' + Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        addLog('');
        addLog(`✓ Token deployed: ${tokenAddress.slice(0, 10)}...`);

        setData(prev => ({
          ...prev,
          tokenAddress,
          tokenSymbol: 'MH4201',
        }));
      },
      render: (data) => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-amber-400" />
            ERC-3643 Configuration
          </h3>

          {/* Token Info */}
          <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 p-4 rounded-xl border border-purple-500/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="font-bold text-white">Marina Heights 4201</h4>
                <p className="text-sm text-purple-400 font-mono">{data.tokenSymbol || 'MH4201'}</p>
              </div>
              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded font-mono">
                ERC-3643
              </span>
            </div>
            <div className="bg-black/30 p-2 rounded font-mono text-xs text-gray-400">
              {data.tokenAddress || '0x...'}
            </div>
          </div>

          {/* Identity Registry */}
          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <h4 className="text-sm font-bold text-white mb-3">Identity Registry (OnchainID)</h4>
            <div className="space-y-2">
              {[
                { topic: 1, name: 'KYC Verified', color: 'green' },
                { topic: 2, name: 'Accredited Investor', color: 'blue' },
                { topic: 7, name: 'Jurisdiction Approved', color: 'amber' },
              ].map(claim => (
                <div key={claim.topic} className="flex items-center gap-3 p-2 bg-black/20 rounded">
                  <span className={`w-6 h-6 rounded-full bg-${claim.color}-500/20 text-${claim.color}-400 text-xs flex items-center justify-center font-mono`}>
                    {claim.topic}
                  </span>
                  <span className="text-sm text-white">{claim.name}</span>
                  <CheckCircle className="w-4 h-4 text-green-400 ml-auto" />
                </div>
              ))}
            </div>
          </div>

          {/* Compliance Rules */}
          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <h4 className="text-sm font-bold text-white mb-3">Compliance Module</h4>
            <div className="space-y-2 text-sm">
              {[
                { rule: 'MaxBalance', desc: 'No holder can own more than 25%' },
                { rule: 'CountryAllow', desc: 'AE, US, GB, SG, CH only' },
                { rule: 'ConditionalTransfer', desc: 'Recipient must have valid claims' },
              ].map(r => (
                <div key={r.rule} className="flex items-start gap-2 p-2 bg-black/20 rounded">
                  <Shield className="w-4 h-4 text-amber-400 mt-0.5" />
                  <div>
                    <span className="text-white font-medium">{r.rule}</span>
                    <p className="text-gray-400 text-xs">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 9,
      sectionId: 'token-config',
      title: 'Transfer Rules Visualization',
      description: 'Visual representation of all on-chain transfer restrictions',
      code: `// Get visual transfer rules
const transferRules = await client.compliance.getTransferRules(token.address);

// Rules are enforced on-chain via:
// 1. Identity Registry — checks claim validity
// 2. Compliance Module — checks business rules
// 3. Transfer Agent — manages forced transfers`,
      action: async (addLog, setData, data) => {
        addLog('📊 Loading transfer rules visualization...');
        await new Promise(r => setTimeout(r, 400));

        addLog('');
        addLog('🔐 Active Transfer Rules:');
        addLog('');
        addLog('1. SENDER CHECKS:');
        addLog('   ├── Has valid KYC claim (Topic 1)');
        addLog('   ├── Not frozen by issuer');
        addLog('   └── Has sufficient balance');
        addLog('');
        addLog('2. RECIPIENT CHECKS:');
        addLog('   ├── Has valid KYC claim (Topic 1)');
        addLog('   ├── Has accredited investor claim (Topic 2)');
        addLog('   ├── Jurisdiction in allowlist (Topic 7)');
        addLog('   └── Post-transfer balance ≤ 25% supply');
        addLog('');
        addLog('3. TRANSFER CHECKS:');
        addLog('   ├── Asset not frozen');
        addLog('   └── Not in lockup period (12 months)');
        addLog('');
        addLog('✓ 9 rules active | All on-chain enforced');

        // Activate offering
        if (data.assetId) {
          await sdkStore.transition(data.assetId, LifecycleState.ACTIVE, data.issuerId);
        }
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Eye className="w-5 h-5 text-amber-400" />
            Transfer Rules Visualization
          </h3>

          {/* Visual Flow */}
          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <div className="flex items-center justify-between mb-6">
              {/* Sender */}
              <div className="flex-1 text-center">
                <div className="w-12 h-12 mx-auto mb-2 bg-blue-500/20 rounded-full flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-blue-400" />
                </div>
                <p className="text-sm font-medium text-white">Sender</p>
              </div>

              {/* Arrow with rules */}
              <div className="flex-1 flex flex-col items-center">
                <div className="w-full h-0.5 bg-gradient-to-r from-blue-500 via-amber-500 to-green-500 relative">
                  <ArrowRightLeft className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-amber-400 bg-[#0d1117] px-1" />
                </div>
                <p className="text-xs text-amber-400 mt-2">9 Rules Active</p>
              </div>

              {/* Recipient */}
              <div className="flex-1 text-center">
                <div className="w-12 h-12 mx-auto mb-2 bg-green-500/20 rounded-full flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-green-400" />
                </div>
                <p className="text-sm font-medium text-white">Recipient</p>
              </div>
            </div>

            {/* Rule Categories */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              {/* Sender Rules */}
              <div className="space-y-1">
                <p className="text-blue-400 font-medium mb-2">Sender Checks</p>
                {['KYC Valid', 'Not Frozen', 'Has Balance'].map(r => (
                  <div key={r} className="flex items-center gap-1 text-gray-400">
                    <CheckCircle className="w-3 h-3 text-green-400" />
                    {r}
                  </div>
                ))}
              </div>

              {/* Transfer Rules */}
              <div className="space-y-1">
                <p className="text-amber-400 font-medium mb-2">Transfer Checks</p>
                {['Not Frozen', 'Lockup Passed', 'Agent OK'].map(r => (
                  <div key={r} className="flex items-center gap-1 text-gray-400">
                    <CheckCircle className="w-3 h-3 text-green-400" />
                    {r}
                  </div>
                ))}
              </div>

              {/* Recipient Rules */}
              <div className="space-y-1">
                <p className="text-green-400 font-medium mb-2">Recipient Checks</p>
                {['KYC Valid', 'Accredited', 'Jurisdiction', 'Max 25%'].map(r => (
                  <div key={r} className="flex items-center gap-1 text-gray-400">
                    <CheckCircle className="w-3 h-3 text-green-400" />
                    {r}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Whitelist */}
          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <h4 className="text-sm font-bold text-white mb-3">Jurisdiction Whitelist</h4>
            <div className="flex flex-wrap gap-2">
              {[
                { code: 'AE', flag: '🇦🇪', name: 'UAE' },
                { code: 'US', flag: '🇺🇸', name: 'USA' },
                { code: 'GB', flag: '🇬🇧', name: 'UK' },
                { code: 'SG', flag: '🇸🇬', name: 'Singapore' },
                { code: 'CH', flag: '🇨🇭', name: 'Switzerland' },
              ].map(j => (
                <span key={j.code} className="px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-xs flex items-center gap-1">
                  <span>{j.flag}</span> {j.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      ),
      completed: false,
    },

    // =========================================================================
    // D. PRIMARY DISTRIBUTION (steps 10-12)
    // =========================================================================
    {
      id: 10,
      sectionId: 'primary-distribution',
      title: 'Investor KYC',
      description: 'Simulate KYC verification for multiple investors',
      code: `const investors = [
  { name: 'Ahmed Al Maktoum', jurisdiction: 'AE', accredited: true },
  { name: 'Sarah Johnson', jurisdiction: 'US', accredited: true },
  { name: 'Zhang Wei', jurisdiction: 'CN', accredited: true }, // NOT whitelisted
];

for (const inv of investors) {
  const result = await client.kyc.verify(inv);
  console.log(\`\${inv.name}: \${result.status}\`);
}`,
      action: async (addLog, setData) => {
        const investors = [
          { name: 'Ahmed Al Maktoum', jurisdiction: 'AE', accredited: true, kycPassed: true },
          { name: 'Sarah Johnson', jurisdiction: 'US', accredited: true, kycPassed: true },
          { name: 'Zhang Wei', jurisdiction: 'CN', accredited: true, kycPassed: false },
        ];

        addLog('👥 Processing investor KYC...');
        addLog('');

        const results = [];

        for (const inv of investors) {
          addLog(`Processing: ${inv.name} (${inv.jurisdiction})...`);
          await new Promise(r => setTimeout(r, 600));

          if (inv.kycPassed) {
            const party = await sdkStore.createParty({
              name: inv.name,
              type: PartyType.INDIVIDUAL,
              roles: [PartyRole.INVESTOR],
              jurisdiction: inv.jurisdiction,
            });
            sdkStore.verifyKyc(party.id);

            addLog(`  ✓ KYC PASSED`);
            addLog(`    Identity verified`);
            addLog(`    Accreditation: Qualified Investor`);
            addLog(`    Jurisdiction: ${inv.jurisdiction} (APPROVED)`);
            addLog(`    Party ID: ${party.id.slice(0, 12)}...`);
            results.push({ ...inv, status: 'APPROVED', partyId: party.id });
          } else {
            addLog(`  ✗ KYC BLOCKED`);
            addLog(`    Reason: Jurisdiction not in whitelist`);
            addLog(`    ${inv.jurisdiction} is NOT in [AE, US, GB, SG, CH]`);
            results.push({ ...inv, status: 'BLOCKED', reason: 'Jurisdiction not whitelisted' });
          }
          addLog('');
        }

        setData(prev => ({ ...prev, kycResults: results }));
      },
      render: (data) => {
        const results = data.kycResults ? JSON.parse(JSON.stringify(data.kycResults)) : [
          { name: 'Ahmed Al Maktoum', jurisdiction: 'AE', status: 'APPROVED' },
          { name: 'Sarah Johnson', jurisdiction: 'US', status: 'APPROVED' },
          { name: 'Zhang Wei', jurisdiction: 'CN', status: 'BLOCKED', reason: 'Jurisdiction not whitelisted' },
        ];

        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-400" />
              Investor KYC Results
            </h3>

            <div className="space-y-3">
              {results.map((inv: any, i: number) => (
                <div
                  key={i}
                  className={`p-4 rounded-xl border ${
                    inv.status === 'APPROVED'
                      ? 'bg-green-500/5 border-green-500/20'
                      : 'bg-red-500/5 border-red-500/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                        inv.status === 'APPROVED' ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        {inv.name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                      <div>
                        <p className="font-medium text-white">{inv.name}</p>
                        <p className="text-xs text-gray-400">{inv.jurisdiction}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      inv.status === 'APPROVED'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {inv.status === 'APPROVED' ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> APPROVED
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <XCircle className="w-3 h-3" /> BLOCKED
                        </span>
                      )}
                    </span>
                  </div>

                  {inv.status === 'APPROVED' ? (
                    <div className="flex gap-2 mt-2">
                      <span className="px-2 py-0.5 bg-white/5 text-gray-400 text-xs rounded">KYC Tier 2</span>
                      <span className="px-2 py-0.5 bg-white/5 text-gray-400 text-xs rounded">Accredited</span>
                      <span className="px-2 py-0.5 bg-green-500/10 text-green-400 text-xs rounded">Eligible</span>
                    </div>
                  ) : (
                    <div className="mt-2 p-2 bg-red-500/10 rounded text-xs text-red-400 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5" />
                      <span>{inv.reason}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-sm text-gray-400 text-center">
              2 of 3 investors eligible for token purchase
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 11,
      sectionId: 'primary-distribution',
      title: 'Mint Tokens',
      description: 'Mint tokens to approved investors with compliance receipts',
      code: `const mintOperations = [
  { investor: ahmed.id, amount: 1000 },  // AED 5.5M
  { investor: sarah.id, amount: 500 },   // AED 2.75M
];

for (const op of mintOperations) {
  const result = await client.tokens.mint(
    token.address, op.investor, op.amount
  );
  console.log('Compliance Receipt:', result.complianceReceipt);
}`,
      action: async (addLog, setData, data) => {
        const parties = sdkStore.getParties();
        const ahmed = parties.find(p => p.name === 'Ahmed Al Maktoum');
        const sarah = parties.find(p => p.name === 'Sarah Johnson');

        if (!ahmed || !sarah || !data.assetId) {
          addLog('⚠️ Run previous steps first');
          return;
        }

        addLog('🪙 Minting tokens to approved investors...');
        addLog('');

        // Mint to Ahmed
        addLog('Minting to Ahmed Al Maktoum...');
        await new Promise(r => setTimeout(r, 500));
        await sdkStore.mint(data.assetId, ahmed.id, '1000');
        const txHash1 = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        addLog(`  ✓ MINT SUCCESSFUL`);
        addLog(`    Amount: 1,000 tokens (AED 5,500,000)`);
        addLog(`    Tx Hash: ${txHash1.slice(0, 20)}...`);
        addLog('');
        addLog('  📋 Compliance Receipt:');
        addLog('    KYC Check: PASSED');
        addLog('    Accreditation: VERIFIED');
        addLog('    Jurisdiction: AE (APPROVED)');
        addLog('    Max Balance: 10% < 25% (OK)');
        addLog('');

        // Mint to Sarah
        addLog('Minting to Sarah Johnson...');
        await new Promise(r => setTimeout(r, 500));
        await sdkStore.mint(data.assetId, sarah.id, '500');
        const txHash2 = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        addLog(`  ✓ MINT SUCCESSFUL`);
        addLog(`    Amount: 500 tokens (AED 2,750,000)`);
        addLog(`    Tx Hash: ${txHash2.slice(0, 20)}...`);
        addLog('');
        addLog('  📋 Compliance Receipt:');
        addLog('    KYC Check: PASSED');
        addLog('    Accreditation: VERIFIED');
        addLog('    Jurisdiction: US (APPROVED)');
        addLog('    Max Balance: 5% < 25% (OK)');

        sdkStore.updateOfferingSold(data.assetId, 1500);

        setData(prev => ({
          ...prev,
          investorId: ahmed.id,
          buyerId: sarah.id,
        }));
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" />
            Token Minting
          </h3>

          {/* Mint Results */}
          <div className="space-y-3">
            {[
              { name: 'Ahmed Al Maktoum', amount: 1000, value: 'AED 5.5M', pct: 10 },
              { name: 'Sarah Johnson', amount: 500, value: 'AED 2.75M', pct: 5 },
            ].map((m, i) => (
              <div key={i} className="bg-green-500/5 p-4 rounded-xl border border-green-500/20">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="font-medium text-white">{m.name}</span>
                  </div>
                  <span className="text-green-400 font-bold">{m.amount.toLocaleString()} tokens</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-black/20 p-2 rounded text-center">
                    <p className="text-gray-500">Value</p>
                    <p className="text-white font-medium">{m.value}</p>
                  </div>
                  <div className="bg-black/20 p-2 rounded text-center">
                    <p className="text-gray-500">Ownership</p>
                    <p className="text-white font-medium">{m.pct}%</p>
                  </div>
                  <div className="bg-black/20 p-2 rounded text-center">
                    <p className="text-gray-500">Status</p>
                    <p className="text-green-400 font-medium">Minted</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Supply Progress */}
          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Tokens Minted</span>
              <span className="text-white">1,500 / 10,000</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-3">
              <div className="bg-amber-500 h-3 rounded-full transition-all" style={{ width: '15%' }} />
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">15% of total supply distributed</p>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 12,
      sectionId: 'primary-distribution',
      title: 'Audit Trail',
      description: 'View complete audit trail of all compliance events',
      code: `const auditTrail = await client.audit.getEvents({
  tokenAddress: token.address,
  limit: 50,
});

auditTrail.forEach(event => {
  console.log(\`[\${event.timestamp}] \${event.type}\`);
  console.log(\`  Actor: \${event.actor}\`);
});`,
      action: async (addLog) => {
        addLog('📜 Loading audit trail...');
        await new Promise(r => setTimeout(r, 400));

        const events = [
          { time: '10:23:15', type: 'ASSET_CREATED', actor: 'Dubai Properties LLC', detail: 'Asset registered with SPV wrapper' },
          { time: '10:23:18', type: 'DOCUMENTS_UPLOADED', actor: 'Dubai Properties LLC', detail: 'Title deed + valuation linked' },
          { time: '10:24:02', type: 'TOKEN_DEPLOYED', actor: 'System', detail: 'ERC-3643 token deployed to Base L2' },
          { time: '10:24:45', type: 'COMPLIANCE_CONFIGURED', actor: 'Dubai Properties LLC', detail: '9 transfer rules activated' },
          { time: '10:25:12', type: 'KYC_VERIFIED', actor: 'Onfido', detail: 'Ahmed Al Maktoum - Tier 2' },
          { time: '10:25:18', type: 'KYC_VERIFIED', actor: 'Onfido', detail: 'Sarah Johnson - Tier 2' },
          { time: '10:25:24', type: 'KYC_REJECTED', actor: 'Onfido', detail: 'Zhang Wei - Jurisdiction blocked' },
          { time: '10:26:01', type: 'TOKENS_MINTED', actor: 'Dubai Properties LLC', detail: '1,000 tokens to Ahmed' },
          { time: '10:26:15', type: 'TOKENS_MINTED', actor: 'Dubai Properties LLC', detail: '500 tokens to Sarah' },
        ];

        addLog('');
        events.forEach(e => {
          const icon = e.type.includes('REJECTED') ? '✗' : '✓';
          addLog(`[${e.time}] ${icon} ${e.type}`);
          addLog(`  Actor: ${e.actor}`);
          addLog(`  ${e.detail}`);
          addLog('');
        });

        addLog('─────────────────────────────────');
        addLog(`Total Events: ${events.length}`);
        addLog('All events are immutably stored on-chain');
      },
      render: () => {
        const events = [
          { time: '10:23:15', type: 'ASSET_CREATED', icon: Building, color: 'amber' },
          { time: '10:23:18', type: 'DOCUMENTS_UPLOADED', icon: FileText, color: 'blue' },
          { time: '10:24:02', type: 'TOKEN_DEPLOYED', icon: Coins, color: 'purple' },
          { time: '10:24:45', type: 'COMPLIANCE_CONFIGURED', icon: Shield, color: 'green' },
          { time: '10:25:12', type: 'KYC_VERIFIED', icon: CheckCircle, color: 'green' },
          { time: '10:25:18', type: 'KYC_VERIFIED', icon: CheckCircle, color: 'green' },
          { time: '10:25:24', type: 'KYC_REJECTED', icon: XCircle, color: 'red' },
          { time: '10:26:01', type: 'TOKENS_MINTED', icon: Coins, color: 'amber' },
          { time: '10:26:15', type: 'TOKENS_MINTED', icon: Coins, color: 'amber' },
        ];

        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              Audit Trail
            </h3>

            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden max-h-80 overflow-y-auto">
              {events.map((e, i) => {
                const Icon = e.icon;
                return (
                  <div key={i} className="flex items-center gap-3 p-3 border-b border-white/5 last:border-0 hover:bg-white/5">
                    <span className="text-xs text-gray-500 font-mono w-16">{e.time}</span>
                    <div className={`w-6 h-6 rounded-full bg-${e.color}-500/20 flex items-center justify-center`}>
                      <Icon className={`w-3 h-3 text-${e.color}-400`} />
                    </div>
                    <span className="text-sm text-white">{e.type}</span>
                  </div>
                );
              })}
            </div>

            <div className="text-center text-xs text-gray-500">
              9 events recorded • All immutably stored on-chain
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // E. SECONDARY TRANSFER (steps 13-16)
    // =========================================================================
    {
      id: 13,
      sectionId: 'secondary-transfer',
      title: 'Transfer to Non-KYC Wallet',
      description: 'Attempt transfer to unknown wallet — see detailed failure',
      code: `// Attempt transfer to non-KYC wallet
const unknownWallet = '0x9876543210...';

try {
  await client.tokens.transfer(
    token.address,
    ahmed.wallet,      // from
    unknownWallet,     // to (no KYC)
    100
  );
} catch (error) {
  console.log('Transfer REJECTED');
  console.log('Reason:', error.complianceFailure);
}`,
      action: async (addLog) => {
        addLog('🔄 Attempting transfer to unknown wallet...');
        addLog('');
        addLog('From: Ahmed Al Maktoum (0x1234...7890)');
        addLog('To: Unknown Wallet (0x9876...5432)');
        addLog('Amount: 100 tokens');
        addLog('');

        await new Promise(r => setTimeout(r, 600));

        addLog('❌ TRANSFER REJECTED');
        addLog('');
        addLog('═══════════════════════════════════════════');
        addLog('COMPLIANCE FAILURE REPORT');
        addLog('═══════════════════════════════════════════');
        addLog('');
        addLog('FAILED CHECK: Identity Registry');
        addLog('');
        addLog('Details:');
        addLog('  Recipient wallet 0x9876...5432 is NOT registered');
        addLog('  in the OnchainID Identity Registry.');
        addLog('');
        addLog('Missing Claims:');
        addLog('  ✗ Claim Topic 1 (KYC) — NOT FOUND');
        addLog('  ✗ Claim Topic 2 (Accredited) — NOT FOUND');
        addLog('  ✗ Claim Topic 7 (Jurisdiction) — NOT FOUND');
        addLog('');
        addLog('Required Action:');
        addLog('  Recipient must complete KYC verification and');
        addLog('  register with OnchainID before receiving tokens.');
        addLog('');
        addLog('Error Code: RECIPIENT_NOT_VERIFIED');
        addLog('Revert Reason: "Identity not found in registry"');
        addLog('═══════════════════════════════════════════');
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-400" />
            Transfer Blocked — No KYC
          </h3>

          {/* Transfer Attempt */}
          <div className="bg-red-500/5 p-4 rounded-xl border border-red-500/20">
            <div className="flex items-center justify-between mb-4">
              <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-1 bg-green-500/20 rounded-full flex items-center justify-center">
                  <span className="text-sm">AM</span>
                </div>
                <p className="text-xs text-white">Ahmed</p>
                <p className="text-xs text-green-400">KYC ✓</p>
              </div>
              <div className="flex-1 mx-4">
                <div className="flex items-center">
                  <div className="flex-1 h-0.5 bg-green-500/30" />
                  <XCircle className="w-6 h-6 text-red-400 mx-2" />
                  <div className="flex-1 h-0.5 bg-red-500/30" />
                </div>
                <p className="text-center text-xs text-red-400 mt-1">100 tokens</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 mx-auto mb-1 bg-red-500/20 rounded-full flex items-center justify-center">
                  <span className="text-sm">?</span>
                </div>
                <p className="text-xs text-white">Unknown</p>
                <p className="text-xs text-red-400">No KYC</p>
              </div>
            </div>
          </div>

          {/* Failure Details */}
          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <h4 className="text-sm font-bold text-red-400 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Compliance Failure Report
            </h4>

            <div className="space-y-3 text-sm">
              <div className="p-3 bg-red-500/10 rounded-lg">
                <p className="text-red-400 font-medium">Failed Check: Identity Registry</p>
                <p className="text-gray-400 mt-1">Recipient not registered in OnchainID</p>
              </div>

              <div>
                <p className="text-gray-400 mb-2">Missing Claims:</p>
                <div className="space-y-1">
                  {['KYC Verified', 'Accredited Investor', 'Jurisdiction Approved'].map(claim => (
                    <div key={claim} className="flex items-center gap-2 text-red-400">
                      <XCircle className="w-3 h-3" />
                      <span>{claim}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 14,
      sectionId: 'secondary-transfer',
      title: 'Cross-Jurisdiction Transfer',
      description: 'Attempt transfer to blocked jurisdiction — see why it fails',
      code: `// Attempt transfer to investor in blocked jurisdiction
const investorInChina = await client.parties.create({
  name: 'Li Ming',
  jurisdiction: 'CN',  // China - NOT whitelisted
});

try {
  await client.tokens.transfer(
    token.address,
    ahmed.wallet,
    investorInChina.wallet,
    50
  );
} catch (error) {
  console.log('Jurisdiction check failed');
}`,
      action: async (addLog) => {
        addLog('🔄 Attempting cross-jurisdiction transfer...');
        addLog('');
        addLog('From: Ahmed Al Maktoum (UAE)');
        addLog('To: Li Ming (China)');
        addLog('Amount: 50 tokens');
        addLog('');

        await new Promise(r => setTimeout(r, 600));

        addLog('❌ TRANSFER REJECTED');
        addLog('');
        addLog('═══════════════════════════════════════════');
        addLog('COMPLIANCE FAILURE REPORT');
        addLog('═══════════════════════════════════════════');
        addLog('');
        addLog('FAILED CHECK: CountryAllow Compliance Rule');
        addLog('');
        addLog('Details:');
        addLog('  Recipient jurisdiction: CN (China)');
        addLog('  Allowed jurisdictions: AE, US, GB, SG, CH');
        addLog('');
        addLog('Regulatory Context:');
        addLog('  This token is issued under VARA (UAE) regulations');
        addLog('  which restricts distribution to approved jurisdictions.');
        addLog('');
        addLog('  China (CN) is excluded due to:');
        addLog('  - No bilateral regulatory agreement with UAE');
        addLog('  - Capital control restrictions');
        addLog('  - Cross-border RWA limitations');
        addLog('');
        addLog('Error Code: JURISDICTION_NOT_ALLOWED');
        addLog('Revert Reason: "Country not in allowlist"');
        addLog('═══════════════════════════════════════════');
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-red-400" />
            Jurisdiction Blocked
          </h3>

          {/* Visual */}
          <div className="bg-red-500/5 p-4 rounded-xl border border-red-500/20">
            <div className="flex items-center justify-around">
              <div className="text-center">
                <span className="text-3xl">🇦🇪</span>
                <p className="text-xs text-white mt-1">UAE</p>
                <p className="text-xs text-green-400">Allowed</p>
              </div>
              <ArrowRightLeft className="w-6 h-6 text-red-400" />
              <div className="text-center">
                <span className="text-3xl">🇨🇳</span>
                <p className="text-xs text-white mt-1">China</p>
                <p className="text-xs text-red-400">Blocked</p>
              </div>
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <h4 className="text-sm font-bold text-red-400 mb-3">Why Transfer Failed</h4>

            <div className="space-y-3 text-sm">
              <p className="text-gray-400">
                <span className="text-white font-medium">CountryAllow Rule:</span>{' '}
                Recipient's jurisdiction (CN) is not in the token's whitelist.
              </p>

              <div>
                <p className="text-gray-400 mb-2">Allowed Jurisdictions:</p>
                <div className="flex flex-wrap gap-2">
                  {['🇦🇪 UAE', '🇺🇸 USA', '🇬🇧 UK', '🇸🇬 Singapore', '🇨🇭 Switzerland'].map(j => (
                    <span key={j} className="px-2 py-1 bg-green-500/10 text-green-400 text-xs rounded">
                      {j}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-xs">
                <p className="text-amber-400 font-medium">Regulatory Reason</p>
                <p className="text-gray-400 mt-1">
                  VARA regulations restrict cross-border token distribution.
                  China lacks bilateral agreement for RWA transfers.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 15,
      sectionId: 'secondary-transfer',
      title: 'Check Eligibility',
      description: 'Verify compliance checks for transfer between verified investors',
      code: `const eligible = await client.compliance.check({
  assetId: asset.id,
  from: ahmed.id,
  to: sarah.id,
  amount: '200',
});
// KYC ✓, Jurisdiction ✓, Holding Period ✓, Max Balance ✓`,
      action: async (addLog, setData, data) => {
        const result = sdkStore.checkTransferCompliance(data.assetId, data.investorId, data.buyerId, '200');
        setData(prev => ({ ...prev, complianceResult: JSON.stringify(result) }));
        addLog(`✓ Compliance check: ${result.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
        for (const check of result.checks) {
          addLog(`  ${check.name}: ${check.passed ? '✓' : '✗'} (${check.detail})`);
        }
      },
      render: (_data) => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'Marina Heights Tower - Unit 4201');
        const parties = sdkStore.getParties();
        const buyer = parties.find(p => p.name === 'Sarah Johnson');
        const investor = parties.find(p => p.name === 'Ahmed Al Maktoum');
        const result = asset && investor && buyer
          ? sdkStore.checkTransferCompliance(asset.id, investor.id, buyer.id, '200')
          : null;
        return (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white mb-2">Transfer Eligibility</h3>
          <div className="space-y-2">
            {(result?.checks || []).map(check => (
              <div key={check.name} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${check.passed ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                  {check.passed ? '✓' : '✗'}
                </div>
                <span className={`text-sm ${check.passed ? 'text-green-400' : 'text-red-400'}`}>{check.name}</span>
                <span className="text-xs text-gray-500 ml-auto">{check.detail}</span>
              </div>
            ))}
          </div>
          <div className={`p-3 rounded-lg border text-center ${result?.eligible ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <span className={`text-sm font-bold ${result?.eligible ? 'text-green-400' : 'text-red-400'}`}>
              {result?.eligible ? 'All checks passed — Transfer eligible' : 'Transfer not eligible'}
            </span>
          </div>
        </div>
        );
      },
      completed: false,
    },
    {
      id: 16,
      sectionId: 'secondary-transfer',
      title: 'Execute Transfer',
      description: 'Transfer 200 tokens between verified investors',
      code: `const result = await client.tokens.transfer(
  token.address,
  ahmed.wallet,   // from: Ahmed (UAE)
  sarah.wallet,   // to: Sarah (US)
  200
);

console.log('Transfer SUCCESSFUL');
console.log('Tx Hash:', result.txHash);`,
      action: async (addLog, setData, data) => {
        addLog('🔄 Initiating compliant transfer...');
        addLog('');
        addLog('From: Ahmed Al Maktoum (UAE)');
        addLog('To: Sarah Johnson (US)');
        addLog('Amount: 200 tokens');
        addLog('');

        addLog('Running compliance checks...');
        await new Promise(r => setTimeout(r, 300));
        addLog('  ✓ Sender KYC: VALID');
        await new Promise(r => setTimeout(r, 200));
        addLog('  ✓ Sender balance: 1,000 ≥ 200 (OK)');
        await new Promise(r => setTimeout(r, 200));
        addLog('  ✓ Recipient KYC: VALID');
        await new Promise(r => setTimeout(r, 200));
        addLog('  ✓ Recipient accreditation: VERIFIED');
        await new Promise(r => setTimeout(r, 200));
        addLog('  ✓ Recipient jurisdiction: US (ALLOWED)');
        await new Promise(r => setTimeout(r, 200));
        addLog('  ✓ Post-transfer balance: 700 tokens (7% < 25%)');
        addLog('');

        if (data.investorId && data.buyerId && data.assetId) {
          await sdkStore.transfer(data.assetId, data.investorId, data.buyerId, '200');
        }

        const txHash = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');

        addLog('✅ TRANSFER SUCCESSFUL');
        addLog('');
        addLog(`Tx Hash: ${txHash.slice(0, 30)}...`);
        addLog('');
        addLog('Updated Balances:');
        addLog('  Ahmed: 1,000 → 800 tokens');
        addLog('  Sarah: 500 → 700 tokens');

        setData(prev => ({
          ...prev,
          lastTransferTx: txHash,
        }));
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            Transfer Successful
          </h3>

          {/* Visual */}
          <div className="bg-green-500/5 p-4 rounded-xl border border-green-500/20">
            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-2 bg-blue-500/20 rounded-full flex items-center justify-center text-white font-bold">AM</div>
                <p className="text-sm text-white">Ahmed</p>
                <p className="text-xs text-gray-400">800 tokens</p>
              </div>
              <div className="flex-1 mx-4 flex flex-col items-center">
                <div className="w-full h-0.5 bg-gradient-to-r from-blue-500 to-green-500" />
                <span className="mt-2 px-3 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                  200 tokens
                </span>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-2 bg-green-500/20 rounded-full flex items-center justify-center text-white font-bold">SJ</div>
                <p className="text-sm text-white">Sarah</p>
                <p className="text-xs text-gray-400">700 tokens</p>
              </div>
            </div>
          </div>

          {/* Compliance Checks */}
          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
            <h4 className="text-sm font-bold text-green-400 mb-3">All Checks Passed</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                'Sender KYC',
                'Sender Balance',
                'Recipient KYC',
                'Accreditation',
                'Jurisdiction',
                'Max Balance',
              ].map(check => (
                <div key={check} className="flex items-center gap-2 text-green-400">
                  <CheckCircle className="w-3 h-3" />
                  {check}
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
      completed: false,
    },

    // =========================================================================
    // F. CORPORATE ACTIONS (steps 17-21)
    // =========================================================================
    {
      id: 17,
      sectionId: 'corporate-actions',
      title: 'Distribute Yield',
      description: 'Compute and distribute proportional rental yield to holders',
      code: `const monthlyRent = 25000;  // AED 25,000/month
const holders = await client.tokens.getHolders(token.address);

for (const holder of holders) {
  const share = holder.balance / totalSupply;
  const payout = monthlyRent * share;

  await client.payouts.distribute({
    to: holder.address,
    amount: payout,
    currency: 'AED',
    type: 'RENTAL_YIELD',
  });
}`,
      action: async (addLog, setData, data) => {
        const balances = await sdkStore.getBalances(data.assetId);
        const offering = sdkStore.getOffering(data.assetId);
        const totalSupply = offering?.totalSupply || 10000;
        const totalYield = 25000;
        addLog(`💰 Yield distribution computed`);
        addLog(`  Monthly rent: AED ${totalYield.toLocaleString()}`);
        addLog(`  Total supply: ${totalSupply.toLocaleString()} tokens`);
        addLog('');
        for (const [pid, bal] of Object.entries(balances)) {
          const p = sdkStore.getParty(pid);
          const share = parseInt(bal) / totalSupply;
          const payout = totalYield * share;
          addLog(`  ${p?.name || pid.slice(0, 8)}: ${bal} tokens (${(share * 100).toFixed(1)}%) → AED ${payout.toLocaleString()}`);
        }
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Banknote className="w-5 h-5 text-green-400" />
            Rental Yield Distribution
          </h3>

          {/* Monthly Rent */}
          <div className="bg-green-500/10 p-4 rounded-xl border border-green-500/20 text-center">
            <p className="text-sm text-gray-400">Monthly Rental Income</p>
            <p className="text-3xl font-bold text-green-400">AED 25,000</p>
          </div>

          {/* Distribution */}
          <div className="space-y-2">
            {[
              { name: 'Ahmed Al Maktoum', tokens: 800, pct: 8, yield: 2000 },
              { name: 'Sarah Johnson', tokens: 700, pct: 7, yield: 1750 },
            ].map(d => (
              <div key={d.name} className="bg-white/5 p-3 rounded-xl border border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{d.name}</p>
                  <p className="text-xs text-gray-400">{d.tokens} tokens ({d.pct}%)</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-400">AED {d.yield.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 18,
      sectionId: 'corporate-actions',
      title: 'Update Valuation',
      description: 'Record new property valuation (+10% appreciation)',
      code: `const newNav = 60500000; // AED 60.5M (+10%)
await client.assets.updateNav(asset.id, newNav);
console.log('NAV updated:', newNav);`,
      action: async (addLog, setData, data) => {
        const existing = sdkStore.getAssetValuation(data.assetId);
        if (!existing) {
          sdkStore.updateAssetValuation(data.assetId, 55000000);
        }
        const result = sdkStore.updateAssetValuation(data.assetId, 60500000);
        setData(prev => ({ ...prev, latestValuation: '60500000' }));
        addLog(`✓ Valuation updated`);
        addLog(`  Previous: AED ${(result.previous / 1e6).toFixed(1)}M`);
        addLog(`  New: AED ${(result.current / 1e6).toFixed(1)}M`);
        addLog(`  Change: ${result.changePct >= 0 ? '+' : ''}${result.changePct.toFixed(1)}%`);
        const offering = sdkStore.getOffering(data.assetId);
        if (offering) {
          const newPrice = Math.round(result.current / offering.totalSupply);
          addLog(`  Token price: AED ${offering.pricePerToken.toLocaleString()} → AED ${newPrice.toLocaleString()}`);
        }
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'Marina Heights Tower - Unit 4201');
        const valuation = asset ? sdkStore.getAssetValuation(asset.id) : null;
        const history = valuation?.history || [];
        const current = history.length > 0 ? history[history.length - 1].value : 0;
        const previous = history.length > 1 ? history[history.length - 2].value : current;
        const changePct = previous > 0 ? ((current - previous) / previous) * 100 : 0;
        const chartData = history.map((h, i) => ({ date: h.date || `Point ${i}`, value: h.value / 1e5 }));
        return (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-amber-500/20">
            <h3 className="text-lg font-bold text-white mb-4">Valuation Update</h3>
            <NavHistoryChart data={chartData.length > 0 ? chartData : [{ date: '—', value: 0 }]} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="glass-card p-4 rounded-xl border border-white/10 text-center">
              <p className="text-xs text-gray-500">Previous NAV</p>
              <p className="text-xl font-bold text-white">AED {(previous / 1e6).toFixed(1)}M</p>
            </div>
            <div className="glass-card p-4 rounded-xl border border-green-500/20 text-center">
              <p className="text-xs text-gray-500">Updated NAV</p>
              <p className="text-xl font-bold text-green-400">AED {(current / 1e6).toFixed(1)}M</p>
              <p className="text-xs text-green-500 mt-1">{changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%</p>
            </div>
          </div>
        </div>
        );
      },
      completed: false,
    },
    {
      id: 19,
      sectionId: 'corporate-actions',
      title: 'Freeze Token',
      description: 'Freeze trading during regulatory review',
      code: `await client.tokens.freeze(token.address, {
  reason: 'REGULATORY_REVIEW',
  duration: '7_DAYS',
  authority: 'VARA',
});
// All transfers now blocked`,
      action: async (addLog, setData, data) => {
        addLog('🔒 Initiating token freeze...');
        await new Promise(r => setTimeout(r, 400));

        if (data.assetId) {
          await sdkStore.transition(data.assetId, LifecycleState.FROZEN, data.issuerId);
        }

        addLog('');
        addLog('⚠️ TOKEN FROZEN');
        addLog('');
        addLog('Details:');
        addLog('  Reason: Regulatory Review');
        addLog('  Authority: VARA (UAE)');
        addLog('  Duration: 7 days');
        addLog('');
        addLog('Impact:');
        addLog('  ✗ All transfers BLOCKED');
        addLog('  ✗ Minting BLOCKED');
        addLog('  ✓ Balance queries allowed');
        addLog('  ✓ Corporate actions (yield) allowed');

        setData(prev => ({ ...prev, tokenFrozen: true }));
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'Marina Heights Tower - Unit 4201');
        return (
          <div className="space-y-4">
            <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/30 text-center">
              <Lock className="w-8 h-8 text-red-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-red-400">TRADING FROZEN</p>
              <p className="text-xs text-gray-400 mt-1">All transfers halted — Regulatory review</p>
            </div>
            <div className="glass-card p-6 rounded-xl border border-red-500/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Token Lifecycle</h3>
                <span className="px-3 py-1 rounded-full text-xs font-bold border bg-red-500/20 text-red-400 border-red-500/30">
                  {asset?.state || 'FROZEN'}
                </span>
              </div>
              <div className="space-y-3">
                {['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'FROZEN'].map((state, i) => {
                  const done = true;
                  const isFrozen = state === 'FROZEN';
                  return (
                    <div key={state} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${isFrozen ? 'bg-red-500' : done ? 'bg-green-500' : 'bg-white/10'}`}>
                        {isFrozen ? '!' : '✓'}
                      </div>
                      <div className={`flex-1 h-px ${isFrozen ? 'bg-red-500/30' : 'bg-green-500/30'}`} />
                      <span className={`text-sm font-mono ${isFrozen ? 'text-red-400' : 'text-green-400'}`}>{state}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 20,
      sectionId: 'corporate-actions',
      title: 'Unfreeze & Resume',
      description: 'Restore ACTIVE state after regulatory clearance',
      code: `await client.tokens.unfreeze(token.address, {
  clearanceRef: 'VARA-2024-CLR-8821',
  authority: 'VARA',
});
// Trading resumed!`,
      action: async (addLog, setData, data) => {
        addLog('🔓 Processing unfreeze request...');
        await new Promise(r => setTimeout(r, 400));

        addLog('Verifying regulatory clearance...');
        await new Promise(r => setTimeout(r, 300));
        addLog('  ✓ Clearance document verified');
        addLog('  ✓ VARA approval confirmed');
        addLog('');

        if (data.assetId) {
          await sdkStore.transition(data.assetId, LifecycleState.ACTIVE, data.issuerId);
        }

        addLog('✅ TOKEN UNFROZEN');
        addLog('');
        addLog('Details:');
        addLog('  Clearance Ref: VARA-2024-CLR-8821');
        addLog('  Authority: VARA');
        addLog('  Effective: Immediate');
        addLog('');
        addLog('Status:');
        addLog('  ✓ All transfers ENABLED');
        addLog('  ✓ Minting ENABLED');
        addLog('  ✓ Full functionality restored');

        setData(prev => ({ ...prev, tokenFrozen: false }));
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'Marina Heights Tower - Unit 4201');
        return (
          <div className="space-y-4">
            <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/30 text-center">
              <Unlock className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-green-400">TRADING RESUMED</p>
              <p className="text-xs text-gray-400 mt-1">Regulatory review complete — All operations restored</p>
            </div>
            <div className="glass-card p-6 rounded-xl border border-green-500/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Token Lifecycle</h3>
                <span className="px-3 py-1 rounded-full text-xs font-bold border bg-green-500/20 text-green-400 border-green-500/30">
                  {asset?.state || 'ACTIVE'}
                </span>
              </div>
              <div className="space-y-3">
                {['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE'].map((state) => (
                  <div key={state} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold bg-green-500">✓</div>
                    <div className="flex-1 h-px bg-green-500/30" />
                    <span className="text-sm font-mono text-green-400">{state}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500 mb-2">Clearance Reference</p>
                <p className="text-sm font-mono text-white">VARA-2024-CLR-8821</p>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
  ],
};
