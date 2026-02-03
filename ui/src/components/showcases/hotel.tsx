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
  sections: [
    { id: 'property-onboarding', label: 'A. Property Onboarding' },
    { id: 'room-issuance', label: 'B. Room Issuance' },
    { id: 'guest-operations', label: 'C. Guest Operations' },
    { id: 'transfers-loyalty', label: 'D. Transfers & Loyalty' },
    { id: 'settlement', label: 'E. Settlement & Revenue' },
  ],
  steps: [
    // =========================================================================
    // A. Property Onboarding (steps 1–3)
    // =========================================================================
    {
      id: 1,
      sectionId: 'property-onboarding',
      title: 'Register Hotel Operator',
      description: 'Register LuxeStay Hotels as an organization with ISSUER and VERIFIER roles',
      code: `const operator = await client.parties.create({
  name: 'LuxeStay Hotels',
  type: 'ORGANIZATION',
  roles: ['ISSUER', 'VERIFIER'],
  jurisdiction: 'AE',
  metadata: {
    license: 'DTCM-2024-05521',
    brand: 'LuxeStay Collection',
    portfolio: '12 properties worldwide',
  }
});`,
      action: async (addLog, setData) => {
        const operator = await sdkStore.createParty({
          name: 'LuxeStay Hotels',
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
          jurisdiction: 'AE',
        });
        setData(prev => ({ ...prev, operatorId: operator.id }));
        addLog(`\u2713 Created organization: LuxeStay Hotels`);
        addLog(`  Party ID: ${operator.id}`);
        addLog(`  Type: ORGANIZATION`);
        addLog(`  Roles: ISSUER, VERIFIER`);
        addLog(`  Jurisdiction: AE`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const org = parties.find(p => p.name === 'LuxeStay Hotels');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-rose-500/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-rose-400 to-pink-600 flex items-center justify-center text-white font-bold text-lg">LH</div>
                <div>
                  <h3 className="text-lg font-bold text-white">LuxeStay Hotels</h3>
                  <p className="text-sm text-gray-400">Licensed Hotel Operator</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Jurisdiction</p>
                  <p className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span className="text-base">&#127462;&#127466;</span> UAE
                  </p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">License #</p>
                  <p className="text-sm font-mono text-white">DTCM-2024-05521</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Roles</p>
                  <p className="text-sm font-bold text-rose-400">ISSUER, VERIFIER</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Party ID</p>
                  <p className="text-sm font-mono text-white">{org?.id.slice(0, 12) || '\u2014'}...</p>
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
      sectionId: 'property-onboarding',
      title: 'Configure Compliance',
      description: 'Set up KYC provider, guest verification rules, and booking policies',
      code: `await client.parties.verifyKyc(operator.id);

// Configure hotel compliance rules
const compliance = {
  kycProvider: 'Onfido',
  idVerification: true,
  minimumAge: 18,
  bookingDeposit: '1_NIGHT',
  cancellationPolicy: '24H_FREE',
  noShowPenalty: '100%',
};`,
      action: async (addLog, _setData, data) => {
        sdkStore.verifyKyc(data.operatorId);
        addLog(`\u2713 KYC verified for LuxeStay Hotels`);
        addLog(`  Provider: Onfido`);
        addLog(`  ID verification: Required`);
        addLog(`  Minimum age: 18+`);
        addLog(`  Booking deposit: 1 night`);
        addLog(`  Cancellation: 24h free cancellation`);
        addLog(`  No-show penalty: 100% first night`);
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white mb-2">Compliance Configuration</h3>
          <div className="space-y-2">
            {[
              { label: 'KYC Provider', value: 'Onfido', status: true },
              { label: 'ID Verification', value: 'Required', status: true },
              { label: 'Minimum Age', value: '18+', status: true },
              { label: 'Booking Deposit', value: '1 night prepaid', status: true },
              { label: 'Cancellation Policy', value: '24h free cancellation', status: true },
              { label: 'No-Show Penalty', value: '100% first night', status: true },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${item.status ? 'bg-green-500 text-white' : 'bg-white/10 text-gray-500'}`}>
                    {item.status ? '\u2713' : '\u25CB'}
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
      sectionId: 'property-onboarding',
      title: 'Setup Operator Wallet',
      description: 'Generate multisig wallet for the hotel operator',
      code: `const wallet = await client.wallets.create({
  owner: operator.id,
  chain: 'BASE',
  type: 'MULTISIG',
  signers: 3,
  threshold: 2,
});
// Wallet funded with gas credits`,
      action: async (addLog, setData, data) => {
        const wallet = sdkStore.createWallet(data.operatorId, {
          chain: 'BASE',
          type: 'MULTISIG',
          threshold: 2,
          signers: 3,
        });
        setData(prev => ({ ...prev, walletAddress: wallet.address }));
        addLog(`\u2713 Wallet created for operator`);
        addLog(`  Address: ${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}`);
        addLog(`  Chain: ${wallet.chain} (L2)`);
        addLog(`  Type: ${wallet.threshold}-of-${wallet.signers} ${wallet.type}`);
        addLog(`  Gas balance: ${wallet.balance} ETH`);
      },
      render: (_data) => {
        const parties = sdkStore.getParties();
        const org = parties.find(p => p.name === 'LuxeStay Hotels');
        const wallet = org ? sdkStore.getWallet(org.id) : null;
        return (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-900/10 to-pink-900/5">
            <h3 className="text-lg font-bold text-white mb-4">Operator Wallet</h3>
            <div className="bg-black/30 p-4 rounded-xl border border-white/10 mb-4 font-mono text-sm">
              <p className="text-gray-500 text-xs mb-1">Address</p>
              <p className="text-rose-400">{wallet ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}` : '\u2014'}</p>
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
    // B. Room Issuance (steps 4–6)
    // =========================================================================
    {
      id: 4,
      sectionId: 'room-issuance',
      title: 'Create Property Asset',
      description: 'Register the hotel property as a tokenizable asset with ACCESS rights',
      code: `const property = await client.assets.create({
  name: 'LuxeStay Dubai Marina',
  description: '5-star luxury hotel, 450 rooms',
  rightType: 'ACCESS',
  jurisdiction: { countryCode: 'AE' },
  issuerId: operator.id,
  metadata: {
    type: 'HOTEL',
    rooms: 450,
    rating: 5,
    amenities: ['pool', 'spa', 'gym', 'restaurant', 'beach'],
  }
});`,
      action: async (addLog, setData, data) => {
        const property = await sdkStore.createAsset({
          name: 'LuxeStay Dubai Marina',
          description: '5-star luxury hotel, 450 rooms',
          rightType: RightType.ACCESS,
          jurisdiction: { countryCode: 'AE' },
          issuerId: data.operatorId,
          metadata: { type: 'HOTEL', rooms: 450, rating: 5 },
        });
        setData(prev => ({ ...prev, propertyId: property.id }));
        addLog(`\u2713 Asset created: ${property.name}`);
        addLog(`  ID: ${property.id}`);
        addLog(`  State: ${property.state}`);
        addLog(`  Right: ACCESS`);
        addLog(`  Rooms: 450`);
        addLog(`  Rating: 5 stars`);
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
              <p className="text-xs text-gray-500 font-mono">{property?.id || '\u2014'}</p>
              <div className="flex items-center gap-2 mt-1 mb-4">
                <div className="flex">{[1,2,3,4,5].map(i => <span key={i} className="text-yellow-400 text-sm">{'\u2605'}</span>)}</div>
                <span className="text-xs text-gray-500">State: {property?.state || 'DRAFT'}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white/5 p-3 rounded-lg text-center border border-white/5">
                  <p className="text-xs text-gray-500">Rooms</p>
                  <p className="text-lg font-bold text-white">450</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg text-center border border-white/5">
                  <p className="text-xs text-gray-500">Rating</p>
                  <p className="text-lg font-bold text-white">5-Star</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg text-center border border-white/5">
                  <p className="text-xs text-gray-500">Right</p>
                  <p className="text-lg font-bold text-white">ACCESS</p>
                </div>
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
      id: 5,
      sectionId: 'room-issuance',
      title: 'Create Room Offering',
      description: 'Configure room token offering: supply, pricing, and stay limits',
      code: `const offering = {
  assetId: property.id,
  totalSupply: 450,        // 450 rooms
  pricePerToken: 350,      // $350 per night
  minInvestment: 350,      // 1 night minimum
  maxInvestment: 10500,    // 30 nights maximum
  startDate: '2024-03-01',
  endDate: '2025-03-01',
  currency: 'USD',
};
console.log('Offering configured:', offering);`,
      action: async (addLog, _setData, data) => {
        const offering = sdkStore.createOffering(data.propertyId, {
          totalSupply: 450,
          pricePerToken: 350,
          minInvestment: 350,
          maxInvestment: 10500,
          currency: 'USD',
          startDate: '2024-03-01',
          endDate: '2025-03-01',
        });
        addLog(`\u2713 Offering created: ${offering.id.slice(0, 8)}`);
        addLog(`  Total supply: ${offering.totalSupply} room tokens`);
        addLog(`  Price: $${offering.pricePerToken} / night`);
        addLog(`  Min stay: ${offering.minInvestment / offering.pricePerToken} night ($${offering.minInvestment})`);
        addLog(`  Max stay: ${offering.maxInvestment / offering.pricePerToken} nights ($${offering.maxInvestment.toLocaleString()})`);
        addLog(`  Season: ${offering.startDate} \u2013 ${offering.endDate}`);
        addLog(`  Currency: ${offering.currency}`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'LuxeStay Dubai Marina');
        const offering = asset ? sdkStore.getOffering(asset.id) : null;
        const pct = offering ? (offering.soldAmount / offering.totalSupply) * 100 : 0;
        return (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-rose-500/20">
            <h3 className="text-lg font-bold text-white mb-4">Room Token Offering</h3>
            <div className="bg-gradient-to-r from-rose-500/10 to-pink-500/10 p-4 rounded-xl border border-rose-500/20 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Occupancy</span>
                <span className="text-sm font-bold text-rose-400">{offering ? `${offering.soldAmount} / ${offering.totalSupply} rooms` : '\u2014'}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-3">
                <div className="bg-rose-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Price / Night</p>
                <p className="text-lg font-bold text-white">${offering?.pricePerToken?.toLocaleString() || '\u2014'}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Total Rooms</p>
                <p className="text-lg font-bold text-white">{offering?.totalSupply || '\u2014'}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Min Stay</p>
                <p className="text-sm font-bold text-white">1 night ($350)</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Season</p>
                <p className="text-sm font-bold text-white">{offering ? `${offering.startDate} \u2013 ${offering.endDate}` : '\u2014'}</p>
              </div>
            </div>
            <h4 className="text-sm font-bold text-white mb-2">Room Types</h4>
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'Standard', count: 250, price: '$350' },
                { type: 'Deluxe', count: 150, price: '$550' },
                { type: 'Suite', count: 50, price: '$1,200' },
              ].map(room => (
                <div key={room.type} className="bg-white/5 p-2 rounded-lg border border-white/5 text-center">
                  <p className="text-xs text-gray-500">{room.type}</p>
                  <p className="text-sm font-bold text-white">{room.count}</p>
                  <p className="text-xs text-rose-400">{room.price}/night</p>
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
      id: 6,
      sectionId: 'room-issuance',
      title: 'Deploy Room Token',
      description: 'Transition property through compliance to ACTIVE and deploy token contract',
      code: `await client.assets.transition(
  property.id, 'PENDING_VERIFICATION', operator.id
);
await client.assets.transition(
  property.id, 'VERIFIED', operator.id
);
await client.assets.transition(
  property.id, 'ACTIVE', operator.id
);
// Room token contract deployed to Base L2`,
      action: async (addLog, _setData, data) => {
        const r1 = await sdkStore.transition(data.propertyId, LifecycleState.PENDING_VERIFICATION, data.operatorId);
        addLog(`\u2713 \u2192 PENDING_VERIFICATION: ${r1.success ? 'OK' : r1.error}`);

        const r2 = await sdkStore.transition(data.propertyId, LifecycleState.VERIFIED, data.operatorId);
        addLog(`\u2713 \u2192 VERIFIED: ${r2.success ? 'OK' : r2.error}`);

        const r3 = await sdkStore.transition(data.propertyId, LifecycleState.ACTIVE, data.operatorId);
        addLog(`\u2713 \u2192 ACTIVE: ${r3.success ? 'OK' : r3.error}`);

        const asset = sdkStore.getAsset(data.propertyId);
        addLog(`  Final state: ${asset?.state}`);
        addLog(`  Room token deployed to Base L2`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'LuxeStay Dubai Marina');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-rose-500/20">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white">Deployment Progress</h3>
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
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${done ? 'bg-green-500' : 'bg-white/10'}`}>{done ? '\u2713' : i + 1}</div>
                      <div className={`flex-1 h-px ${done ? 'bg-green-500/30' : 'bg-white/10'}`} />
                      <span className={`text-sm font-mono ${done ? 'text-green-400' : 'text-gray-600'}`}>{state}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Token Address</p>
                <p className="text-sm font-mono text-rose-400">0x9c2e...4a17 (Base L2)</p>
              </div>
            </div>
            <div className="glass-card p-4 rounded-xl border border-white/10">
              <h4 className="text-sm font-bold text-white mb-3">Select Room</h4>
              <RoomSelector onSelect={() => {}} />
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // C. Guest Operations (steps 7–10)
    // =========================================================================
    {
      id: 7,
      sectionId: 'guest-operations',
      title: 'Onboard Guest',
      description: 'Create guest profile with KYC verification',
      code: `const guest = await client.parties.create({
  name: 'Emma Chen',
  type: 'INDIVIDUAL',
  roles: ['INVESTOR'],
  jurisdiction: 'SG',
});
await client.parties.verifyKyc(guest.id);
// Status: VERIFIED`,
      action: async (addLog, setData) => {
        const guest = await sdkStore.createParty({
          name: 'Emma Chen',
          type: PartyType.INDIVIDUAL,
          roles: [PartyRole.INVESTOR],
          jurisdiction: 'SG',
        });
        sdkStore.verifyKyc(guest.id);
        setData(prev => ({ ...prev, guestId: guest.id }));
        addLog(`\u2713 Created guest: Emma Chen`);
        addLog(`  Party ID: ${guest.id}`);
        addLog(`  KYC: VERIFIED`);
        addLog(`  Jurisdiction: SG`);
        addLog(`  Loyalty tier: New Member`);
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
                  <p className="text-sm text-gray-400">Guest \u2014 Singapore</p>
                </div>
                <div className="ml-auto px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">
                  KYC VERIFIED
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Party ID</p>
                  <p className="text-sm font-mono text-white">{guest?.id.slice(0, 12) || '\u2014'}...</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Loyalty Status</p>
                  <p className="text-sm font-bold text-rose-400">New Member</p>
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
      sectionId: 'guest-operations',
      title: 'Setup Guest Wallet',
      description: 'Create wallet, whitelist it for room token transfers',
      code: `const wallet = await client.wallets.create({
  owner: guest.id,
  chain: 'BASE',
  type: 'EOA',
});
await client.wallets.whitelist(wallet.address);
const whitelisted = client.wallets.isWhitelisted(
  wallet.address
);
console.log('Whitelisted:', whitelisted); // true`,
      action: async (addLog, setData, data) => {
        const wallet = sdkStore.createWallet(data.guestId, {
          chain: 'BASE',
          type: 'EOA',
        });
        sdkStore.whitelistWallet(wallet.address);
        const whitelisted = sdkStore.isWhitelisted(wallet.address);
        setData(prev => ({ ...prev, guestWalletAddress: wallet.address }));
        addLog(`\u2713 Wallet created for guest`);
        addLog(`  Address: ${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}`);
        addLog(`  Chain: ${wallet.chain} (L2)`);
        addLog(`  Type: ${wallet.type}`);
        addLog(`  Whitelisted: ${whitelisted}`);
      },
      render: (_data) => {
        const parties = sdkStore.getParties();
        const guest = parties.find(p => p.name === 'Emma Chen');
        const wallet = guest ? sdkStore.getWallet(guest.id) : null;
        const whitelisted = wallet ? sdkStore.isWhitelisted(wallet.address) : false;
        return (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-900/10 to-pink-900/5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Guest Wallet</h3>
              {whitelisted && (
                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">
                  WHITELISTED
                </span>
              )}
            </div>
            <div className="bg-black/30 p-4 rounded-xl border border-white/10 mb-4 font-mono text-sm">
              <p className="text-gray-500 text-xs mb-1">Address</p>
              <p className="text-rose-400">{wallet ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}` : '\u2014'}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Chain</p>
                <p className="text-sm font-bold text-white">Base (L2)</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Type</p>
                <p className="text-sm font-bold text-white">{wallet?.type || 'EOA'}</p>
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
      sectionId: 'guest-operations',
      title: 'Book Room (Mint Token)',
      description: 'Compliance check, mint room token, and earn AHOY points',
      code: `const eligible = await client.compliance.check({
  assetId: property.id,
  from: operator.id,
  to: guest.id,
  amount: '1',
});
await client.assets.mint(property.id, guest.id, '1');
// 1 room token = 1 night reservation
// AHOY: +50 SERVICE_BOOKED points`,
      action: async (addLog, _setData, data) => {
        const compliance = sdkStore.checkTransferCompliance(data.propertyId, data.operatorId, data.guestId, '1');
        addLog(`\u2713 Compliance check: ${compliance.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
        for (const check of compliance.checks) {
          addLog(`  ${check.name}: ${check.passed ? '\u2713' : '\u2717'} (${check.detail})`);
        }

        const mint = await sdkStore.mint(data.propertyId, data.guestId, '1');
        addLog(`\u2713 Room token minted: ${mint.success ? 'SUCCESS' : mint.error}`);

        sdkStore.updateOfferingSold(data.propertyId, 1);
        const offering = sdkStore.getOffering(data.propertyId);
        addLog(`  Occupancy: ${offering?.soldAmount || 1} / ${offering?.totalSupply || 450}`);

        const ahoy = sdkStore.simulateAhoyAction('FLIGHT_BOOKING', 'CONNECT');
        addLog(`  AHOY: +${ahoy.points} points (balance: ${ahoy.newBalance})`);
      },
      render: () => {
        const ahoy = sdkStore.getAhoyState();
        return (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5 text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center border-2 border-green-500/30">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Booking Confirmed</h3>
            <p className="text-sm text-gray-400 mb-4">1 room token minted</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Room</p>
                <p className="text-lg font-bold text-white">Deluxe</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Check-in</p>
                <p className="text-sm font-bold text-white">Mar 15</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Check-out</p>
                <p className="text-sm font-bold text-white">Mar 18</p>
              </div>
            </div>
            <div className="mt-3 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20">
              <p className="text-xs text-gray-500">AHOY Points Earned</p>
              <p className="text-sm font-bold text-amber-400">+50 (Balance: {ahoy.balance})</p>
            </div>
          </div>
        </div>
        );
      },
      completed: false,
    },
    {
      id: 10,
      sectionId: 'guest-operations',
      title: 'Check In',
      description: 'Validate token ownership and record check-in on-chain',
      code: `const balances = await client.assets.getBalances(
  property.id
);
// Guest holds 1 room token = checked in
await client.assets.setMetadata(
  property.id, 'checkInTime', Date.now()
);
const events = client.assets.getEvents(property.id);`,
      action: async (addLog, _setData, data) => {
        const balances = await sdkStore.getBalances(data.propertyId);
        addLog(`\u2713 Check-in validated via token ownership`);
        for (const [pid, bal] of Object.entries(balances)) {
          const p = sdkStore.getParty(pid);
          addLog(`  ${p?.name || pid.slice(0, 8)}: ${bal} token(s)`);
        }

        const checkInTime = new Date().toISOString();
        sdkStore.setAssetMetadata(data.propertyId, 'checkInTime', checkInTime);
        sdkStore.setAssetMetadata(data.propertyId, 'roomNumber', '1507');
        sdkStore.setAssetMetadata(data.propertyId, 'floor', '15');
        addLog(`  Check-in time: ${checkInTime}`);
        addLog(`  Room: 1507, Floor: 15`);

        const events = sdkStore.getEvents(data.propertyId);
        addLog(`  Events on asset: ${events.length}`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const property = assets.find(a => a.name === 'LuxeStay Dubai Marina');
        const meta = property ? sdkStore.getAssetMetadata(property.id) : {};
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
                  <p className="text-xs text-gray-500">Room</p>
                  <p className="text-sm font-bold text-white">{(meta.roomNumber as string) || '1507'}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Floor</p>
                  <p className="text-sm font-bold text-white">{(meta.floor as string) || '15'}</p>
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

    // =========================================================================
    // D. Transfers & Loyalty (steps 11–12)
    // =========================================================================
    {
      id: 11,
      sectionId: 'transfers-loyalty',
      title: 'Transfer Reservation',
      description: 'Onboard a second guest and transfer the room token',
      code: `const guest2 = await client.parties.create({
  name: 'Marcus Wong',
  type: 'INDIVIDUAL',
  roles: ['INVESTOR'],
  jurisdiction: 'GB',
});
await client.parties.verifyKyc(guest2.id);

const eligible = await client.compliance.check({
  assetId: property.id,
  from: guest.id,
  to: guest2.id,
  amount: '1',
});
await client.assets.transfer(
  property.id,
  guest.id,   // from: Emma Chen
  guest2.id,  // to: Marcus Wong
  '1'
);`,
      action: async (addLog, setData, data) => {
        const guest2 = await sdkStore.createParty({
          name: 'Marcus Wong',
          type: PartyType.INDIVIDUAL,
          roles: [PartyRole.INVESTOR],
          jurisdiction: 'GB',
        });
        sdkStore.verifyKyc(guest2.id);
        setData(prev => ({ ...prev, guest2Id: guest2.id }));
        addLog(`\u2713 Created guest: Marcus Wong`);
        addLog(`  KYC: VERIFIED`);
        addLog(`  Jurisdiction: GB`);

        const compliance = sdkStore.checkTransferCompliance(data.propertyId, data.guestId, guest2.id, '1');
        addLog(`\u2713 Compliance check: ${compliance.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
        for (const check of compliance.checks) {
          addLog(`  ${check.name}: ${check.passed ? '\u2713' : '\u2717'}`);
        }

        const result = await sdkStore.transfer(data.propertyId, data.guestId, guest2.id, '1');
        addLog(`\u2713 Transfer: ${result.success ? 'SUCCESS' : result.error}`);

        const balances = await sdkStore.getBalances(data.propertyId);
        addLog(`  Updated balances:`);
        for (const [pid, bal] of Object.entries(balances)) {
          const p = sdkStore.getParty(pid);
          addLog(`    ${p?.name || pid.slice(0, 8)}: ${bal} token(s)`);
        }
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-rose-500/20">
            <h3 className="text-lg font-bold text-white mb-4">Reservation Transfer</h3>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-rose-400 to-pink-600 flex items-center justify-center text-white text-sm font-bold mb-2">EC</div>
                <p className="text-sm font-bold text-white">Emma Chen</p>
                <p className="text-xs text-gray-500">0 tokens</p>
              </div>
              <div className="flex flex-col items-center gap-1 text-xs text-gray-500">
                <span>1 &rarr;</span>
                <div className="w-12 h-px bg-rose-500/50" />
              </div>
              <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-sm font-bold mb-2">MW</div>
                <p className="text-sm font-bold text-white">Marcus Wong</p>
                <p className="text-xs text-gray-500">1 token</p>
              </div>
            </div>
            <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20 text-center">
              <span className="text-sm font-bold text-green-400">Reservation Transferred Successfully</span>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 12,
      sectionId: 'transfers-loyalty',
      title: 'Loyalty & AHOY',
      description: 'Earn AHOY points for hotel actions and view seasonal pricing',
      code: `// Earn AHOY for hotel activities
ahoy.earn('LOUNGE_CHECK_IN', 'CONNECT');
ahoy.earn('CROSS_PLATFORM_SYNC', 'CONNECT');

// Oracle: seasonal pricing & occupancy
await client.oracle.update(property.id, {
  seasonalRate: 1.35,
  occupancyRate: 0.87,
  peakSeason: true,
  avgDailyRate: 472,
});`,
      action: async (addLog, _setData, data) => {
        const a1 = sdkStore.simulateAhoyAction('LOUNGE_CHECK_IN', 'CONNECT');
        addLog(`\u2713 AHOY: LOUNGE_CHECK_IN +${a1.points} (balance: ${a1.newBalance})`);

        const a2 = sdkStore.simulateAhoyAction('CROSS_PLATFORM_SYNC', 'CONNECT');
        addLog(`\u2713 AHOY: CROSS_PLATFORM_SYNC +${a2.points} (balance: ${a2.newBalance})`);

        const a3 = sdkStore.simulateAhoyAction('AGENT_TASK_COMPLETION', 'CONNECT');
        addLog(`\u2713 AHOY: AGENT_TASK_COMPLETION +${a3.points} (balance: ${a3.newBalance})`);

        sdkStore.triggerOracleUpdate(data.propertyId, {
          seasonalRate: 1.35,
          occupancyRate: 0.87,
          peakSeason: true,
          avgDailyRate: 472,
          revPAR: 411,
        });
        addLog(`\u2713 Oracle updated`);
        addLog(`  Seasonal rate: 1.35x (peak)`);
        addLog(`  Occupancy: 87%`);
        addLog(`  Avg daily rate: $472`);
        addLog(`  RevPAR: $411`);
      },
      render: () => {
        const ahoy = sdkStore.getAhoyState();
        const tierColors: Record<string, string> = {
          BRONZE: 'from-amber-700 to-amber-900',
          SILVER: 'from-gray-300 to-gray-500',
          GOLD: 'from-yellow-400 to-amber-600',
          PLATINUM: 'from-gray-200 to-gray-400',
          DIAMOND: 'from-cyan-300 to-blue-500',
        };
        return (
          <div className="space-y-4">
            <div className={`glass-card p-6 rounded-xl border border-rose-500/20 bg-gradient-to-br ${tierColors[ahoy.tier] || tierColors.BRONZE} bg-opacity-10`}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">AHOY Loyalty</h3>
                <span className="px-3 py-1 bg-white/20 text-white rounded-full text-xs font-bold border border-white/30">
                  {ahoy.tier}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-black/20 p-3 rounded-lg border border-white/10 text-center">
                  <p className="text-xs text-gray-400">Balance</p>
                  <p className="text-xl font-bold text-white">{ahoy.balance}</p>
                </div>
                <div className="bg-black/20 p-3 rounded-lg border border-white/10 text-center">
                  <p className="text-xs text-gray-400">Lifetime</p>
                  <p className="text-xl font-bold text-white">{ahoy.lifetimeEarned}</p>
                </div>
                <div className="bg-black/20 p-3 rounded-lg border border-white/10 text-center">
                  <p className="text-xs text-gray-400">Streak</p>
                  <p className="text-xl font-bold text-white">{ahoy.streak} day{ahoy.streak !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>
            <div className="glass-card p-6 rounded-xl border border-rose-500/20">
              <h3 className="text-sm font-bold text-white mb-3">Seasonal Pricing Dashboard</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Season Multiplier</p>
                  <p className="text-lg font-bold text-rose-400">1.35x</p>
                  <p className="text-xs text-rose-300">Peak Season</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Occupancy Rate</p>
                  <p className="text-lg font-bold text-green-400">87%</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Avg Daily Rate</p>
                  <p className="text-lg font-bold text-white">$472</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">RevPAR</p>
                  <p className="text-lg font-bold text-white">$411</p>
                </div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },

    {
      id: 13,
      sectionId: 'transfers-loyalty',
      title: 'Loyalty Tier Upgrade',
      description: 'AHOY points accumulation triggers automatic tier upgrade with benefits',
      code: `// Check tier eligibility based on points
const ahoyState = client.ahoy.getState();
if (ahoyState.lifetimeEarned >= 500) {
  await client.ahoy.upgradeTier('SILVER');
}
// Tier benefits unlocked:
// - 10% room discount
// - Priority check-in
// - Late checkout`,
      action: async (addLog, _setData) => {
        const ahoy = sdkStore.getAhoyState();
        addLog(`✓ Checking loyalty tier eligibility`);
        addLog(`  Current tier: ${ahoy.tier}`);
        addLog(`  Lifetime points: ${ahoy.lifetimeEarned}`);

        // Simulate tier upgrade
        const newTier = ahoy.lifetimeEarned >= 1000 ? 'GOLD' : ahoy.lifetimeEarned >= 500 ? 'SILVER' : 'BRONZE';
        addLog(`✓ Tier upgrade: ${ahoy.tier} → ${newTier}`);
        addLog(`  Benefits unlocked:`);
        if (newTier === 'SILVER' || newTier === 'GOLD') {
          addLog(`    • 10% room discount`);
          addLog(`    • Priority check-in`);
          addLog(`    • Late checkout (2pm)`);
        }
        if (newTier === 'GOLD') {
          addLog(`    • Complimentary breakfast`);
          addLog(`    • Room upgrade priority`);
          addLog(`    • Lounge access`);
        }
      },
      render: () => {
        const ahoy = sdkStore.getAhoyState();
        const tiers = [
          { name: 'BRONZE', min: 0, benefits: ['Basic rewards', 'Points earning'], color: 'from-amber-700 to-amber-900' },
          { name: 'SILVER', min: 500, benefits: ['10% discount', 'Priority check-in', 'Late checkout'], color: 'from-gray-300 to-gray-500' },
          { name: 'GOLD', min: 1000, benefits: ['15% discount', 'Free breakfast', 'Lounge access', 'Room upgrades'], color: 'from-yellow-400 to-amber-600' },
          { name: 'PLATINUM', min: 2500, benefits: ['20% discount', 'Suite upgrades', 'Personal concierge'], color: 'from-gray-200 to-gray-400' },
        ];
        const currentTierIdx = tiers.findIndex(t => t.name === ahoy.tier);
        const nextTier = tiers[currentTierIdx + 1];
        const progress = nextTier ? Math.min(100, (ahoy.lifetimeEarned / nextTier.min) * 100) : 100;

        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-rose-500/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Loyalty Tier Status</h3>
                <span className={`px-3 py-1 bg-gradient-to-r ${tiers[currentTierIdx]?.color || tiers[0].color} text-white rounded-full text-xs font-bold`}>
                  {ahoy.tier}
                </span>
              </div>

              {/* Tier progress */}
              {nextTier && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{ahoy.lifetimeEarned} pts</span>
                    <span>{nextTier.min} pts for {nextTier.name}</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-rose-400 to-pink-600 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Current tier benefits */}
              <div className="bg-white/5 p-4 rounded-xl border border-white/5 mb-4">
                <p className="text-xs text-gray-500 mb-2">Current Benefits</p>
                <div className="space-y-1">
                  {tiers[currentTierIdx]?.benefits.map(b => (
                    <div key={b} className="flex items-center gap-2">
                      <span className="text-green-400 text-xs">✓</span>
                      <span className="text-sm text-white">{b}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tier ladder */}
              <div className="grid grid-cols-4 gap-2">
                {tiers.map((tier, i) => (
                  <div
                    key={tier.name}
                    className={`p-2 rounded-lg text-center border ${
                      i <= currentTierIdx
                        ? 'bg-gradient-to-br ' + tier.color + ' border-white/20'
                        : 'bg-white/5 border-white/5'
                    }`}
                  >
                    <p className={`text-[10px] font-bold ${i <= currentTierIdx ? 'text-white' : 'text-gray-500'}`}>
                      {tier.name}
                    </p>
                    <p className={`text-[9px] ${i <= currentTierIdx ? 'text-white/80' : 'text-gray-600'}`}>
                      {tier.min}+ pts
                    </p>
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
      id: 14,
      sectionId: 'transfers-loyalty',
      title: 'Room Upgrade',
      description: 'Loyalty member receives complimentary room upgrade based on availability',
      code: `// Check upgrade eligibility
const eligible = guest.loyaltyTier >= 'SILVER';
const available = await client.inventory.checkAvailability(
  property.id, 'SUITE'
);

if (eligible && available) {
  await client.bookings.upgrade({
    bookingId: booking.id,
    fromType: 'DELUXE',
    toType: 'SUITE',
    complimentary: true,
    reason: 'LOYALTY_BENEFIT',
  });
  // AHOY: +points for ROOM_UPGRADE
}`,
      action: async (addLog, setData, data) => {
        const ahoy = sdkStore.getAhoyState();
        addLog(`✓ Checking upgrade eligibility`);
        addLog(`  Loyalty tier: ${ahoy.tier}`);
        addLog(`  Eligible for complimentary upgrade: ${ahoy.tier !== 'BRONZE' ? 'YES' : 'NO'}`);

        addLog(`✓ Checking suite availability`);
        addLog(`  Suite inventory: 50 total, 12 available`);

        if (ahoy.tier !== 'BRONZE') {
          addLog(`✓ Room upgrade processed`);
          addLog(`  From: Deluxe Room ($550/night)`);
          addLog(`  To: Luxury Suite ($1,200/night)`);
          addLog(`  Upgrade value: $650/night`);
          addLog(`  Cost to guest: $0 (Complimentary)`);

          sdkStore.setAssetMetadata(data.propertyId, 'roomType', 'SUITE');
          sdkStore.setAssetMetadata(data.propertyId, 'roomNumber', '2501');
          sdkStore.setAssetMetadata(data.propertyId, 'floor', '25');

          const ahoyReward = sdkStore.simulateAhoyAction('ROOM_UPGRADE', 'CONNECT');
          addLog(`  AHOY: +${ahoyReward.points} bonus points (balance: ${ahoyReward.newBalance})`);
        } else {
          addLog(`  Upgrade not available for BRONZE tier`);
        }
      },
      render: () => {
        const ahoy = sdkStore.getAhoyState();
        const isEligible = ahoy.tier !== 'BRONZE';

        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-rose-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Room Upgrade</h3>

              {isEligible ? (
                <>
                  <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/20 text-center mb-4">
                    <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30">
                      <span className="text-green-400 text-xl">↑</span>
                    </div>
                    <p className="text-sm font-bold text-green-400">Complimentary Upgrade Applied!</p>
                    <p className="text-xs text-gray-400 mt-1">Thank you for your loyalty</p>
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1 p-3 bg-white/5 rounded-xl border border-white/5 text-center">
                      <p className="text-xs text-gray-500">From</p>
                      <p className="text-sm font-bold text-white">Deluxe Room</p>
                      <p className="text-xs text-gray-400">$550/night</p>
                    </div>
                    <div className="text-rose-400 text-xl">→</div>
                    <div className="flex-1 p-3 bg-rose-500/10 rounded-xl border border-rose-500/20 text-center">
                      <p className="text-xs text-rose-300">Upgraded To</p>
                      <p className="text-sm font-bold text-white">Luxury Suite</p>
                      <p className="text-xs text-rose-400">$1,200/night</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                      <p className="text-xs text-gray-500">New Room</p>
                      <p className="text-sm font-bold text-white">2501</p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                      <p className="text-xs text-gray-500">Floor</p>
                      <p className="text-sm font-bold text-white">25 (Executive)</p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                      <p className="text-xs text-gray-500">Upgrade Value</p>
                      <p className="text-sm font-bold text-green-400">$650/night</p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                      <p className="text-xs text-gray-500">Your Cost</p>
                      <p className="text-sm font-bold text-green-400">FREE</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-center">
                  <p className="text-sm text-gray-400">Upgrade to Silver tier or higher to unlock complimentary room upgrades</p>
                </div>
              )}
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // E. Settlement & Revenue (steps 15–16)
    // =========================================================================
    {
      id: 15,
      sectionId: 'settlement',
      title: 'Check Out & Settle',
      description: 'Freeze property during settlement processing and create settlement',
      code: `await client.assets.transition(
  property.id, 'FROZEN', operator.id
);
// Settlement processing period

const settlement = await client.settlements.create({
  assetId: property.id,
  partyId: guest2.id,
  amount: 1847.50,
  type: 'ROOM_CHECKOUT',
  lineItems: {
    roomCharges: 1050.00,  // 3 nights @ $350
    minibar: 127.50,
    spaServices: 450.00,
    roomService: 220.00,
  }
});`,
      action: async (addLog, _setData, data) => {
        const r = await sdkStore.transition(data.propertyId, LifecycleState.FROZEN, data.operatorId);
        addLog(`\u2713 \u2192 FROZEN: ${r.success ? 'OK' : r.error}`);
        addLog(`  Settlement processing in progress...`);

        const guestId = data.guest2Id || data.guestId;

        const s1 = sdkStore.createSettlement({
          assetId: data.propertyId,
          partyId: guestId,
          amount: 1050.00,
          type: 'ROOM_CHARGES',
        });
        addLog(`\u2713 Settlement: Room charges \u2014 $1,050.00 (${s1.status})`);

        const s2 = sdkStore.createSettlement({
          assetId: data.propertyId,
          partyId: guestId,
          amount: 127.50,
          type: 'MINIBAR',
        });
        addLog(`\u2713 Settlement: Minibar \u2014 $127.50 (${s2.status})`);

        const s3 = sdkStore.createSettlement({
          assetId: data.propertyId,
          partyId: guestId,
          amount: 450.00,
          type: 'SPA_SERVICES',
        });
        addLog(`\u2713 Settlement: Spa services \u2014 $450.00 (${s3.status})`);

        const s4 = sdkStore.createSettlement({
          assetId: data.propertyId,
          partyId: guestId,
          amount: 220.00,
          type: 'ROOM_SERVICE',
        });
        addLog(`\u2713 Settlement: Room service \u2014 $220.00 (${s4.status})`);

        addLog(`  Total: $1,847.50`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const property = assets.find(a => a.name === 'LuxeStay Dubai Marina');
        const lineItems = [
          { label: 'Room Charges (3 nights @ $350)', amount: 1050.00 },
          { label: 'Minibar', amount: 127.50 },
          { label: 'Spa Services', amount: 450.00 },
          { label: 'Room Service', amount: 220.00 },
        ];
        const total = lineItems.reduce((sum, item) => sum + item.amount, 0);
        return (
          <div className="space-y-4">
            <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/30 text-center">
              <p className="text-sm font-bold text-amber-400">SETTLEMENT PROCESSING</p>
              <p className="text-xs text-gray-400 mt-1">Property frozen during checkout settlement</p>
            </div>
            <div className="glass-card p-6 rounded-xl border border-rose-500/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Settlement Breakdown</h3>
                <span className="px-3 py-1 rounded-full text-xs font-bold border bg-amber-500/20 text-amber-400 border-amber-500/30">
                  {property?.state || 'FROZEN'}
                </span>
              </div>
              <div className="space-y-2 mb-4">
                {lineItems.map(item => (
                  <div key={item.label} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                    <span className="text-sm text-gray-300">{item.label}</span>
                    <span className="text-sm font-bold text-white">${item.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between p-4 bg-rose-500/10 rounded-xl border border-rose-500/20">
                <span className="text-sm font-bold text-white">Total</span>
                <span className="text-xl font-bold text-rose-400">${total.toFixed(2)}</span>
              </div>
              <div className="mt-3 bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Guest</p>
                <p className="text-sm font-bold text-white">Marcus Wong</p>
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
      title: 'Complete Stay',
      description: 'Transition to REDEEMED, finalize stay, and earn completion AHOY points',
      code: `await client.assets.transition(
  property.id, 'ACTIVE', operator.id
);
await client.assets.transition(
  property.id, 'REDEEMED', operator.id
);
// Room token burned, stay settled

ahoy.earn('STAY_COMPLETED', 'CONNECT');
// Prompt guest for review`,
      action: async (addLog, _setData, data) => {
        const r1 = await sdkStore.transition(data.propertyId, LifecycleState.ACTIVE, data.operatorId);
        addLog(`\u2713 \u2192 ACTIVE: ${r1.success ? 'OK' : r1.error}`);

        const r2 = await sdkStore.transition(data.propertyId, LifecycleState.REDEEMED, data.operatorId);
        addLog(`\u2713 \u2192 REDEEMED: ${r2.success ? 'OK' : r2.error}`);

        const asset = sdkStore.getAsset(data.propertyId);
        addLog(`  Final state: ${asset?.state}`);
        addLog(`  Room token burned`);

        const ahoy = sdkStore.simulateAhoyAction('AGENT_TASK_COMPLETION', 'CONNECT');
        addLog(`  AHOY: +${ahoy.points} (balance: ${ahoy.newBalance})`);
        addLog(`  Stay complete \u2014 review prompt sent to guest`);
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
              <h3 className="text-xl font-bold text-white mb-2">Stay Complete</h3>
              <p className="text-sm text-gray-400 mb-4">Room token redeemed and burned</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Final State</p>
                  <p className="text-sm font-bold text-green-400">{property?.state || 'REDEEMED'}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Asset ID</p>
                  <p className="text-sm font-mono text-white">{property?.id.slice(0, 12) || '\u2014'}...</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">AHOY Balance</p>
                  <p className="text-sm font-bold text-amber-400">{ahoy.balance}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">AHOY Tier</p>
                  <p className="text-sm font-bold text-amber-400">{ahoy.tier}</p>
                </div>
              </div>
              <div className="p-4 bg-rose-500/10 rounded-xl border border-rose-500/20">
                <p className="text-sm text-gray-300 mb-2">How was your stay at LuxeStay Dubai Marina?</p>
                <div className="flex justify-center gap-1">
                  {[1,2,3,4,5].map(i => (
                    <span key={i} className="text-2xl text-yellow-400 cursor-pointer hover:scale-110 transition-transform">{'\u2605'}</span>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">Leave a review to earn +20 AHOY points</p>
              </div>
            </div>
            <div className="glass-card p-6 rounded-xl border border-rose-500/20">
              <h3 className="text-sm font-bold text-white mb-3">Stay Lifecycle</h3>
              <div className="space-y-2">
                {[
                  { state: 'DRAFT', label: 'Property registered' },
                  { state: 'VERIFIED', label: 'Compliance verified' },
                  { state: 'ACTIVE', label: 'Room booked & checked in' },
                  { state: 'FROZEN', label: 'Settlement processed' },
                  { state: 'REDEEMED', label: 'Stay completed' },
                ].map((step, i) => (
                  <div key={step.state} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold bg-green-500">{'\u2713'}</div>
                    <div className="flex-1 h-px bg-green-500/30" />
                    <div className="text-right">
                      <span className="text-sm font-mono text-green-400">{step.state}</span>
                      <p className="text-xs text-gray-500">{step.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
  ],
};
