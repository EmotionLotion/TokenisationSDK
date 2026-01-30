import { BedDouble } from 'lucide-react';
import { RoomSelector } from '@tokenisation/sdk/components';
import { sdkStore } from '../../store';
import { RightType, PartyType, PartyRole, LifecycleState, isKycVerified } from '../../types';
import type { ShowcaseConfig } from './types';

export const hotelShowcase: ShowcaseConfig = {
  id: 'hotel',
  name: 'Hotel Reservation Tokenisation',
  shortName: 'Hotel',
  description: 'Tokenized room bookings with loyalty integration',
  color: 'rose',
  icon: <BedDouble className="w-5 h-5" />,
  sections: [{ id: 'default', label: 'Steps' }],
  steps: [
    {
      id: 1,
      sectionId: 'default',
      title: 'Create Property Asset',
      description: 'Register LuxeStay hotel on-chain',
      code: `const property = await client.assets.create({
  name: 'LuxeStay Dubai Marina',
  rightType: 'ACCESS',
  jurisdiction: { countryCode: 'AE' },
  metadata: {
    type: 'HOTEL', rooms: 450, rating: 5,
    amenities: ['pool', 'spa', 'gym']
  }
});`,
      action: async (addLog, setData) => {
        const operator = await sdkStore.createParty({
          name: 'LuxeStay Hotels',
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER],
          jurisdiction: 'AE',
        });
        sdkStore.verifyKyc(operator.id);
        addLog(`✓ Operator: LuxeStay Hotels (${operator.id.slice(0, 8)})`);

        const property = await sdkStore.createAsset({
          name: 'LuxeStay Dubai Marina',
          description: '5-star hotel property',
          rightType: RightType.ACCESS,
          jurisdiction: { countryCode: 'AE' },
          issuerId: operator.id,
          metadata: { type: 'HOTEL', rooms: 450, rating: 5 },
        });
        setData(prev => ({ ...prev, operatorId: operator.id, propertyId: property.id }));
        addLog(`✓ Property: ${property.name} (${property.id.slice(0, 8)})`);
        addLog(`  State: ${property.state}`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const property = assets.find(a => a.name === 'LuxeStay Dubai Marina');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-rose-500/20">
              <div className="w-full h-40 bg-gradient-to-br from-rose-900/20 to-gray-900 rounded-xl mb-4 flex items-center justify-center border border-white/5">
                <BedDouble className="w-16 h-16 text-rose-400/50" />
              </div>
              <h3 className="text-xl font-bold text-white">LuxeStay Dubai Marina</h3>
              <p className="text-xs text-gray-500 font-mono">{property?.id || '—'}</p>
              <div className="flex items-center gap-2 mt-1 mb-4">
                <div className="flex">{[1,2,3,4,5].map(i => <span key={i} className="text-yellow-400 text-sm">★</span>)}</div>
                <span className="text-xs text-gray-500">State: {property?.state || 'DRAFT'}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Pool', 'Spa', 'Gym', 'Restaurant', 'Beach Access'].map(a => (
                  <span key={a} className="px-2 py-1 bg-rose-500/10 text-rose-300 text-xs rounded-lg border border-rose-500/20">{a}</span>
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
      title: 'Onboard Guest',
      description: 'Guest identity verification',
      code: `const guest = await client.parties.create({
  name: 'Emma Chen',
  type: 'INDIVIDUAL',
  roles: ['INVESTOR'],
  jurisdiction: 'SG',
});
await client.parties.verifyKyc(guest.id);`,
      action: async (addLog, setData) => {
        const guest = await sdkStore.createParty({
          name: 'Emma Chen',
          type: PartyType.INDIVIDUAL,
          roles: [PartyRole.INVESTOR],
          jurisdiction: 'SG',
        });
        sdkStore.verifyKyc(guest.id);
        setData(prev => ({ ...prev, guestId: guest.id }));
        const party = sdkStore.getParty(guest.id);
        addLog(`✓ Guest: ${party?.name} (${guest.id.slice(0, 8)})`);
        addLog(`  KYC: ${isKycVerified(party) ? 'VERIFIED' : 'PENDING'}`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const guest = parties.find(p => p.name === 'Emma Chen');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-400 to-pink-600 flex items-center justify-center text-white font-bold text-xl">EC</div>
                <div>
                  <h3 className="text-lg font-bold text-white">{guest?.name || 'Emma Chen'}</h3>
                  <p className="text-sm text-gray-400">Guest — {guest?.jurisdiction || 'SG'}</p>
                </div>
                <div className="ml-auto px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">
                  {isKycVerified(guest) ? 'VERIFIED' : 'PENDING'}
                </div>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Party ID</p>
                <p className="text-sm font-mono text-white">{guest?.id || '—'}</p>
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
      title: 'Book Room (Deploy + Mint)',
      description: 'Transition property to ACTIVE, mint room token',
      code: `await client.assets.transition(
  property.id, 'PENDING_VERIFICATION', op.id
);
await client.assets.transition(
  property.id, 'VERIFIED', op.id
);
await client.assets.transition(
  property.id, 'ACTIVE', op.id
);
await client.assets.mint(
  property.id, guest.id, '1'
);`,
      action: async (addLog, _setData, data) => {
        await sdkStore.transition(data.propertyId, LifecycleState.PENDING_VERIFICATION, data.operatorId);
        await sdkStore.transition(data.propertyId, LifecycleState.VERIFIED, data.operatorId);
        await sdkStore.transition(data.propertyId, LifecycleState.ACTIVE, data.operatorId);
        const asset = sdkStore.getAsset(data.propertyId);
        addLog(`✓ Property state: ${asset?.state}`);

        const mint = await sdkStore.mint(data.propertyId, data.guestId, '1');
        addLog(`✓ Room token minted: ${mint.success ? 'SUCCESS' : mint.error}`);

        const ahoy = sdkStore.simulateAhoyAction('SERVICE_BOOKED', 'CONNECT');
        addLog(`  AHOY: +${ahoy.points} (balance: ${ahoy.newBalance})`);
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white">Select Your Room</h3>
          <div className="glass-card p-4 rounded-xl border border-white/10">
            <RoomSelector onSelect={() => {}} />
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 4,
      sectionId: 'default',
      title: 'Check In',
      description: 'Validate reservation token',
      code: `const balances = await client.assets.getBalances(
  property.id
);
// Guest holds 1 room token = checked in
const events = client.assets.getEvents(
  property.id
);`,
      action: async (addLog, _setData, data) => {
        const balances = await sdkStore.getBalances(data.propertyId);
        addLog(`✓ Check-in validated`);
        for (const [pid, bal] of Object.entries(balances)) {
          const p = sdkStore.getParty(pid);
          addLog(`  ${p?.name || pid.slice(0, 8)}: ${bal} token(s)`);
        }
        const events = sdkStore.getEvents(data.propertyId);
        addLog(`  Events on asset: ${events.length}`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const property = assets.find(a => a.name === 'LuxeStay Dubai Marina');
        const ahoy = sdkStore.getAhoyState();
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-rose-500/20 bg-rose-900/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Active Reservation</h3>
                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold animate-pulse border border-green-500/30">CHECKED IN</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Property</p>
                  <p className="text-sm font-bold text-white">LuxeStay Marina</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">State</p>
                  <p className="text-sm font-bold text-green-400">{property?.state}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Guest</p>
                  <p className="text-sm font-bold text-white">Emma Chen</p>
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
    {
      id: 5,
      sectionId: 'default',
      title: 'Check Out & Settle',
      description: 'Transition to REDEEMED, finalize',
      code: `await client.assets.transition(
  property.id, 'REDEEMED', operator.id
);
// Room token burned, stay settled`,
      action: async (addLog, _setData, data) => {
        const result = await sdkStore.transition(data.propertyId, LifecycleState.REDEEMED, data.operatorId);
        addLog(`✓ → REDEEMED: ${result.success ? 'OK' : result.error}`);
        const asset = sdkStore.getAsset(data.propertyId);
        addLog(`  Final state: ${asset?.state}`);
        const ahoy = sdkStore.simulateAhoyAction('STAY_COMPLETED', 'CONNECT');
        addLog(`  AHOY: +${ahoy.points} (balance: ${ahoy.newBalance})`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const property = assets.find(a => a.name === 'LuxeStay Dubai Marina');
        const ahoy = sdkStore.getAhoyState();
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5 text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center border-2 border-green-500/30">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Check Out Complete</h3>
              <p className="text-sm text-gray-400 mb-4">State: {property?.state}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Asset ID</p>
                  <p className="text-sm font-mono text-white">{property?.id.slice(0, 12) || '—'}...</p>
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
  ],
};
