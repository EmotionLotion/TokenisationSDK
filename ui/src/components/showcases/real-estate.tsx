import { Building } from 'lucide-react';
import { PropertyMap, NavHistoryChart } from '@tokenisation/sdk/components';
import { sdkStore } from '../../store';
import { RightType, PartyType, PartyRole, LifecycleState, isKycVerified } from '../../types';
import type { ShowcaseConfig } from './types';

export const realEstateShowcase: ShowcaseConfig = {
  id: 'real-estate',
  name: 'Real Estate Tokenisation',
  shortName: 'Real Estate',
  description: 'Tokenize Dubai properties with full compliance lifecycle',
  color: 'amber',
  icon: <Building className="w-5 h-5" />,
  sections: [
    { id: 'partner-onboarding', label: 'A. Partner Onboarding' },
    { id: 'property-issuance', label: 'B. Property Issuance' },
    { id: 'primary-purchase', label: 'C. Primary Purchase' },
    { id: 'secondary-transfer', label: 'D. Secondary Transfer' },
    { id: 'corporate-actions', label: 'E. Corporate Actions' },
  ],
  steps: [
    // =========================================================================
    // A. Partner Onboarding (steps 1–3)
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
  maxInvestors: 500,
};`,
      action: async (addLog, _setData, data) => {
        sdkStore.verifyKyc(data.issuerId);
        addLog(`✓ KYC verified for Dubai Properties LLC`);
        addLog(`  Provider: Onfido`);
        addLog(`  AML rules: FATF, UAE-CBUAE`);
        addLog(`  Accreditation: QUALIFIED_INVESTOR`);
        addLog(`  Holding period: 365 days`);
        addLog(`  Max investors: 500`);
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
              { label: 'Max Investors', value: '500', status: true },
              { label: 'Jurisdiction Whitelist', value: 'AE, US, GB, SG', status: true },
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
    // B. Property Issuance (steps 4–7)
    // =========================================================================
    {
      id: 4,
      sectionId: 'property-issuance',
      title: 'Register Property',
      description: 'Register a Dubai Marina property as a tokenizable asset',
      code: `const asset = await client.assets.create({
  name: 'Burj Khalifa Penthouse',
  description: 'Premium residential unit',
  rightType: 'OWNERSHIP',
  jurisdiction: { countryCode: 'AE' },
  issuerId: org.id,
  metadata: {
    propertyType: 'RESIDENTIAL',
    area: 4200,
    valuation: '15000000',
    location: { lat: 25.1972, lng: 55.2744 }
  }
});`,
      action: async (addLog, setData, data) => {
        const asset = await sdkStore.createAsset({
          name: 'Burj Khalifa Penthouse',
          description: 'Premium residential unit in Downtown Dubai',
          rightType: RightType.OWNERSHIP,
          jurisdiction: { countryCode: 'AE' },
          issuerId: data.issuerId,
          metadata: { propertyType: 'RESIDENTIAL', area: 4200, valuation: '15000000' },
        });
        setData(prev => ({ ...prev, assetId: asset.id }));
        addLog(`✓ Asset created: ${asset.name}`);
        addLog(`  ID: ${asset.id}`);
        addLog(`  State: ${asset.state}`);
        addLog(`  Right: ${(asset as any).rightType}`);
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white">Burj Khalifa Penthouse</h3>
          <p className="text-sm text-gray-400">RESIDENTIAL — Downtown Dubai, UAE</p>
          <div className="h-[280px] rounded-xl overflow-hidden border border-white/10">
            <PropertyMap
              address="Burj Khalifa, Dubai"
              latitude={25.1972}
              longitude={55.2744}
              height="100%"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/5 p-3 rounded-lg text-center border border-white/5">
              <p className="text-xs text-gray-500">Valuation</p>
              <p className="text-lg font-bold text-white">$15M</p>
            </div>
            <div className="bg-white/5 p-3 rounded-lg text-center border border-white/5">
              <p className="text-xs text-gray-500">Area</p>
              <p className="text-lg font-bold text-white">4,200 sqft</p>
            </div>
            <div className="bg-white/5 p-3 rounded-lg text-center border border-white/5">
              <p className="text-xs text-gray-500">Type</p>
              <p className="text-lg font-bold text-white">Residential</p>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 5,
      sectionId: 'property-issuance',
      title: 'Create Offering',
      description: 'Configure token offering: supply, price, and investment limits',
      code: `const offering = {
  assetId: asset.id,
  totalSupply: 10000,
  pricePerToken: 1500, // USD
  minInvestment: 15000, // 10 tokens
  maxInvestment: 1500000, // 1000 tokens
  startDate: '2024-02-01',
  endDate: '2024-04-01',
  currency: 'USD',
};
console.log('Offering configured:', offering);`,
      action: async (addLog, _setData, data) => {
        const offering = sdkStore.createOffering(data.assetId, {
          totalSupply: 10000,
          pricePerToken: 1500,
          minInvestment: 15000,
          maxInvestment: 1500000,
          currency: 'USD',
          startDate: '2024-02-01',
          endDate: '2024-04-01',
        });
        addLog(`✓ Offering created: ${offering.id.slice(0, 8)}`);
        addLog(`  Total supply: ${offering.totalSupply.toLocaleString()} tokens`);
        addLog(`  Price: $${offering.pricePerToken.toLocaleString()} / token`);
        addLog(`  Min investment: $${offering.minInvestment.toLocaleString()} (${offering.minInvestment / offering.pricePerToken} tokens)`);
        addLog(`  Max investment: $${offering.maxInvestment.toLocaleString()} (${offering.maxInvestment / offering.pricePerToken} tokens)`);
        addLog(`  Offering window: ${offering.startDate} – ${offering.endDate}`);
        addLog(`  Currency: ${offering.currency}`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'Burj Khalifa Penthouse');
        const offering = asset ? sdkStore.getOffering(asset.id) : null;
        const pct = offering ? (offering.soldAmount / offering.totalSupply) * 100 : 0;
        return (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-amber-500/20">
            <h3 className="text-lg font-bold text-white mb-4">Token Offering</h3>
            <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-4 rounded-xl border border-amber-500/20 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Supply</span>
                <span className="text-sm font-bold text-amber-400">{offering ? `${offering.soldAmount.toLocaleString()} / ${offering.totalSupply.toLocaleString()}` : '—'}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-3">
                <div className="bg-amber-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Price / Token</p>
                <p className="text-lg font-bold text-white">${offering?.pricePerToken?.toLocaleString() || '—'}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Total Value</p>
                <p className="text-lg font-bold text-white">{offering ? `$${((offering.totalSupply * offering.pricePerToken) / 1e6).toFixed(0)}M` : '—'}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Min Investment</p>
                <p className="text-sm font-bold text-white">${offering?.minInvestment?.toLocaleString() || '—'}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Offering Window</p>
                <p className="text-sm font-bold text-white">{offering ? `${offering.startDate} – ${offering.endDate}` : '—'}</p>
              </div>
            </div>
          </div>
        </div>
        );
      },
      completed: false,
    },
    {
      id: 6,
      sectionId: 'property-issuance',
      title: 'Deploy Token',
      description: 'Transition asset through compliance checks to VERIFIED',
      code: `await client.assets.transition(
  asset.id, 'PENDING_VERIFICATION', org.id
);
await client.assets.transition(
  asset.id, 'VERIFIED', org.id
);
// Token contract deployed to Base L2`,
      action: async (addLog, _setData, data) => {
        const r1 = await sdkStore.transition(data.assetId, LifecycleState.PENDING_VERIFICATION, data.issuerId);
        addLog(`✓ → PENDING_VERIFICATION: ${r1.success ? 'OK' : r1.error}`);

        const r2 = await sdkStore.transition(data.assetId, LifecycleState.VERIFIED, data.issuerId);
        addLog(`✓ → VERIFIED: ${r2.success ? 'OK' : r2.error}`);

        const asset = sdkStore.getAsset(data.assetId);
        addLog(`  Current state: ${asset?.state}`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'Burj Khalifa Penthouse');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-amber-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Deployment Progress</h3>
              <div className="space-y-3">
                {['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED'].map((state, i) => {
                  const stateOrder = ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE'];
                  const currentIdx = stateOrder.indexOf(asset?.state || 'DRAFT');
                  const done = i <= currentIdx;
                  return (
                    <div key={state} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${done ? 'bg-green-500' : 'bg-white/10'}`}>{done ? '✓' : i + 1}</div>
                      <div className={`flex-1 h-px ${done ? 'bg-green-500/30' : 'bg-white/10'}`} />
                      <span className={`text-sm font-mono ${done ? 'text-green-400' : 'text-gray-600'}`}>{state}</span>
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
      id: 7,
      sectionId: 'property-issuance',
      title: 'Activate Offering',
      description: 'Transition asset to ACTIVE — offering is live',
      code: `await client.assets.transition(
  asset.id, 'ACTIVE', org.id
);
// Offering is now live!
// Token address: 0x7a3f...8e21`,
      action: async (addLog, _setData, data) => {
        const r = await sdkStore.transition(data.assetId, LifecycleState.ACTIVE, data.issuerId);
        addLog(`✓ → ACTIVE: ${r.success ? 'OK' : r.error}`);
        const asset = sdkStore.getAsset(data.assetId);
        addLog(`  Final state: ${asset?.state}`);
        addLog(`  Token deployed to Base L2`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'Burj Khalifa Penthouse');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-amber-500/20">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white">Token Lifecycle</h3>
                <span className="px-3 py-1 rounded-full text-xs font-bold border bg-green-500/20 text-green-400 border-green-500/30">
                  {asset?.state || 'ACTIVE'}
                </span>
              </div>
              <div className="space-y-3">
                {['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE'].map((state, i) => {
                  const stateOrder = ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE'];
                  const currentIdx = stateOrder.indexOf(asset?.state || 'DRAFT');
                  const done = i <= currentIdx;
                  return (
                    <div key={state} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${done ? 'bg-green-500' : 'bg-white/10'}`}>{done ? '✓' : i + 1}</div>
                      <div className={`flex-1 h-px ${done ? 'bg-green-500/30' : 'bg-white/10'}`} />
                      <span className={`text-sm font-mono ${done ? 'text-green-400' : 'text-gray-600'}`}>{state}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Token Address</p>
                <p className="text-sm font-mono text-amber-400">0x7a3f...8e21 (Base L2)</p>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // C. Primary Purchase (steps 8–11)
    // =========================================================================
    {
      id: 8,
      sectionId: 'primary-purchase',
      title: 'Onboard Investor',
      description: 'KYC verification and accreditation check for investor',
      code: `const investor = await client.parties.create({
  name: 'John Smith',
  type: 'INDIVIDUAL',
  roles: ['INVESTOR'],
  jurisdiction: 'US',
});
await client.parties.verifyKyc(investor.id);
// Status: VERIFIED (Accredited)`,
      action: async (addLog, setData) => {
        const investor = await sdkStore.createParty({
          name: 'John Smith',
          type: PartyType.INDIVIDUAL,
          roles: [PartyRole.INVESTOR],
          jurisdiction: 'US',
        });
        sdkStore.verifyKyc(investor.id);
        setData(prev => ({ ...prev, investorId: investor.id }));
        addLog(`✓ Created investor: John Smith`);
        addLog(`  Party ID: ${investor.id}`);
        addLog(`  KYC: VERIFIED`);
        addLog(`  Jurisdiction: US`);
        addLog(`  Accreditation: Qualified Investor`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const investor = parties.find(p => p.name === 'John Smith');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white font-bold text-xl">JS</div>
                <div>
                  <h3 className="text-lg font-bold text-white">{investor?.name || 'John Smith'}</h3>
                  <p className="text-sm text-gray-400">Individual Investor — US</p>
                </div>
                <div className="ml-auto px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">
                  KYC VERIFIED
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Party ID</p>
                  <p className="text-sm font-mono text-white">{investor?.id.slice(0, 12) || '—'}...</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Accreditation</p>
                  <p className="text-sm font-bold text-green-400">Qualified</p>
                </div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 9,
      sectionId: 'primary-purchase',
      title: 'Browse Offering',
      description: 'Investor views the property offering details',
      code: `const offering = await client.offerings.get(asset.id);
console.log('Property:', offering.name);
console.log('Price:', offering.pricePerToken);
console.log('Available:', offering.remainingSupply);
// Investor clicks "Buy"`,
      action: async (addLog, _setData, data) => {
        const asset = sdkStore.getAsset(data.assetId);
        const offering = sdkStore.getOffering(data.assetId);
        addLog(`✓ Offering loaded`);
        addLog(`  Property: ${asset?.name}`);
        addLog(`  State: ${asset?.state}`);
        addLog(`  Price: $${offering?.pricePerToken?.toLocaleString() || '—'} / token`);
        addLog(`  Available: ${offering ? (offering.totalSupply - offering.soldAmount).toLocaleString() : '—'} tokens`);
        addLog(`  Min purchase: ${offering ? offering.minInvestment / offering.pricePerToken : '—'} tokens ($${offering?.minInvestment?.toLocaleString() || '—'})`);
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-amber-500/20">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-amber-900/30 to-orange-900/20 flex items-center justify-center border border-white/5">
                <Building className="w-8 h-8 text-amber-400/60" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">Burj Khalifa Penthouse</h3>
                <p className="text-sm text-gray-400">Downtown Dubai, UAE</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-bold rounded border border-green-500/30">ACTIVE</span>
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs font-bold rounded border border-amber-500/30">OWNERSHIP</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Price / Token</p>
                <p className="text-lg font-bold text-white">$1,500</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Available</p>
                <p className="text-lg font-bold text-white">10,000</p>
              </div>
            </div>
            <button className="w-full py-3 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-colors">
              Buy Tokens
            </button>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 10,
      sectionId: 'primary-purchase',
      title: 'Purchase Shares',
      description: 'Mint 1,000 property tokens to the investor',
      code: `await client.assets.mint(
  asset.id,
  investor.id,
  '1000'
);
// 1,000 tokens @ $1,500 = $1,500,000
// Tx hash: 0x8b4c...f312`,
      action: async (addLog, _setData, data) => {
        const result = await sdkStore.mint(data.assetId, data.investorId, '1000');
        addLog(`✓ Mint result: ${result.success ? 'SUCCESS' : result.error}`);
        if (result.success) {
          sdkStore.updateOfferingSold(data.assetId, 1000);
          const offering = sdkStore.getOffering(data.assetId);
          addLog(`  Tokens minted: 1,000`);
          addLog(`  Cost: $${offering ? (1000 * offering.pricePerToken).toLocaleString() : '1,500,000'}`);
          addLog(`  Offering sold: ${offering?.soldAmount?.toLocaleString() || '—'} / ${offering?.totalSupply?.toLocaleString() || '—'}`);
          const balances = await sdkStore.getBalances(data.assetId);
          for (const [pid, bal] of Object.entries(balances)) {
            const p = sdkStore.getParty(pid);
            addLog(`  ${p?.name || pid.slice(0, 8)}: ${bal} tokens`);
          }
        }
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5 text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center border-2 border-green-500/30">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Purchase Confirmed</h3>
            <p className="text-sm text-gray-400 mb-4">1,000 tokens acquired</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Tokens</p>
                <p className="text-lg font-bold text-white">1,000</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Cost</p>
                <p className="text-lg font-bold text-white">$1.5M</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Ownership</p>
                <p className="text-lg font-bold text-amber-400">10%</p>
              </div>
            </div>
            <div className="mt-3 bg-white/5 p-2 rounded-lg border border-white/5">
              <p className="text-xs text-gray-500">Tx Hash</p>
              <p className="text-xs font-mono text-green-400">0x8b4c...f312</p>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 11,
      sectionId: 'primary-purchase',
      title: 'View Portfolio',
      description: 'Investor views their holdings and NAV history',
      code: `const balances = await client.assets.getBalances(
  asset.id
);
const nav = client.assets.getNavHistory(asset.id);
console.log('Holdings:', balances);`,
      action: async (addLog, _setData, data) => {
        const balances = await sdkStore.getBalances(data.assetId);
        addLog(`✓ Portfolio loaded`);
        for (const [partyId, balance] of Object.entries(balances)) {
          const party = sdkStore.getParty(partyId);
          addLog(`  ${party?.name || partyId.slice(0, 8)}: ${balance} tokens`);
        }
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-white/10">
            <h3 className="text-lg font-bold text-white mb-4">NAV History</h3>
            <NavHistoryChart
              data={[
                { date: '2023-01', value: 100 },
                { date: '2023-02', value: 102 },
                { date: '2023-03', value: 105 },
                { date: '2023-04', value: 104 },
                { date: '2023-05', value: 108 },
                { date: '2023-06', value: 115 },
              ]}
            />
          </div>
          <div className="glass-card p-6 rounded-xl border border-amber-500/20">
            <h3 className="text-sm font-bold text-white mb-3">Holdings</h3>
            <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-4 rounded-xl border border-amber-500/20">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-400">Burj Khalifa Penthouse</span>
                <span className="text-xs text-amber-400 font-mono">OWNERSHIP</span>
              </div>
              <p className="text-3xl font-bold text-white">1,000</p>
              <p className="text-xs text-gray-500 mt-1">tokens (10% ownership)</p>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },

    // =========================================================================
    // D. Secondary Transfer (steps 12–14)
    // =========================================================================
    {
      id: 12,
      sectionId: 'secondary-transfer',
      title: 'Onboard Buyer',
      description: 'KYC a second investor for secondary market transfer',
      code: `const buyer = await client.parties.create({
  name: 'Sara Ahmed',
  type: 'INDIVIDUAL',
  roles: ['INVESTOR'],
  jurisdiction: 'AE',
});
await client.parties.verifyKyc(buyer.id);`,
      action: async (addLog, setData) => {
        const buyer = await sdkStore.createParty({
          name: 'Sara Ahmed',
          type: PartyType.INDIVIDUAL,
          roles: [PartyRole.INVESTOR],
          jurisdiction: 'AE',
        });
        sdkStore.verifyKyc(buyer.id);
        setData(prev => ({ ...prev, buyerId: buyer.id }));
        addLog(`✓ Created buyer: Sara Ahmed`);
        addLog(`  Party ID: ${buyer.id}`);
        addLog(`  KYC: VERIFIED`);
        addLog(`  Jurisdiction: AE`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const john = parties.find(p => p.name === 'John Smith');
        const sara = parties.find(p => p.name === 'Sara Ahmed');
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-2">Verified Investors</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { name: 'John Smith', initials: 'JS', jurisdiction: 'US', party: john, gradient: 'from-green-400 to-emerald-600' },
                { name: 'Sara Ahmed', initials: 'SA', jurisdiction: 'AE', party: sara, gradient: 'from-amber-400 to-orange-600' },
              ].map(inv => (
                <div key={inv.name} className="glass-card p-4 rounded-xl border border-white/10">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${inv.gradient} flex items-center justify-center text-white text-sm font-bold`}>{inv.initials}</div>
                    <div>
                      <p className="text-sm font-bold text-white">{inv.name}</p>
                      <p className="text-xs text-gray-500">{inv.jurisdiction}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-bold rounded-full border border-green-500/30">
                    {isKycVerified(inv.party) ? 'VERIFIED' : 'PENDING'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 13,
      sectionId: 'secondary-transfer',
      title: 'Check Eligibility',
      description: 'Verify compliance checks for the secondary transfer',
      code: `const eligible = await client.compliance.check({
  assetId: asset.id,
  from: investor.id,
  to: buyer.id,
  amount: '200',
});
// KYC ✓, Jurisdiction ✓, Holding Period ✓`,
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
        const asset = assets.find(a => a.name === 'Burj Khalifa Penthouse');
        const parties = sdkStore.getParties();
        const buyer = parties.find(p => p.name === 'Sara Ahmed');
        const investor = parties.find(p => p.name === 'John Smith');
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
      id: 14,
      sectionId: 'secondary-transfer',
      title: 'Execute Transfer',
      description: 'Transfer 200 tokens from John to Sara',
      code: `await client.assets.transfer(
  asset.id,
  investor.id,  // from: John Smith
  buyer.id,      // to: Sara Ahmed
  '200'
);
// John: 800 tokens, Sara: 200 tokens`,
      action: async (addLog, _setData, data) => {
        const result = await sdkStore.transfer(data.assetId, data.investorId, data.buyerId, '200');
        addLog(`✓ Transfer: ${result.success ? 'SUCCESS' : result.error}`);
        const balances = await sdkStore.getBalances(data.assetId);
        addLog(`  Updated balances:`);
        for (const [pid, bal] of Object.entries(balances)) {
          const p = sdkStore.getParty(pid);
          addLog(`    ${p?.name || pid.slice(0, 8)}: ${bal} tokens`);
        }
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-amber-500/20">
            <h3 className="text-lg font-bold text-white mb-4">Secondary Transfer</h3>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-sm font-bold mb-2">JS</div>
                <p className="text-sm font-bold text-white">John Smith</p>
                <p className="text-xs text-gray-500">800 tokens</p>
              </div>
              <div className="flex flex-col items-center gap-1 text-xs text-gray-500">
                <span>200 →</span>
                <div className="w-12 h-px bg-amber-500/50" />
              </div>
              <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center text-white text-sm font-bold mb-2">SA</div>
                <p className="text-sm font-bold text-white">Sara Ahmed</p>
                <p className="text-xs text-gray-500">200 tokens</p>
              </div>
            </div>
            <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20 text-center">
              <span className="text-sm font-bold text-green-400">Transfer Complete</span>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },

    // =========================================================================
    // E. Corporate Actions (steps 15–18)
    // =========================================================================
    {
      id: 15,
      sectionId: 'corporate-actions',
      title: 'Distribute Yield',
      description: 'Compute and distribute proportional rental yield to holders',
      code: `const balances = await client.assets.getBalances(asset.id);
const totalYield = 150000; // $150k annual yield
for (const [holder, tokens] of balances) {
  const share = tokens / totalSupply;
  const payout = totalYield * share;
  console.log(holder, '→', payout);
}`,
      action: async (addLog, setData, data) => {
        const balances = await sdkStore.getBalances(data.assetId);
        const offering = sdkStore.getOffering(data.assetId);
        const totalSupply = offering?.totalSupply || 10000;
        const totalYield = 150000;
        addLog(`✓ Yield distribution computed`);
        addLog(`  Total annual yield: $${totalYield.toLocaleString()}`);
        addLog(`  Total supply: ${totalSupply.toLocaleString()} tokens`);
        const yieldEntries: string[] = [];
        for (const [pid, bal] of Object.entries(balances)) {
          const p = sdkStore.getParty(pid);
          const share = parseInt(bal) / totalSupply;
          const payout = totalYield * share;
          addLog(`  ${p?.name || pid.slice(0, 8)}: ${bal} tokens (${(share * 100).toFixed(1)}%) → $${payout.toLocaleString()}`);
          yieldEntries.push(`${p?.name || pid.slice(0, 8)}:${bal}:${payout}`);
        }
        setData(prev => ({ ...prev, yieldEntries: yieldEntries.join('|') }));
      },
      render: () => {
        const parties = sdkStore.getParties();
        const investors = parties.filter(p => p.roles.includes(PartyRole.INVESTOR) && isKycVerified(p));
        const holdings: { name: string; initials: string; tokens: number; pct: number; yield: number }[] = [
          { name: 'John Smith', initials: 'JS', tokens: 800, pct: 8, yield: 12000 },
          { name: 'Sara Ahmed', initials: 'SA', tokens: 200, pct: 2, yield: 3000 },
        ];
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-amber-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Yield Distribution</h3>
              <div className="bg-amber-500/10 p-3 rounded-lg border border-amber-500/20 text-center mb-4">
                <p className="text-xs text-gray-500">Annual Yield Pool</p>
                <p className="text-2xl font-bold text-amber-400">$150,000</p>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2 text-xs text-gray-500 px-3">
                  <span>Holder</span><span className="text-right">Tokens</span><span className="text-right">Share</span><span className="text-right">Yield</span>
                </div>
                {holdings.map(h => (
                  <div key={h.name} className="grid grid-cols-4 gap-2 p-3 bg-white/5 rounded-lg border border-white/5 items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-[9px] font-bold">{h.initials}</div>
                      <span className="text-sm text-white">{h.name}</span>
                    </div>
                    <span className="text-sm text-white text-right">{h.tokens.toLocaleString()}</span>
                    <span className="text-sm text-gray-400 text-right">{h.pct}%</span>
                    <span className="text-sm font-bold text-green-400 text-right">${h.yield.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 16,
      sectionId: 'corporate-actions',
      title: 'Update Valuation',
      description: 'Record new property valuation (+10% appreciation)',
      code: `const newNav = 16500000; // $16.5M (+10%)
await client.assets.updateNav(asset.id, newNav);
console.log('NAV updated:', newNav);`,
      action: async (addLog, setData, data) => {
        // Seed initial valuation if not set
        const existing = sdkStore.getAssetValuation(data.assetId);
        if (!existing) {
          sdkStore.updateAssetValuation(data.assetId, 15000000);
        }
        const result = sdkStore.updateAssetValuation(data.assetId, 16500000);
        setData(prev => ({ ...prev, latestValuation: '16500000' }));
        addLog(`✓ Valuation updated`);
        addLog(`  Previous: $${result.previous.toLocaleString()}`);
        addLog(`  New: $${result.current.toLocaleString()}`);
        addLog(`  Change: ${result.changePct >= 0 ? '+' : ''}${result.changePct.toFixed(1)}%`);
        const offering = sdkStore.getOffering(data.assetId);
        if (offering) {
          const newPrice = Math.round(result.current / offering.totalSupply);
          addLog(`  Token price: $${offering.pricePerToken.toLocaleString()} → $${newPrice.toLocaleString()}`);
        }
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'Burj Khalifa Penthouse');
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
              <p className="text-xl font-bold text-white">${(previous / 1e6).toFixed(1)}M</p>
            </div>
            <div className="glass-card p-4 rounded-xl border border-green-500/20 text-center">
              <p className="text-xs text-gray-500">Updated NAV</p>
              <p className="text-xl font-bold text-green-400">${(current / 1e6).toFixed(1)}M</p>
              <p className="text-xs text-green-500 mt-1">{changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%</p>
            </div>
          </div>
        </div>
        );
      },
      completed: false,
    },
    {
      id: 17,
      sectionId: 'corporate-actions',
      title: 'Freeze Token',
      description: 'Freeze trading during regulatory review',
      code: `await client.assets.transition(
  asset.id, 'FROZEN', org.id
);
// Trading halted for regulatory review`,
      action: async (addLog, _setData, data) => {
        const r = await sdkStore.transition(data.assetId, LifecycleState.FROZEN, data.issuerId);
        addLog(`✓ → FROZEN: ${r.success ? 'OK' : r.error}`);
        const asset = sdkStore.getAsset(data.assetId);
        addLog(`  State: ${asset?.state}`);
        addLog(`  All transfers halted`);
        addLog(`  Reason: Regulatory review`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'Burj Khalifa Penthouse');
        return (
          <div className="space-y-4">
            <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/30 text-center">
              <p className="text-sm font-bold text-red-400">⚠ TRADING FROZEN</p>
              <p className="text-xs text-gray-400 mt-1">All transfers halted — Regulatory review in progress</p>
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
      id: 18,
      sectionId: 'corporate-actions',
      title: 'Unfreeze & Resume',
      description: 'Restore ACTIVE state after regulatory clearance',
      code: `await client.assets.transition(
  asset.id, 'ACTIVE', org.id
);
// Trading resumed!`,
      action: async (addLog, _setData, data) => {
        const r = await sdkStore.transition(data.assetId, LifecycleState.ACTIVE, data.issuerId);
        addLog(`✓ → ACTIVE: ${r.success ? 'OK' : r.error}`);
        const asset = sdkStore.getAsset(data.assetId);
        addLog(`  State: ${asset?.state}`);
        addLog(`  Trading resumed`);
        addLog(`  Regulatory clearance: APPROVED`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'Burj Khalifa Penthouse');
        return (
          <div className="space-y-4">
            <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/30 text-center">
              <p className="text-sm font-bold text-green-400">✓ TRADING RESUMED</p>
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
                {['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE'].map((state, i) => (
                  <div key={state} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold bg-green-500">✓</div>
                    <div className="flex-1 h-px bg-green-500/30" />
                    <span className="text-sm font-mono text-green-400">{state}</span>
                  </div>
                ))}
              </div>
              {(() => {
                const parties = sdkStore.getParties();
                const investors = parties.filter(p => p.roles.includes(PartyRole.INVESTOR) && isKycVerified(p));
                return (
                  <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/5">
                    <p className="text-xs text-gray-500 mb-2">Active Holders</p>
                    {investors.map(inv => (
                      <div key={inv.id} className="flex items-center justify-between py-1">
                        <span className="text-sm text-white">{inv.name}</span>
                        <span className="text-xs text-green-400">VERIFIED</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      },
      completed: false,
    },
  ],
};
