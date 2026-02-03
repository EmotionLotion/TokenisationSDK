import { Car } from 'lucide-react';
import { RentalCalendar } from '@tokenisation/sdk/components';
import { sdkStore } from '../../store';
import { RightType, PartyType, PartyRole, LifecycleState, isKycVerified } from '../../types';
import type { ShowcaseConfig } from './types';

export const carRentalShowcase: ShowcaseConfig = {
  id: 'car-rental',
  name: 'Car Rental Tokenisation',
  shortName: 'Car Rental',
  description: 'Tokenized vehicle access with smart contract rentals',
  color: 'red',
  icon: <Car className="w-5 h-5" />,
  sections: [
    { id: 'fleet-onboarding', label: 'A. Fleet Onboarding' },
    { id: 'vehicle-issuance', label: 'B. Vehicle Issuance' },
    { id: 'rental-operations', label: 'C. Rental Operations' },
    { id: 'transfers-market', label: 'D. Transfers & Market' },
    { id: 'settlement', label: 'E. Settlement & Returns' },
  ],
  steps: [
    // =========================================================================
    // A. Fleet Onboarding (steps 1–3)
    // =========================================================================
    {
      id: 1,
      sectionId: 'fleet-onboarding',
      title: 'Register Fleet Operator',
      description: 'Register the fleet management organization with ISSUER and VERIFIER roles',
      code: `const fleet = await client.parties.create({
  name: 'LuxeDrive Fleet',
  type: 'ORGANIZATION',
  roles: ['ISSUER', 'VERIFIER'],
  jurisdiction: 'AE',
  metadata: {
    license: 'RTA-2024-FL-4471',
    registeredName: 'LuxeDrive Fleet Management LLC',
  }
});`,
      action: async (addLog, setData) => {
        const fleet = await sdkStore.createParty({
          name: 'LuxeDrive Fleet',
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
          jurisdiction: 'AE',
        });
        setData(prev => ({ ...prev, fleetId: fleet.id }));
        addLog(`✓ Created organization: LuxeDrive Fleet`);
        addLog(`  Party ID: ${fleet.id}`);
        addLog(`  Type: ORGANIZATION`);
        addLog(`  Roles: ISSUER, VERIFIER`);
        addLog(`  Jurisdiction: AE`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const fleet = parties.find(p => p.name === 'LuxeDrive Fleet');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-red-500/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-400 to-rose-600 flex items-center justify-center text-white font-bold text-lg">LD</div>
                <div>
                  <h3 className="text-lg font-bold text-white">LuxeDrive Fleet</h3>
                  <p className="text-sm text-gray-400">Licensed Fleet Operator</p>
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
                  <p className="text-sm font-mono text-white">RTA-2024-FL-4471</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Roles</p>
                  <p className="text-sm font-bold text-red-400">ISSUER, VERIFIER</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Party ID</p>
                  <p className="text-sm font-mono text-white">{fleet?.id.slice(0, 12) || '—'}...</p>
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
      sectionId: 'fleet-onboarding',
      title: 'Configure Compliance',
      description: 'Set up KYC provider, license checks, and rental eligibility rules',
      code: `await client.parties.verifyKyc(fleet.id);

// Configure compliance rules
const compliance = {
  kycProvider: 'Onfido',
  licenseCheck: 'Valid driving license required',
  minimumAge: 21,
  insuranceRequired: true,
  securityDeposit: 2500, // USD
  jurisdictionWhitelist: ['AE', 'US', 'GB', 'SG'],
};`,
      action: async (addLog, _setData, data) => {
        sdkStore.verifyKyc(data.fleetId);
        addLog(`✓ KYC verified for LuxeDrive Fleet`);
        addLog(`  Provider: Onfido`);
        addLog(`  License check: Valid driving license required`);
        addLog(`  Minimum age: 21+`);
        addLog(`  Insurance: Required`);
        addLog(`  Security deposit: $2,500`);
        addLog(`  Jurisdiction whitelist: AE, US, GB, SG`);
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white mb-2">Compliance Configuration</h3>
          <div className="space-y-2">
            {[
              { label: 'KYC Provider', value: 'Onfido', status: true },
              { label: 'Driving License Check', value: 'Valid & Active', status: true },
              { label: 'Minimum Age', value: '21+', status: true },
              { label: 'Insurance', value: 'Comprehensive Required', status: true },
              { label: 'Security Deposit', value: '$2,500', status: true },
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
      sectionId: 'fleet-onboarding',
      title: 'Setup Fleet Wallet',
      description: 'Generate multisig wallet for the fleet management organization',
      code: `const wallet = await client.wallets.create({
  owner: fleet.id,
  chain: 'BASE',
  type: 'MULTISIG',
  signers: 3,
  threshold: 2,
});
// Wallet funded with gas credits`,
      action: async (addLog, setData, data) => {
        const wallet = sdkStore.createWallet(data.fleetId, {
          chain: 'BASE',
          type: 'MULTISIG',
          threshold: 2,
          signers: 3,
        });
        setData(prev => ({ ...prev, walletAddress: wallet.address }));
        addLog(`✓ Wallet created for fleet operator`);
        addLog(`  Address: ${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}`);
        addLog(`  Chain: ${wallet.chain} (L2)`);
        addLog(`  Type: ${wallet.threshold}-of-${wallet.signers} ${wallet.type}`);
        addLog(`  Gas balance: ${wallet.balance} ETH`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const fleet = parties.find(p => p.name === 'LuxeDrive Fleet');
        const wallet = fleet ? sdkStore.getWallet(fleet.id) : null;
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-red-500/20 bg-gradient-to-br from-red-900/10 to-rose-900/5">
              <h3 className="text-lg font-bold text-white mb-4">Fleet Wallet</h3>
              <div className="bg-black/30 p-4 rounded-xl border border-white/10 mb-4 font-mono text-sm">
                <p className="text-gray-500 text-xs mb-1">Address</p>
                <p className="text-red-400">{wallet ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}` : '—'}</p>
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
    // B. Vehicle Issuance (steps 4–6)
    // =========================================================================
    {
      id: 4,
      sectionId: 'vehicle-issuance',
      title: 'Register Vehicle Asset',
      description: 'Register Tesla Model S Plaid as a tokenizable fleet vehicle',
      code: `const vehicle = await client.assets.create({
  name: 'Tesla Model S Plaid',
  description: 'Electric performance sedan',
  rightType: 'ACCESS',
  jurisdiction: { countryCode: 'AE' },
  issuerId: fleet.id,
  metadata: {
    type: 'ELECTRIC',
    pricePerDay: 250,
    range: '396 mi',
    acceleration: '1.99s 0-60',
    topSpeed: '200 mph',
  }
});`,
      action: async (addLog, setData, data) => {
        const vehicle = await sdkStore.createAsset({
          name: 'Tesla Model S Plaid',
          description: 'Electric performance sedan',
          rightType: RightType.ACCESS,
          jurisdiction: { countryCode: 'AE' },
          issuerId: data.fleetId,
          metadata: { type: 'ELECTRIC', pricePerDay: 250, range: '396 mi' },
        });
        setData(prev => ({ ...prev, vehicleId: vehicle.id }));
        addLog(`✓ Asset created: ${vehicle.name}`);
        addLog(`  ID: ${vehicle.id}`);
        addLog(`  State: ${vehicle.state}`);
        addLog(`  Right: ${(vehicle as any).rightType}`);
        addLog(`  Type: ELECTRIC`);
        addLog(`  Price: $250 / day`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const vehicle = assets.find(a => a.name === 'Tesla Model S Plaid');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-red-500/20">
              <div className="w-full h-48 bg-gradient-to-br from-red-900/20 to-gray-900 rounded-xl mb-4 flex items-center justify-center border border-white/5">
                <Car className="w-20 h-20 text-red-400/50" />
              </div>
              <h3 className="text-xl font-bold text-white">Tesla Model S Plaid</h3>
              <p className="text-xs text-gray-500 font-mono mt-1">{vehicle?.id || '—'}</p>
              <div className="flex items-center gap-2 mt-2 mb-4">
                <span className="text-2xl font-bold text-red-400">$250</span>
                <span className="text-sm text-gray-500">/ day</span>
                <span className="ml-auto px-2 py-1 bg-white/5 rounded text-xs text-gray-400">{vehicle?.state || 'DRAFT'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[['Range', '396 mi'], ['0-60', '1.99s'], ['Top', '200mph']].map(([l, v]) => (
                  <div key={l} className="bg-white/5 p-2 rounded-lg text-center border border-white/5">
                    <p className="text-xs text-gray-500">{l}</p>
                    <p className="text-sm font-bold text-white">{v}</p>
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
      id: 5,
      sectionId: 'vehicle-issuance',
      title: 'Create Rental Offering',
      description: 'Configure rental offering: 365 day-tokens at $250/day',
      code: `const offering = {
  assetId: vehicle.id,
  totalSupply: 365,     // day-tokens
  pricePerToken: 250,   // USD per day
  minInvestment: 250,   // 1 day minimum
  maxInvestment: 7500,  // 30 days maximum
  startDate: '2024-03-01',
  endDate: '2025-02-28',
  currency: 'USD',
};
console.log('Offering configured:', offering);`,
      action: async (addLog, _setData, data) => {
        const offering = sdkStore.createOffering(data.vehicleId, {
          totalSupply: 365,
          pricePerToken: 250,
          minInvestment: 250,
          maxInvestment: 7500,
          currency: 'USD',
          startDate: '2024-03-01',
          endDate: '2025-02-28',
        });
        addLog(`✓ Offering created: ${offering.id.slice(0, 8)}`);
        addLog(`  Total supply: ${offering.totalSupply} day-tokens`);
        addLog(`  Price: $${offering.pricePerToken} / day-token`);
        addLog(`  Min rental: $${offering.minInvestment} (${offering.minInvestment / offering.pricePerToken} day)`);
        addLog(`  Max rental: $${offering.maxInvestment.toLocaleString()} (${offering.maxInvestment / offering.pricePerToken} days)`);
        addLog(`  Availability: ${offering.startDate} – ${offering.endDate}`);
        addLog(`  Currency: ${offering.currency}`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const vehicle = assets.find(a => a.name === 'Tesla Model S Plaid');
        const offering = vehicle ? sdkStore.getOffering(vehicle.id) : null;
        const pct = offering ? (offering.soldAmount / offering.totalSupply) * 100 : 0;
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-red-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Rental Offering</h3>
              <div className="bg-gradient-to-r from-red-500/10 to-rose-500/10 p-4 rounded-xl border border-red-500/20 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Availability</span>
                  <span className="text-sm font-bold text-red-400">{offering ? `${offering.soldAmount} / ${offering.totalSupply} days booked` : '—'}</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-3">
                  <div className="bg-red-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Price / Day</p>
                  <p className="text-lg font-bold text-white">${offering?.pricePerToken?.toLocaleString() || '—'}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Annual Revenue</p>
                  <p className="text-lg font-bold text-white">{offering ? `$${((offering.totalSupply * offering.pricePerToken) / 1e3).toFixed(1)}K` : '—'}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Min Rental</p>
                  <p className="text-sm font-bold text-white">1 day ($250)</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Availability Window</p>
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
      sectionId: 'vehicle-issuance',
      title: 'Deploy Vehicle Token',
      description: 'Transition vehicle through compliance to ACTIVE — token deployed on-chain',
      code: `await client.assets.transition(
  vehicle.id, 'PENDING_VERIFICATION', fleet.id
);
await client.assets.transition(
  vehicle.id, 'VERIFIED', fleet.id
);
await client.assets.transition(
  vehicle.id, 'ACTIVE', fleet.id
);
// Vehicle token deployed to Base L2`,
      action: async (addLog, _setData, data) => {
        const r1 = await sdkStore.transition(data.vehicleId, LifecycleState.PENDING_VERIFICATION, data.fleetId);
        addLog(`✓ → PENDING_VERIFICATION: ${r1.success ? 'OK' : r1.error}`);

        const r2 = await sdkStore.transition(data.vehicleId, LifecycleState.VERIFIED, data.fleetId);
        addLog(`✓ → VERIFIED: ${r2.success ? 'OK' : r2.error}`);

        const r3 = await sdkStore.transition(data.vehicleId, LifecycleState.ACTIVE, data.fleetId);
        addLog(`✓ → ACTIVE: ${r3.success ? 'OK' : r3.error}`);

        const asset = sdkStore.getAsset(data.vehicleId);
        addLog(`  Current state: ${asset?.state}`);
        addLog(`  Token deployed to Base L2`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const vehicle = assets.find(a => a.name === 'Tesla Model S Plaid');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-red-500/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Deployment Progress</h3>
                <span className="px-3 py-1 rounded-full text-xs font-bold border bg-green-500/20 text-green-400 border-green-500/30">
                  {vehicle?.state || 'ACTIVE'}
                </span>
              </div>
              <div className="space-y-3">
                {['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE'].map((state, i) => {
                  const stateOrder = ['DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE'];
                  const currentIdx = stateOrder.indexOf(vehicle?.state || 'DRAFT');
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
            <div className="glass-card p-6 rounded-xl border border-white/10">
              <h3 className="text-sm font-bold text-white mb-3">Select Rental Dates</h3>
              <RentalCalendar
                blockedDates={[
                  new Date(new Date().setDate(new Date().getDate() + 5)),
                  new Date(new Date().setDate(new Date().getDate() + 6)),
                ]}
                onSelect={() => {}}
              />
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // C. Rental Operations (steps 7–10)
    // =========================================================================
    {
      id: 7,
      sectionId: 'rental-operations',
      title: 'Onboard Renter',
      description: 'KYC verification and license check for the renter',
      code: `const renter = await client.parties.create({
  name: 'Carlos Rivera',
  type: 'INDIVIDUAL',
  roles: ['INVESTOR'],
  jurisdiction: 'AE',
});
await client.parties.verifyKyc(renter.id);
// Status: VERIFIED (License validated)`,
      action: async (addLog, setData) => {
        const renter = await sdkStore.createParty({
          name: 'Carlos Rivera',
          type: PartyType.INDIVIDUAL,
          roles: [PartyRole.INVESTOR],
          jurisdiction: 'AE',
        });
        sdkStore.verifyKyc(renter.id);
        setData(prev => ({ ...prev, renterId: renter.id }));
        addLog(`✓ Created renter: Carlos Rivera`);
        addLog(`  Party ID: ${renter.id}`);
        addLog(`  KYC: VERIFIED`);
        addLog(`  Jurisdiction: AE`);
        addLog(`  License: Valid (UAE)`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const renter = parties.find(p => p.name === 'Carlos Rivera');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-400 to-orange-600 flex items-center justify-center text-white font-bold text-xl">CR</div>
                <div>
                  <h3 className="text-lg font-bold text-white">{renter?.name || 'Carlos Rivera'}</h3>
                  <p className="text-sm text-gray-400">Renter — AE</p>
                </div>
                <div className="ml-auto px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">
                  KYC VERIFIED
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Party ID</p>
                  <p className="text-sm font-mono text-white">{renter?.id.slice(0, 12) || '—'}...</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">License Status</p>
                  <p className="text-sm font-bold text-green-400">Valid</p>
                </div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 8,
      sectionId: 'rental-operations',
      title: 'Setup Renter Wallet',
      description: 'Create EOA wallet for renter and whitelist it for rental access',
      code: `const wallet = await client.wallets.create({
  owner: renter.id,
  chain: 'BASE',
  type: 'EOA',
});
await client.wallets.whitelist(wallet.address);
const whitelisted = client.wallets.isWhitelisted(
  wallet.address
);
console.log('Whitelisted:', whitelisted); // true`,
      action: async (addLog, setData, data) => {
        const wallet = sdkStore.createWallet(data.renterId, {
          chain: 'BASE',
          type: 'EOA',
        });
        sdkStore.whitelistWallet(wallet.address);
        const whitelisted = sdkStore.isWhitelisted(wallet.address);
        setData(prev => ({ ...prev, renterWalletAddress: wallet.address }));
        addLog(`✓ Wallet created for renter`);
        addLog(`  Address: ${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}`);
        addLog(`  Chain: ${wallet.chain} (L2)`);
        addLog(`  Type: ${wallet.type}`);
        addLog(`  Whitelisted: ${whitelisted}`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const renter = parties.find(p => p.name === 'Carlos Rivera');
        const wallet = renter ? sdkStore.getWallet(renter.id) : null;
        const whitelisted = wallet ? sdkStore.isWhitelisted(wallet.address) : false;
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-red-500/20 bg-gradient-to-br from-red-900/10 to-rose-900/5">
              <h3 className="text-lg font-bold text-white mb-4">Renter Wallet</h3>
              <div className="bg-black/30 p-4 rounded-xl border border-white/10 mb-4 font-mono text-sm">
                <p className="text-gray-500 text-xs mb-1">Address</p>
                <p className="text-red-400">{wallet ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}` : '—'}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Chain</p>
                  <p className="text-sm font-bold text-white">Base (L2)</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Type</p>
                  <p className="text-sm font-bold text-white">{wallet?.type || 'EOA'}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Whitelisted</p>
                  <p className={`text-sm font-bold ${whitelisted ? 'text-green-400' : 'text-gray-500'}`}>{whitelisted ? 'YES' : 'NO'}</p>
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
      sectionId: 'rental-operations',
      title: 'Compliance Check',
      description: 'Verify compliance for minting rental token to renter',
      code: `const eligible = await client.compliance.check({
  assetId: vehicle.id,
  from: fleet.id,
  to: renter.id,
  amount: '1',
});
// KYC ✓, Jurisdiction ✓, Asset Active ✓`,
      action: async (addLog, setData, data) => {
        const result = sdkStore.checkTransferCompliance(data.vehicleId, data.fleetId, data.renterId, '1');
        setData(prev => ({ ...prev, complianceResult: JSON.stringify(result) }));
        addLog(`✓ Compliance check: ${result.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
        for (const check of result.checks) {
          addLog(`  ${check.name}: ${check.passed ? '✓' : '✗'} (${check.detail})`);
        }
      },
      render: (_data) => {
        const assets = sdkStore.getAssets();
        const vehicle = assets.find(a => a.name === 'Tesla Model S Plaid');
        const parties = sdkStore.getParties();
        const fleet = parties.find(p => p.name === 'LuxeDrive Fleet');
        const renter = parties.find(p => p.name === 'Carlos Rivera');
        const result = vehicle && fleet && renter
          ? sdkStore.checkTransferCompliance(vehicle.id, fleet.id, renter.id, '1')
          : null;
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-2">Rental Eligibility</h3>
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
                {result?.eligible ? 'All checks passed — Rental eligible' : 'Rental not eligible'}
              </span>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 10,
      sectionId: 'rental-operations',
      title: 'Mint Rental Token',
      description: 'Mint 1 access token to renter — vehicle rental is now active',
      code: `await client.assets.mint(
  vehicle.id,
  renter.id,
  '1' // 1 day-token = 1 rental access
);
// Update offering availability
await client.offerings.updateSold(vehicle.id, 1);
// Trigger AHOY reward
ahoy.action('CAR_RENTED', 'CONNECT');`,
      action: async (addLog, _setData, data) => {
        const result = await sdkStore.mint(data.vehicleId, data.renterId, '1');
        addLog(`✓ Mint result: ${result.success ? 'SUCCESS' : result.error}`);
        if (result.success) {
          sdkStore.updateOfferingSold(data.vehicleId, 1);
          const offering = sdkStore.getOffering(data.vehicleId);
          addLog(`  Tokens minted: 1 (access token)`);
          addLog(`  Cost: $${offering?.pricePerToken || 250}`);
          addLog(`  Days booked: ${offering?.soldAmount || 1} / ${offering?.totalSupply || 365}`);
          const balances = await sdkStore.getBalances(data.vehicleId);
          for (const [pid, bal] of Object.entries(balances)) {
            const p = sdkStore.getParty(pid);
            addLog(`  ${p?.name || pid.slice(0, 8)}: ${bal} token(s)`);
          }
          const ahoy = sdkStore.simulateAhoyAction('CAR_RENTED', 'CONNECT');
          addLog(`  AHOY: +${ahoy.points} (balance: ${ahoy.newBalance})`);
        }
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const vehicle = assets.find(a => a.name === 'Tesla Model S Plaid');
        const ahoy = sdkStore.getAhoyState();
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Active Rental</h3>
                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold animate-pulse border border-green-500/30">{vehicle?.state || 'ACTIVE'}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Vehicle</p>
                  <p className="text-sm font-bold text-white">Tesla Model S Plaid</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Renter</p>
                  <p className="text-sm font-bold text-white">Carlos Rivera</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Token Balance</p>
                  <p className="text-sm font-bold text-red-400">1 ACCESS</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">AHOY Balance</p>
                  <p className="text-sm font-bold text-amber-400">{ahoy.balance}</p>
                </div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // D. Transfers & Market (steps 11–12)
    // =========================================================================
    {
      id: 11,
      sectionId: 'transfers-market',
      title: 'Transfer Rental',
      description: 'Transfer rental access from Carlos to a new renter Amira',
      code: `const amira = await client.parties.create({
  name: 'Amira Khalil',
  type: 'INDIVIDUAL',
  roles: ['INVESTOR'],
  jurisdiction: 'AE',
});
await client.parties.verifyKyc(amira.id);

// Compliance check before transfer
const eligible = await client.compliance.check({
  assetId: vehicle.id,
  from: renter.id,
  to: amira.id,
  amount: '1',
});

// Execute transfer
await client.assets.transfer(
  vehicle.id,
  renter.id,   // from: Carlos Rivera
  amira.id,    // to: Amira Khalil
  '1'
);`,
      action: async (addLog, setData, data) => {
        const amira = await sdkStore.createParty({
          name: 'Amira Khalil',
          type: PartyType.INDIVIDUAL,
          roles: [PartyRole.INVESTOR],
          jurisdiction: 'AE',
        });
        sdkStore.verifyKyc(amira.id);
        setData(prev => ({ ...prev, amiraId: amira.id }));
        addLog(`✓ Created renter: Amira Khalil`);
        addLog(`  Party ID: ${amira.id}`);
        addLog(`  KYC: VERIFIED`);

        const compliance = sdkStore.checkTransferCompliance(data.vehicleId, data.renterId, amira.id, '1');
        addLog(`✓ Compliance check: ${compliance.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
        for (const check of compliance.checks) {
          addLog(`  ${check.name}: ${check.passed ? '✓' : '✗'}`);
        }

        const result = await sdkStore.transfer(data.vehicleId, data.renterId, amira.id, '1');
        addLog(`✓ Transfer: ${result.success ? 'SUCCESS' : result.error}`);
        const balances = await sdkStore.getBalances(data.vehicleId);
        addLog(`  Updated balances:`);
        for (const [pid, bal] of Object.entries(balances)) {
          const p = sdkStore.getParty(pid);
          addLog(`    ${p?.name || pid.slice(0, 8)}: ${bal} token(s)`);
        }
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-red-500/20">
            <h3 className="text-lg font-bold text-white mb-4">Rental Transfer</h3>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-red-400 to-orange-600 flex items-center justify-center text-white text-sm font-bold mb-2">CR</div>
                <p className="text-sm font-bold text-white">Carlos Rivera</p>
                <p className="text-xs text-gray-500">0 tokens</p>
              </div>
              <div className="flex flex-col items-center gap-1 text-xs text-gray-500">
                <span>1 →</span>
                <div className="w-12 h-px bg-red-500/50" />
              </div>
              <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-rose-400 to-pink-600 flex items-center justify-center text-white text-sm font-bold mb-2">AK</div>
                <p className="text-sm font-bold text-white">Amira Khalil</p>
                <p className="text-xs text-gray-500">1 token</p>
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
    {
      id: 12,
      sectionId: 'transfers-market',
      title: 'Oracle Update',
      description: 'Update vehicle telemetry via oracle and adjust asset valuation',
      code: `// Oracle telemetry update
await client.oracle.update(vehicle.id, {
  mileage: 12450,
  fuelLevel: 82,
  gpsLat: 25.2048,
  gpsLng: 55.2708,
  condition: 'EXCELLENT',
  lastService: '2024-01-15',
});

// Update asset valuation with depreciation
await client.assets.updateNav(vehicle.id, 85000);
// Previous: $95,000 → Current: $85,000 (-10.5%)`,
      action: async (addLog, setData, data) => {
        sdkStore.triggerOracleUpdate(data.vehicleId, {
          mileage: 12450,
          fuelLevel: 82,
          gpsLat: 25.2048,
          gpsLng: 55.2708,
          condition: 'EXCELLENT',
          lastService: '2024-01-15',
        });
        addLog(`✓ Oracle update received`);
        addLog(`  Mileage: 12,450 mi`);
        addLog(`  Fuel level: 82%`);
        addLog(`  GPS: 25.2048, 55.2708 (Downtown Dubai)`);
        addLog(`  Condition: EXCELLENT`);
        addLog(`  Last service: 2024-01-15`);

        // Seed initial valuation if not set
        const existing = sdkStore.getAssetValuation(data.vehicleId);
        if (!existing) {
          sdkStore.updateAssetValuation(data.vehicleId, 95000);
        }
        const result = sdkStore.updateAssetValuation(data.vehicleId, 85000);
        setData(prev => ({ ...prev, latestValuation: '85000' }));
        addLog(`✓ Valuation updated`);
        addLog(`  Previous: $${result.previous.toLocaleString()}`);
        addLog(`  Current: $${result.current.toLocaleString()}`);
        addLog(`  Depreciation: ${result.changePct.toFixed(1)}%`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const vehicle = assets.find(a => a.name === 'Tesla Model S Plaid');
        const oracleData = vehicle ? sdkStore.getAssetMetadata(vehicle.id) : {};
        const oracle = (oracleData.oracleData || {}) as Record<string, any>;
        const valuation = vehicle ? sdkStore.getAssetValuation(vehicle.id) : null;
        const history = valuation?.history || [];
        const current = history.length > 0 ? history[history.length - 1].value : 0;
        const previous = history.length > 1 ? history[history.length - 2].value : current;
        const changePct = previous > 0 ? ((current - previous) / previous) * 100 : 0;
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-2">Vehicle Telemetry</h3>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Mileage', value: `${(oracle.mileage || 12450).toLocaleString()} mi`, color: 'text-white' },
                { label: 'Fuel Level', value: `${oracle.fuelLevel || 82}%`, color: 'text-green-400' },
                { label: 'Condition', value: oracle.condition || 'EXCELLENT', color: 'text-green-400' },
              ].map(item => (
                <div key={item.label} className="glass-card p-3 rounded-xl border border-red-500/20 text-center">
                  <p className="text-xs text-gray-500">{item.label}</p>
                  <p className={`text-sm font-bold ${item.color}`}>{item.value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card p-3 rounded-xl border border-white/10 text-center">
                <p className="text-xs text-gray-500">GPS Location</p>
                <p className="text-sm font-mono text-white">25.2048, 55.2708</p>
                <p className="text-xs text-gray-500 mt-1">Downtown Dubai</p>
              </div>
              <div className="glass-card p-3 rounded-xl border border-white/10 text-center">
                <p className="text-xs text-gray-500">Last Service</p>
                <p className="text-sm font-bold text-white">{oracle.lastService || '2024-01-15'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-card p-4 rounded-xl border border-white/10 text-center">
                <p className="text-xs text-gray-500">Previous Valuation</p>
                <p className="text-xl font-bold text-white">${(previous / 1e3).toFixed(0)}K</p>
              </div>
              <div className="glass-card p-4 rounded-xl border border-red-500/20 text-center">
                <p className="text-xs text-gray-500">Updated Valuation</p>
                <p className="text-xl font-bold text-red-400">${(current / 1e3).toFixed(0)}K</p>
                <p className="text-xs text-red-500 mt-1">{changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // E. Settlement & Returns (steps 13–16)
    // =========================================================================
    {
      id: 13,
      sectionId: 'settlement',
      title: 'Damage Assessment',
      description: 'IoT sensors and inspection detect minor damage — assessment recorded on-chain',
      code: `// Oracle reports damage detected
await client.oracle.update(vehicle.id, {
  type: 'DAMAGE_REPORT',
  severity: 'MINOR',
  location: 'FRONT_BUMPER',
  estimatedCost: 450,
  images: ['ipfs://Qm...abc', 'ipfs://Qm...def'],
  detectedBy: 'IOT_SENSOR',
  timestamp: new Date().toISOString(),
});

// Record on asset metadata
await client.assets.setMetadata(vehicle.id, {
  damageReport: {
    severity: 'MINOR',
    estimatedRepair: 450,
    status: 'PENDING_REVIEW',
  }
});`,
      action: async (addLog, setData, data) => {
        addLog(`✓ IoT sensor damage detection triggered`);
        addLog(`  Location: Front bumper`);
        addLog(`  Type: Minor scratch (8cm)`);
        addLog(`  Severity: MINOR`);

        const damageReport = {
          severity: 'MINOR',
          location: 'FRONT_BUMPER',
          estimatedCost: 450,
          detectedBy: 'IOT_SENSOR',
          timestamp: new Date().toISOString(),
        };

        sdkStore.setAssetMetadata(data.vehicleId, 'damageReport', damageReport);
        setData(prev => ({ ...prev, damageAmount: 450, hasDamage: true }));

        addLog(`✓ Damage assessment recorded on-chain`);
        addLog(`  Estimated repair cost: $450`);
        addLog(`  Evidence: 2 images uploaded to IPFS`);
        addLog(`  Status: PENDING_REVIEW`);

        addLog(`✓ Oracle update submitted`);
        addLog(`  Transaction hash: 0x7a3f...8e21`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const vehicle = assets.find(a => a.name === 'Tesla Model S Plaid');
        const meta = vehicle ? sdkStore.getAssetMetadata(vehicle.id) : {};
        const damage = (meta.damageReport as Record<string, any>) || {};

        return (
          <div className="space-y-4">
            <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/30 text-center">
              <p className="text-sm font-bold text-amber-400">DAMAGE DETECTED</p>
              <p className="text-xs text-gray-400 mt-1">IoT sensors reported an anomaly</p>
            </div>

            <div className="glass-card p-6 rounded-xl border border-red-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Damage Assessment Report</h3>

              {/* Vehicle diagram */}
              <div className="bg-white/5 p-4 rounded-xl border border-white/5 mb-4">
                <div className="relative w-full h-32 flex items-center justify-center">
                  <Car className="w-24 h-24 text-gray-600" />
                  {/* Damage indicator */}
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-4 h-4 bg-amber-500 rounded-full animate-pulse border-2 border-amber-300" />
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-2">
                    <span className="text-[10px] text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">Front Bumper</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Severity</p>
                  <p className="text-sm font-bold text-amber-400">{damage.severity || 'MINOR'}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Location</p>
                  <p className="text-sm font-bold text-white">Front Bumper</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Detected By</p>
                  <p className="text-sm font-bold text-white">IoT Sensor</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Est. Repair</p>
                  <p className="text-sm font-bold text-red-400">${damage.estimatedCost || 450}</p>
                </div>
              </div>

              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500 mb-2">Evidence (IPFS)</p>
                <div className="flex gap-2">
                  <div className="flex-1 h-16 bg-gray-800 rounded border border-white/10 flex items-center justify-center text-xs text-gray-500">Photo 1</div>
                  <div className="flex-1 h-16 bg-gray-800 rounded border border-white/10 flex items-center justify-center text-xs text-gray-500">Photo 2</div>
                </div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 14,
      sectionId: 'settlement',
      title: 'Insurance Claim',
      description: 'Process insurance claim for damage — automatic settlement via smart contract',
      code: `// Create insurance claim
const claim = await client.insurance.createClaim({
  vehicleId: vehicle.id,
  renterId: amira.id,
  damageReport: damageReport,
  policyId: 'POL-2024-78432',
  claimAmount: 450,
});

// Smart contract processes claim
await client.insurance.processClaim(claim.id);

// Settlement: deduct from deposit
const settlement = await client.settlements.create({
  type: 'INSURANCE_CLAIM',
  claimId: claim.id,
  deductible: 100,
  insurancePayout: 350,
  fromDeposit: true,
});`,
      action: async (addLog, setData, data) => {
        addLog(`✓ Insurance claim initiated`);
        addLog(`  Policy: POL-2024-78432 (Comprehensive)`);
        addLog(`  Coverage: Full damage protection`);
        addLog(`  Deductible: $100`);

        addLog(`✓ Claim submitted to insurance oracle`);
        addLog(`  Claim ID: CLM-2024-91823`);
        addLog(`  Damage amount: $450`);
        addLog(`  Status: PROCESSING`);

        await new Promise(r => setTimeout(r, 500));

        addLog(`✓ Insurance claim APPROVED`);
        addLog(`  Approved amount: $350 (insurer)`);
        addLog(`  Renter deductible: $100`);

        addLog(`✓ Settlement processed`);
        addLog(`  Deducted from deposit: $100`);
        addLog(`  Insurance payout: $350`);
        addLog(`  Repair scheduled: 2024-03-20`);

        setData(prev => ({
          ...prev,
          insuranceDeductible: 100,
          insurancePayout: 350,
          claimProcessed: true,
        }));
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-red-500/20">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Insurance Claim</h3>
              <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">
                APPROVED
              </span>
            </div>

            <div className="bg-white/5 p-4 rounded-xl border border-white/5 mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                  <span className="text-blue-400 text-lg">🛡</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Comprehensive Coverage</p>
                  <p className="text-xs text-gray-500">Policy: POL-2024-78432</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                <span className="text-sm text-gray-300">Total Damage</span>
                <span className="text-sm font-bold text-white">$450.00</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <span className="text-sm text-gray-300">Insurance Payout</span>
                <span className="text-sm font-bold text-blue-400">$350.00</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                <span className="text-sm text-gray-300">Renter Deductible</span>
                <span className="text-sm font-bold text-red-400">$100.00</span>
              </div>
            </div>

            <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20 text-center">
              <span className="text-sm font-bold text-green-400">Claim Settled — Deductible Applied to Deposit</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Claim ID</p>
                <p className="text-sm font-mono text-white">CLM-2024-91823</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Repair Date</p>
                <p className="text-sm font-bold text-white">Mar 20, 2024</p>
              </div>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 15,
      sectionId: 'settlement',
      title: 'Process Return',
      description: 'Freeze asset for inspection and create settlement with charges',
      code: `// Freeze for inspection period
await client.assets.transition(
  vehicle.id, 'FROZEN', fleet.id
);

// Create settlement with breakdown
const settlement = await client.settlements.create({
  assetId: vehicle.id,
  partyId: amira.id,
  amount: 2250, // net return after charges
  type: 'RENTAL_RETURN',
  breakdown: {
    deposit: 2500,
    damageAssessment: -0,
    fuelCharge: -50,
    lateReturn: -200,
    netReturn: 2250,
  }
});`,
      action: async (addLog, setData, data) => {
        const r = await sdkStore.transition(data.vehicleId, LifecycleState.FROZEN, data.fleetId);
        addLog(`✓ → FROZEN (inspection period): ${r.success ? 'OK' : r.error}`);
        const asset = sdkStore.getAsset(data.vehicleId);
        addLog(`  State: ${asset?.state}`);
        addLog(`  All rentals halted — inspection in progress`);

        const settlement = sdkStore.createSettlement({
          assetId: data.vehicleId,
          partyId: data.amiraId || data.renterId,
          amount: 2250,
          type: 'RENTAL_RETURN',
        });
        setData(prev => ({ ...prev, settlementId: settlement.id }));
        addLog(`✓ Settlement created: ${settlement.id.slice(0, 8)}`);
        addLog(`  Deposit: $2,500`);
        addLog(`  Damage assessment: $0 (no damage)`);
        addLog(`  Fuel charge: -$50`);
        addLog(`  Late return fee: -$200`);
        addLog(`  Net return: $2,250`);
        addLog(`  Status: ${settlement.status}`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const vehicle = assets.find(a => a.name === 'Tesla Model S Plaid');
        return (
          <div className="space-y-4">
            <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/30 text-center">
              <p className="text-sm font-bold text-red-400">VEHICLE FROZEN — INSPECTION PERIOD</p>
              <p className="text-xs text-gray-400 mt-1">All rental operations halted</p>
            </div>
            <div className="glass-card p-6 rounded-xl border border-red-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Return Settlement</h3>
              <div className="space-y-2">
                {[
                  { label: 'Security Deposit', value: '$2,500', positive: true },
                  { label: 'Damage Assessment', value: '$0', positive: true },
                  { label: 'Fuel Charge', value: '-$50', positive: false },
                  { label: 'Late Return Fee', value: '-$200', positive: false },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                    <span className="text-sm text-gray-300">{item.label}</span>
                    <span className={`text-sm font-bold ${item.positive ? 'text-green-400' : 'text-red-400'}`}>{item.value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-lg border border-green-500/20 mt-2">
                  <span className="text-sm font-bold text-white">Net Return</span>
                  <span className="text-lg font-bold text-green-400">$2,250</span>
                </div>
              </div>
              <div className="mt-4 bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Vehicle State</p>
                <p className="text-sm font-mono text-red-400">{vehicle?.state || 'FROZEN'}</p>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 16,
      sectionId: 'settlement',
      title: 'Complete & Redeem',
      description: 'Finalize rental — transition to REDEEMED and earn AHOY rewards',
      code: `// Transition through states to complete
await client.assets.transition(
  vehicle.id, 'ACTIVE', fleet.id
);
await client.assets.transition(
  vehicle.id, 'REDEEMED', fleet.id
);

// Earn AHOY for completed rental
ahoy.action('RENTAL_COMPLETED', 'CONNECT');
// Rental lifecycle complete!`,
      action: async (addLog, _setData, data) => {
        const r1 = await sdkStore.transition(data.vehicleId, LifecycleState.ACTIVE, data.fleetId);
        addLog(`✓ → ACTIVE: ${r1.success ? 'OK' : r1.error}`);

        const r2 = await sdkStore.transition(data.vehicleId, LifecycleState.REDEEMED, data.fleetId);
        addLog(`✓ → REDEEMED: ${r2.success ? 'OK' : r2.error}`);

        const asset = sdkStore.getAsset(data.vehicleId);
        addLog(`  Final state: ${asset?.state}`);

        const ahoy = sdkStore.simulateAhoyAction('RENTAL_COMPLETED', 'CONNECT');
        addLog(`  AHOY: +${ahoy.points} (balance: ${ahoy.newBalance})`);
        addLog(`  Rental lifecycle complete`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const vehicle = assets.find(a => a.name === 'Tesla Model S Plaid');
        const ahoy = sdkStore.getAhoyState();
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center border-2 border-green-500/30">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Rental Complete</h3>
              <p className="text-sm text-gray-400 mb-4">Vehicle state: {vehicle?.state || 'REDEEMED'}</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Final State</p>
                  <p className="text-sm font-mono text-green-400">{vehicle?.state || 'REDEEMED'}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Asset ID</p>
                  <p className="text-sm font-mono text-white">{vehicle?.id.slice(0, 12) || '—'}...</p>
                </div>
              </div>
              <div className="glass-card p-4 rounded-xl border border-amber-500/20 bg-amber-900/10">
                <p className="text-xs text-gray-500 mb-2">AHOY Rewards</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Balance</p>
                    <p className="text-lg font-bold text-amber-400">{ahoy.balance}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Tier</p>
                    <p className="text-lg font-bold text-amber-400">{ahoy.tier}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Lifetime</p>
                    <p className="text-lg font-bold text-amber-400">{ahoy.lifetimeEarned}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
  ],
};
