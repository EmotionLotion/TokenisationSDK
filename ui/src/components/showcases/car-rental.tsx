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
  sections: [{ id: 'default', label: 'Steps' }],
  steps: [
    {
      id: 1,
      sectionId: 'default',
      title: 'Create Vehicle Asset',
      description: 'Register Tesla Model S as tokenizable fleet asset',
      code: `const vehicle = await client.assets.create({
  name: 'Tesla Model S Plaid',
  rightType: 'ACCESS',
  jurisdiction: { countryCode: 'AE' },
  metadata: {
    type: 'ELECTRIC',
    pricePerDay: 250,
    range: '396 mi',
  }
});`,
      action: async (addLog, setData) => {
        const fleet = await sdkStore.createParty({
          name: 'LuxeDrive Fleet',
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER],
          jurisdiction: 'AE',
        });
        sdkStore.verifyKyc(fleet.id);
        addLog(`✓ Fleet operator: LuxeDrive Fleet (${fleet.id.slice(0, 8)})`);

        const vehicle = await sdkStore.createAsset({
          name: 'Tesla Model S Plaid',
          description: 'Electric performance sedan',
          rightType: RightType.ACCESS,
          jurisdiction: { countryCode: 'AE' },
          issuerId: fleet.id,
          metadata: { type: 'ELECTRIC', pricePerDay: 250, range: '396 mi' },
        });
        setData(prev => ({ ...prev, fleetId: fleet.id, vehicleId: vehicle.id }));
        addLog(`✓ Vehicle asset: ${vehicle.name} (${vehicle.id.slice(0, 8)})`);
        addLog(`  State: ${vehicle.state}`);
        addLog(`  Right: ${(vehicle as any).rightType}`);
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
      id: 2,
      sectionId: 'default',
      title: 'Onboard Renter',
      description: 'Identity verification and license check',
      code: `const renter = await client.parties.create({
  name: 'Carlos Rivera',
  type: 'INDIVIDUAL',
  roles: ['INVESTOR'],
  jurisdiction: 'AE',
});
await client.parties.verifyKyc(renter.id);`,
      action: async (addLog, setData) => {
        const renter = await sdkStore.createParty({
          name: 'Carlos Rivera',
          type: PartyType.INDIVIDUAL,
          roles: [PartyRole.INVESTOR],
          jurisdiction: 'AE',
        });
        sdkStore.verifyKyc(renter.id);
        setData(prev => ({ ...prev, renterId: renter.id }));
        const party = sdkStore.getParty(renter.id);
        addLog(`✓ Renter: ${party?.name} (${renter.id.slice(0, 8)})`);
        addLog(`  KYC: ${isKycVerified(party) ? 'VERIFIED' : 'PENDING'}`);
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
                  <p className="text-sm text-gray-400">Renter — {renter?.jurisdiction || 'AE'}</p>
                </div>
                <div className="ml-auto px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">
                  {isKycVerified(renter) ? 'VERIFIED' : 'PENDING'}
                </div>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Party ID</p>
                <p className="text-sm font-mono text-white">{renter?.id || '—'}</p>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 3,
      sectionId: 'default',
      title: 'Activate Rental (Deploy Token)',
      description: 'Transition vehicle asset to ACTIVE for rental',
      code: `await client.assets.transition(
  vehicle.id, 'PENDING_VERIFICATION', fleet.id
);
await client.assets.transition(
  vehicle.id, 'VERIFIED', fleet.id
);
await client.assets.transition(
  vehicle.id, 'ACTIVE', fleet.id
);`,
      action: async (addLog, _setData, data) => {
        await sdkStore.transition(data.vehicleId, LifecycleState.PENDING_VERIFICATION, data.fleetId);
        addLog('✓ → PENDING_VERIFICATION');
        await sdkStore.transition(data.vehicleId, LifecycleState.VERIFIED, data.fleetId);
        addLog('✓ → VERIFIED');
        await sdkStore.transition(data.vehicleId, LifecycleState.ACTIVE, data.fleetId);
        addLog('✓ → ACTIVE');
        const asset = sdkStore.getAsset(data.vehicleId);
        addLog(`  Vehicle state: ${asset?.state}`);
      },
      render: () => {
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">Select Rental Dates</h3>
            <div className="glass-card p-6 rounded-xl border border-white/10">
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
    {
      id: 4,
      sectionId: 'default',
      title: 'Mint Rental Token',
      description: 'Mint access token to renter',
      code: `await client.assets.mint(
  vehicle.id,
  renter.id,
  '1' // 1 access token
);
// Renter now has vehicle access`,
      action: async (addLog, _setData, data) => {
        const result = await sdkStore.mint(data.vehicleId, data.renterId, '1');
        addLog(`✓ Mint: ${result.success ? 'SUCCESS' : result.error}`);
        const balances = await sdkStore.getBalances(data.vehicleId);
        addLog(`  Balances: ${JSON.stringify(balances)}`);
        const ahoy = sdkStore.simulateAhoyAction('CAR_RENTED', 'CONNECT');
        addLog(`  AHOY: +${ahoy.points} (balance: ${ahoy.newBalance})`);
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
                  <p className="text-sm font-bold text-white">Tesla Model S</p>
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
    {
      id: 5,
      sectionId: 'default',
      title: 'Return & Settle',
      description: 'Transition to REDEEMED, token burned',
      code: `await client.assets.transition(
  vehicle.id, 'REDEEMED', fleet.id
);
// Rental complete, token burned`,
      action: async (addLog, _setData, data) => {
        const result = await sdkStore.transition(data.vehicleId, LifecycleState.REDEEMED, data.fleetId);
        addLog(`✓ → REDEEMED: ${result.success ? 'OK' : result.error}`);
        const asset = sdkStore.getAsset(data.vehicleId);
        addLog(`  Final state: ${asset?.state}`);
        const ahoy = sdkStore.simulateAhoyAction('RENTAL_COMPLETED', 'CONNECT');
        addLog(`  AHOY: +${ahoy.points} (balance: ${ahoy.newBalance})`);
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
              <p className="text-sm text-gray-400 mb-4">Vehicle state: {vehicle?.state || '—'}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Asset ID</p>
                  <p className="text-sm font-mono text-white">{vehicle?.id.slice(0, 12) || '—'}...</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">AHOY</p>
                  <p className="text-sm font-bold text-amber-400">{ahoy.balance}</p>
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
