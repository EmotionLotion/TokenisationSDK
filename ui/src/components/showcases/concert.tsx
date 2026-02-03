import { Music } from 'lucide-react';
import { SeatSelectionMap } from '@tokenisation/sdk/components';
import { sdkStore } from '../../store';
import { RightType, PartyType, PartyRole, LifecycleState, isKycVerified } from '../../types';
import type { ShowcaseConfig } from './types';

export const concertShowcase: ShowcaseConfig = {
  id: 'concert',
  name: 'Concert Ticket Tokenisation',
  shortName: 'Concert',
  description: 'NFT event tickets with secondary market and gate validation',
  color: 'purple',
  icon: <Music className="w-5 h-5" />,
  sections: [
    { id: 'event-setup', label: 'A. Event Setup' },
    { id: 'ticket-issuance', label: 'B. Ticket Issuance' },
    { id: 'ticket-operations', label: 'C. Ticket Operations' },
    { id: 'secondary-market', label: 'D. Secondary Market' },
    { id: 'gate-validation', label: 'E. Gate Validation' },
    { id: 'settlement', label: 'F. Settlement' },
  ],
  steps: [
    // =========================================================================
    // A. Event Setup (steps 1–3)
    // =========================================================================
    {
      id: 1,
      sectionId: 'event-setup',
      title: 'Register Promoter',
      description: 'Register the event promoter organization with ISSUER and VERIFIER roles',
      code: `const promoter = await client.parties.create({
  name: 'VibeTix Promotions',
  type: 'ORGANIZATION',
  roles: ['ISSUER', 'VERIFIER'],
  jurisdiction: 'AE',
  metadata: {
    license: 'DTCM-2024-04471',
    registeredName: 'VibeTix Promotions LLC',
  }
});
await client.parties.verifyKyc(promoter.id);`,
      action: async (addLog, setData) => {
        const promoter = await sdkStore.createParty({
          name: 'VibeTix Promotions',
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
          jurisdiction: 'AE',
        });
        sdkStore.verifyKyc(promoter.id);
        setData(prev => ({ ...prev, promoterId: promoter.id }));
        addLog(`\u2713 Created organization: VibeTix Promotions`);
        addLog(`  Party ID: ${promoter.id}`);
        addLog(`  Type: ORGANIZATION`);
        addLog(`  Roles: ISSUER, VERIFIER`);
        addLog(`  Jurisdiction: AE`);
        addLog(`  KYC: VERIFIED`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const org = parties.find(p => p.name === 'VibeTix Promotions');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-purple-500/20">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">VT</div>
                <div>
                  <h3 className="text-lg font-bold text-white">VibeTix Promotions</h3>
                  <p className="text-sm text-gray-400">Licensed Event Promoter</p>
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
                  <p className="text-sm font-mono text-white">DTCM-2024-04471</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Roles</p>
                  <p className="text-sm font-bold text-purple-400">ISSUER, VERIFIER</p>
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
      sectionId: 'event-setup',
      title: 'Configure Event Compliance',
      description: 'Set up age restrictions, ticket limits, resale caps, and jurisdiction rules',
      code: `await client.parties.verifyKyc(promoter.id);

// Configure event compliance rules
const compliance = {
  ageRestriction: 16,
  ticketLimitPerPerson: 4,
  resalePriceCap: 1.5,       // 150% of face value
  vipKycRequired: true,
  jurisdictionWhitelist: ['AE', 'US', 'GB', 'KR', 'SG'],
};`,
      action: async (addLog, _setData, data) => {
        addLog(`\u2713 Event compliance configured`);
        addLog(`  Age restriction: 16+`);
        addLog(`  Ticket limit per person: 4 max`);
        addLog(`  Resale price cap: 150% of face value`);
        addLog(`  VIP KYC required: Yes`);
        addLog(`  Jurisdiction whitelist: AE, US, GB, KR, SG`);
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white mb-2">Event Compliance Rules</h3>
          <div className="space-y-2">
            {[
              { label: 'Age Restriction', value: '16+', status: true },
              { label: 'Ticket Limit / Person', value: '4 max', status: true },
              { label: 'Resale Price Cap', value: '150% of face value', status: true },
              { label: 'VIP KYC Required', value: 'Yes', status: true },
              { label: 'Jurisdiction Whitelist', value: 'AE, US, GB, KR, SG', status: true },
              { label: 'Anti-Scalping', value: 'Enabled', status: true },
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
      sectionId: 'event-setup',
      title: 'Setup Promoter Wallet',
      description: 'Generate multisig wallet for the promoter organization',
      code: `const wallet = await client.wallets.create({
  owner: promoter.id,
  chain: 'BASE',
  type: 'MULTISIG',
  signers: 3,
  threshold: 2,
});
// Wallet funded with gas credits`,
      action: async (addLog, setData, data) => {
        const wallet = sdkStore.createWallet(data.promoterId, {
          chain: 'BASE',
          type: 'MULTISIG',
          threshold: 2,
          signers: 3,
        });
        setData(prev => ({ ...prev, promoterWallet: wallet.address }));
        addLog(`\u2713 Wallet created for promoter`);
        addLog(`  Address: ${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}`);
        addLog(`  Chain: ${wallet.chain} (L2)`);
        addLog(`  Type: ${wallet.threshold}-of-${wallet.signers} ${wallet.type}`);
        addLog(`  Gas balance: ${wallet.balance} ETH`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const org = parties.find(p => p.name === 'VibeTix Promotions');
        const wallet = org ? sdkStore.getWallet(org.id) : null;
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-900/10 to-indigo-900/5">
              <h3 className="text-lg font-bold text-white mb-4">Promoter Wallet</h3>
              <div className="bg-black/30 p-4 rounded-xl border border-white/10 mb-4 font-mono text-sm">
                <p className="text-gray-500 text-xs mb-1">Address</p>
                <p className="text-purple-400">{wallet ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}` : '\u2014'}</p>
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
    // B. Ticket Issuance (steps 4–6)
    // =========================================================================
    {
      id: 4,
      sectionId: 'ticket-issuance',
      title: 'Create Event Asset',
      description: 'Register the concert event as a tokenizable ACCESS asset with tier pricing',
      code: `const event = await client.assets.create({
  name: 'Cosmic Beats \u2014 Dubai Arena',
  description: 'Live concert, June 15 2024',
  rightType: 'ACCESS',
  jurisdiction: { countryCode: 'AE' },
  issuerId: promoter.id,
  metadata: {
    artist: 'Cosmic Beats',
    venue: 'Dubai Arena',
    date: '2024-06-15',
    capacity: 15000,
    tiers: {
      VIP: { price: 500, supply: 1000 },
      Gold: { price: 300, supply: 4000 },
      Standard: { price: 150, supply: 10000 },
    }
  }
});`,
      action: async (addLog, setData, data) => {
        const event = await sdkStore.createAsset({
          name: 'Cosmic Beats \u2014 Dubai Arena',
          description: 'Live concert, June 15 2024',
          rightType: RightType.ACCESS,
          jurisdiction: { countryCode: 'AE' },
          issuerId: data.promoterId,
          metadata: { artist: 'Cosmic Beats', venue: 'Dubai Arena', capacity: 15000 },
        });
        setData(prev => ({ ...prev, eventId: event.id }));
        addLog(`\u2713 Asset created: ${event.name}`);
        addLog(`  ID: ${event.id}`);
        addLog(`  State: ${event.state}`);
        addLog(`  Right: ACCESS`);
        addLog(`  Capacity: 15,000`);
        addLog(`  Tiers: VIP ($500), Gold ($300), Standard ($150)`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const event = assets.find(a => a.name === 'Cosmic Beats \u2014 Dubai Arena');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-900/20 to-indigo-900/10">
              <div className="text-center mb-4">
                <p className="text-xs uppercase tracking-widest text-purple-400 mb-2">VibeTix Presents</p>
                <h3 className="text-2xl font-bold text-white">Cosmic Beats</h3>
                <p className="text-sm text-gray-400 mt-1">Dubai Arena \u2014 June 15, 2024</p>
                <p className="text-xs text-gray-600 font-mono mt-1">{event?.id || '\u2014'}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-purple-500/10 p-3 rounded-lg text-center border border-purple-500/20">
                  <p className="text-xs text-purple-300">VIP</p>
                  <p className="text-lg font-bold text-white">$500</p>
                  <p className="text-[10px] text-gray-500">1,000 seats</p>
                </div>
                <div className="bg-yellow-500/10 p-3 rounded-lg text-center border border-yellow-500/20">
                  <p className="text-xs text-yellow-300">Gold</p>
                  <p className="text-lg font-bold text-white">$300</p>
                  <p className="text-[10px] text-gray-500">4,000 seats</p>
                </div>
                <div className="bg-gray-500/10 p-3 rounded-lg text-center border border-gray-500/20">
                  <p className="text-xs text-gray-300">Standard</p>
                  <p className="text-lg font-bold text-white">$150</p>
                  <p className="text-[10px] text-gray-500">10,000 seats</p>
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>State: {event?.state || 'DRAFT'}</span>
                <span>Total Capacity: 15,000</span>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 5,
      sectionId: 'ticket-issuance',
      title: 'Create Ticket Offering',
      description: 'Configure token offering: supply, base price, and purchase limits',
      code: `const offering = {
  assetId: event.id,
  totalSupply: 15000,
  pricePerToken: 150,     // USD (base tier)
  minInvestment: 150,     // 1 ticket
  maxInvestment: 600,     // 4 tickets max
  startDate: '2024-03-01',
  endDate: '2024-06-14',
  currency: 'USD',
};
console.log('Offering configured:', offering);`,
      action: async (addLog, _setData, data) => {
        const offering = sdkStore.createOffering(data.eventId, {
          totalSupply: 15000,
          pricePerToken: 150,
          minInvestment: 150,
          maxInvestment: 600,
          currency: 'USD',
          startDate: '2024-03-01',
          endDate: '2024-06-14',
        });
        addLog(`\u2713 Offering created: ${offering.id.slice(0, 8)}`);
        addLog(`  Total supply: ${offering.totalSupply.toLocaleString()} tickets`);
        addLog(`  Base price: $${offering.pricePerToken.toLocaleString()} / ticket`);
        addLog(`  Min purchase: ${offering.minInvestment / offering.pricePerToken} ticket ($${offering.minInvestment.toLocaleString()})`);
        addLog(`  Max purchase: ${offering.maxInvestment / offering.pricePerToken} tickets ($${offering.maxInvestment.toLocaleString()})`);
        addLog(`  Sale window: ${offering.startDate} \u2013 ${offering.endDate}`);
        addLog(`  Currency: ${offering.currency}`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'Cosmic Beats \u2014 Dubai Arena');
        const offering = asset ? sdkStore.getOffering(asset.id) : null;
        const pct = offering ? (offering.soldAmount / offering.totalSupply) * 100 : 0;
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-purple-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Ticket Offering</h3>
              <div className="bg-gradient-to-r from-purple-500/10 to-indigo-500/10 p-4 rounded-xl border border-purple-500/20 mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Supply</span>
                  <span className="text-sm font-bold text-purple-400">{offering ? `${offering.soldAmount.toLocaleString()} / ${offering.totalSupply.toLocaleString()}` : '\u2014'}</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-3">
                  <div className="bg-purple-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-purple-500/10 p-2 rounded-lg border border-purple-500/20 text-center">
                  <p className="text-[10px] text-gray-500">VIP</p>
                  <p className="text-sm font-bold text-white">1,000</p>
                </div>
                <div className="bg-yellow-500/10 p-2 rounded-lg border border-yellow-500/20 text-center">
                  <p className="text-[10px] text-gray-500">Gold</p>
                  <p className="text-sm font-bold text-white">4,000</p>
                </div>
                <div className="bg-gray-500/10 p-2 rounded-lg border border-gray-500/20 text-center">
                  <p className="text-[10px] text-gray-500">Standard</p>
                  <p className="text-sm font-bold text-white">10,000</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Base Price</p>
                  <p className="text-lg font-bold text-white">${offering?.pricePerToken?.toLocaleString() || '\u2014'}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Max / Person</p>
                  <p className="text-lg font-bold text-white">4 tickets</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Sale Window</p>
                  <p className="text-sm font-bold text-white">{offering ? `${offering.startDate} \u2013 ${offering.endDate}` : '\u2014'}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Currency</p>
                  <p className="text-lg font-bold text-white">{offering?.currency || 'USD'}</p>
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
      sectionId: 'ticket-issuance',
      title: 'Deploy Ticket Token',
      description: 'Transition asset through compliance checks to ACTIVE and deploy on-chain',
      code: `await client.assets.transition(
  event.id, 'PENDING_VERIFICATION', promoter.id
);
await client.assets.transition(
  event.id, 'VERIFIED', promoter.id
);
await client.assets.transition(
  event.id, 'ACTIVE', promoter.id
);
// Token contract deployed to Base L2`,
      action: async (addLog, _setData, data) => {
        const r1 = await sdkStore.transition(data.eventId, LifecycleState.PENDING_VERIFICATION, data.promoterId);
        addLog(`\u2713 \u2192 PENDING_VERIFICATION: ${r1.success ? 'OK' : r1.error}`);

        const r2 = await sdkStore.transition(data.eventId, LifecycleState.VERIFIED, data.promoterId);
        addLog(`\u2713 \u2192 VERIFIED: ${r2.success ? 'OK' : r2.error}`);

        const r3 = await sdkStore.transition(data.eventId, LifecycleState.ACTIVE, data.promoterId);
        addLog(`\u2713 \u2192 ACTIVE: ${r3.success ? 'OK' : r3.error}`);

        const asset = sdkStore.getAsset(data.eventId);
        addLog(`  Current state: ${asset?.state}`);
        addLog(`  Token deployed to Base L2`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'Cosmic Beats \u2014 Dubai Arena');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-purple-500/20">
              <div className="flex items-center justify-between mb-4">
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
            </div>
            <div className="glass-card p-6 rounded-xl border border-white/5 bg-black/40 text-center">
              <div className="mb-6 w-full">
                <div className="w-3/4 mx-auto h-12 bg-purple-500/20 rounded-t-full border-t-4 border-purple-500 flex items-center justify-center shadow-[0_0_50px_rgba(168,85,247,0.4)]">
                  <span className="text-purple-300 font-bold tracking-widest text-sm uppercase">Stage</span>
                </div>
              </div>
              <div className="inline-block">
                <SeatSelectionMap
                  rows={8}
                  cols={12}
                  blockedSeats={['A5', 'A6', 'B2', 'C8', 'D1', 'E5']}
                  onSelect={() => {}}
                />
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // C. Ticket Operations (steps 7–9)
    // =========================================================================
    {
      id: 7,
      sectionId: 'ticket-operations',
      title: 'Onboard Fan',
      description: 'KYC verification for a fan purchasing tickets',
      code: `const fan = await client.parties.create({
  name: 'Fan Wallet',
  type: 'INDIVIDUAL',
  roles: ['INVESTOR'],
  jurisdiction: 'AE',
});
await client.parties.verifyKyc(fan.id);
// Status: VERIFIED`,
      action: async (addLog, setData) => {
        const fan = await sdkStore.createParty({
          name: 'Fan Wallet',
          type: PartyType.INDIVIDUAL,
          roles: [PartyRole.INVESTOR],
          jurisdiction: 'AE',
        });
        sdkStore.verifyKyc(fan.id);
        setData(prev => ({ ...prev, fanId: fan.id }));
        addLog(`\u2713 Created fan: Fan Wallet`);
        addLog(`  Party ID: ${fan.id}`);
        addLog(`  KYC: VERIFIED`);
        addLog(`  Jurisdiction: AE`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const fan = parties.find(p => p.name === 'Fan Wallet');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-white font-bold text-xl">FW</div>
                <div>
                  <h3 className="text-lg font-bold text-white">{fan?.name || 'Fan Wallet'}</h3>
                  <p className="text-sm text-gray-400">Individual \u2014 AE</p>
                </div>
                <div className="ml-auto px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">
                  KYC VERIFIED
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Party ID</p>
                  <p className="text-sm font-mono text-white">{fan?.id.slice(0, 12) || '\u2014'}...</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Role</p>
                  <p className="text-sm font-bold text-purple-400">INVESTOR</p>
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
      sectionId: 'ticket-operations',
      title: 'Setup Fan Wallet',
      description: 'Create and whitelist an EOA wallet for the fan',
      code: `const fanWallet = await client.wallets.create({
  owner: fan.id,
  chain: 'BASE',
  type: 'EOA',
});
await client.wallets.whitelist(fanWallet.address);
// Wallet whitelisted for ticket purchases`,
      action: async (addLog, setData, data) => {
        const wallet = sdkStore.createWallet(data.fanId, {
          chain: 'BASE',
          type: 'EOA',
          threshold: 1,
          signers: 1,
        });
        setData(prev => ({ ...prev, fanWallet: wallet.address }));
        addLog(`\u2713 Wallet created for Fan Wallet`);
        addLog(`  Address: ${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}`);
        addLog(`  Chain: ${wallet.chain} (L2)`);
        addLog(`  Type: ${wallet.type}`);
        addLog(`  Gas balance: ${wallet.balance} ETH`);
        addLog(`\u2713 Wallet whitelisted for ticket purchases`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const fan = parties.find(p => p.name === 'Fan Wallet');
        const wallet = fan ? sdkStore.getWallet(fan.id) : null;
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-900/10 to-indigo-900/5">
              <h3 className="text-lg font-bold text-white mb-4">Fan Wallet</h3>
              <div className="bg-black/30 p-4 rounded-xl border border-white/10 mb-4 font-mono text-sm">
                <p className="text-gray-500 text-xs mb-1">Address</p>
                <p className="text-purple-400">{wallet ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-4)}` : '\u2014'}</p>
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
                  <p className="text-sm font-bold text-white">{wallet?.type || 'EOA'}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="text-sm font-bold text-green-400">WHITELISTED</p>
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
      sectionId: 'ticket-operations',
      title: 'Purchase Ticket (Mint)',
      description: 'Check compliance, mint 1 ticket NFT to the fan, and earn AHOY points',
      code: `const eligible = await client.compliance.check({
  assetId: event.id,
  from: null,      // primary mint
  to: fan.id,
  amount: '1',
});
await client.assets.mint(event.id, fan.id, '1');
await client.offerings.updateSold(event.id, 1);
// AHOY: +points for TICKET_PURCHASED`,
      action: async (addLog, _setData, data) => {
        const compliance = sdkStore.checkTransferCompliance(data.eventId, data.promoterId, data.fanId, '1');
        addLog(`\u2713 Compliance check: ${compliance.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
        for (const check of compliance.checks) {
          addLog(`  ${check.name}: ${check.passed ? '\u2713' : '\u2717'} (${check.detail})`);
        }

        const mint = await sdkStore.mint(data.eventId, data.fanId, '1');
        addLog(`\u2713 Ticket minted: ${mint.success ? 'SUCCESS' : mint.error}`);

        sdkStore.updateOfferingSold(data.eventId, 1);
        const offering = sdkStore.getOffering(data.eventId);
        addLog(`  Offering sold: ${offering?.soldAmount?.toLocaleString() || '\u2014'} / ${offering?.totalSupply?.toLocaleString() || '\u2014'}`);

        const ahoy = sdkStore.simulateAhoyAction('TICKET_PURCHASED', 'CONNECT');
        addLog(`  AHOY: +${ahoy.points} (balance: ${ahoy.newBalance})`);
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5 text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center border-2 border-green-500/30">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Ticket Purchased</h3>
            <p className="text-sm text-gray-400 mb-4">1 x Standard Ticket</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Seat</p>
                <p className="text-lg font-bold text-white">C7</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Cost</p>
                <p className="text-lg font-bold text-white">$150</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">AHOY</p>
                <p className="text-lg font-bold text-purple-400">+50</p>
              </div>
            </div>
            <div className="mt-4 bg-white/5 p-3 rounded-xl border border-white/10 text-left">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <span className="text-gray-500">Event</span><span className="text-white font-bold">Cosmic Beats</span>
                <span className="text-gray-500">Venue</span><span className="text-white font-bold">Dubai Arena</span>
                <span className="text-gray-500">Date</span><span className="text-white font-bold">June 15, 2024</span>
                <span className="text-gray-500">QR Code</span><span className="text-purple-400 font-mono text-xs">0x7a3f...8e21</span>
              </div>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },

    // =========================================================================
    // D. Secondary Market (steps 10–14)
    // =========================================================================
    {
      id: 10,
      sectionId: 'secondary-market',
      title: 'Dynamic Pricing Update',
      description: 'Oracle updates ticket prices based on demand — Standard tier sold out, prices adjusted',
      code: `// Oracle monitors demand and adjusts pricing
await client.oracle.update(event.id, {
  type: 'DEMAND_PRICING',
  standardSoldPct: 95,
  goldSoldPct: 78,
  vipSoldPct: 45,
  demandMultiplier: 1.25,
  adjustedPrices: {
    Standard: 187.50,  // +25%
    Gold: 337.50,      // +12.5%
    VIP: 500,          // no change
  }
});

// Update offering with new prices
await client.offerings.updatePricing(event.id, {
  basePrice: 187.50,
  dynamicPricing: true,
});`,
      action: async (addLog, setData, data) => {
        addLog(`✓ Demand oracle triggered`);
        addLog(`  Monitoring ticket sales velocity...`);

        addLog(`✓ Sales analysis complete`);
        addLog(`  Standard tier: 95% sold (HIGH DEMAND)`);
        addLog(`  Gold tier: 78% sold (MODERATE)`);
        addLog(`  VIP tier: 45% sold (NORMAL)`);

        addLog(`✓ Dynamic pricing adjustment`);
        addLog(`  Demand multiplier: 1.25x`);
        addLog(`  Standard: $150 → $187.50 (+25%)`);
        addLog(`  Gold: $300 → $337.50 (+12.5%)`);
        addLog(`  VIP: $500 (unchanged)`);

        sdkStore.triggerOracleUpdate(data.eventId, {
          demandMultiplier: 1.25,
          standardPrice: 187.50,
          goldPrice: 337.50,
          vipPrice: 500,
          standardSold: 9500,
          goldSold: 3120,
          vipSold: 450,
        });

        addLog(`✓ On-chain price update confirmed`);
        addLog(`  Transaction: 0x8b2e...4f19`);
      },
      render: () => {
        const tiers = [
          { name: 'Standard', original: 150, current: 187.50, sold: 9500, total: 10000, change: '+25%', color: 'gray' },
          { name: 'Gold', original: 300, current: 337.50, sold: 3120, total: 4000, change: '+12.5%', color: 'yellow' },
          { name: 'VIP', original: 500, current: 500, sold: 450, total: 1000, change: '—', color: 'purple' },
        ];

        return (
          <div className="space-y-4">
            <div className="p-4 bg-purple-500/10 rounded-xl border border-purple-500/30 text-center">
              <p className="text-sm font-bold text-purple-400">DYNAMIC PRICING ACTIVE</p>
              <p className="text-xs text-gray-400 mt-1">Prices adjust based on real-time demand</p>
            </div>

            <div className="glass-card p-6 rounded-xl border border-purple-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Demand-Based Pricing</h3>

              <div className="space-y-4">
                {tiers.map(tier => {
                  const pct = (tier.sold / tier.total) * 100;
                  const isHighDemand = pct >= 90;

                  return (
                    <div key={tier.name} className="bg-white/5 p-4 rounded-xl border border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full bg-${tier.color}-500`} />
                          <span className="text-sm font-bold text-white">{tier.name}</span>
                          {isHighDemand && (
                            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[10px] font-bold rounded border border-red-500/30">
                              HIGH DEMAND
                            </span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-white">${tier.current}</span>
                          {tier.change !== '—' && (
                            <span className="text-xs text-green-400 ml-2">{tier.change}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full bg-${tier.color}-500 transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{tier.sold.toLocaleString()} / {tier.total.toLocaleString()} sold</span>
                        <span className="text-gray-600">was ${tier.original}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Demand Multiplier</span>
                  <span className="text-sm font-bold text-purple-400">1.25x</span>
                </div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 11,
      sectionId: 'secondary-market',
      title: 'Onboard Buyer',
      description: 'KYC a second fan for secondary market ticket purchase',
      code: `const buyer = await client.parties.create({
  name: 'Sarah Kim',
  type: 'INDIVIDUAL',
  roles: ['INVESTOR'],
  jurisdiction: 'KR',
});
await client.parties.verifyKyc(buyer.id);`,
      action: async (addLog, setData) => {
        const buyer = await sdkStore.createParty({
          name: 'Sarah Kim',
          type: PartyType.INDIVIDUAL,
          roles: [PartyRole.INVESTOR],
          jurisdiction: 'KR',
        });
        sdkStore.verifyKyc(buyer.id);
        setData(prev => ({ ...prev, buyerId: buyer.id }));
        addLog(`\u2713 Created buyer: Sarah Kim`);
        addLog(`  Party ID: ${buyer.id}`);
        addLog(`  KYC: VERIFIED`);
        addLog(`  Jurisdiction: KR`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const fan = parties.find(p => p.name === 'Fan Wallet');
        const buyer = parties.find(p => p.name === 'Sarah Kim');
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-2">Verified Ticket Holders</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { name: 'Fan Wallet', initials: 'FW', jurisdiction: 'AE', party: fan, gradient: 'from-purple-400 to-indigo-600' },
                { name: 'Sarah Kim', initials: 'SK', jurisdiction: 'KR', party: buyer, gradient: 'from-pink-400 to-rose-600' },
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
      id: 12,
      sectionId: 'secondary-market',
      title: 'Compliance Check',
      description: 'Verify resale compliance: KYC, jurisdiction, price cap, and ticket limits',
      code: `const eligible = await client.compliance.check({
  assetId: event.id,
  from: fan.id,
  to: buyer.id,
  amount: '1',
});
// KYC \u2713, Jurisdiction \u2713, Price Cap \u2713, Limit \u2713`,
      action: async (addLog, setData, data) => {
        const result = sdkStore.checkTransferCompliance(data.eventId, data.fanId, data.buyerId, '1');
        setData(prev => ({ ...prev, complianceResult: JSON.stringify(result) }));
        addLog(`\u2713 Compliance check: ${result.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
        for (const check of result.checks) {
          addLog(`  ${check.name}: ${check.passed ? '\u2713' : '\u2717'} (${check.detail})`);
        }
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const asset = assets.find(a => a.name === 'Cosmic Beats \u2014 Dubai Arena');
        const parties = sdkStore.getParties();
        const fan = parties.find(p => p.name === 'Fan Wallet');
        const buyer = parties.find(p => p.name === 'Sarah Kim');
        const result = asset && fan && buyer
          ? sdkStore.checkTransferCompliance(asset.id, fan.id, buyer.id, '1')
          : null;
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-2">Transfer Eligibility</h3>
            <div className="space-y-2">
              {(result?.checks || []).map(check => (
                <div key={check.name} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${check.passed ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                    {check.passed ? '\u2713' : '\u2717'}
                  </div>
                  <span className={`text-sm ${check.passed ? 'text-green-400' : 'text-red-400'}`}>{check.name}</span>
                  <span className="text-xs text-gray-500 ml-auto">{check.detail}</span>
                </div>
              ))}
            </div>
            <div className={`p-3 rounded-lg border text-center ${result?.eligible ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <span className={`text-sm font-bold ${result?.eligible ? 'text-green-400' : 'text-red-400'}`}>
                {result?.eligible ? 'All checks passed \u2014 Resale eligible' : 'Transfer not eligible'}
              </span>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 13,
      sectionId: 'secondary-market',
      title: 'Execute Resale',
      description: 'Transfer ticket from Fan to Sarah Kim with 5% royalty to promoter',
      code: `await client.assets.transfer(
  event.id,
  fan.id,      // from: Fan Wallet
  buyer.id,    // to: Sarah Kim
  '1'
);
// 5% royalty to promoter
// AHOY: +points for TICKET_RESOLD`,
      action: async (addLog, _setData, data) => {
        const result = await sdkStore.transfer(data.eventId, data.fanId, data.buyerId, '1');
        addLog(`\u2713 Transfer: ${result.success ? 'SUCCESS' : result.error}`);

        const balances = await sdkStore.getBalances(data.eventId);
        addLog(`  Updated balances:`);
        for (const [pid, bal] of Object.entries(balances)) {
          const p = sdkStore.getParty(pid);
          addLog(`    ${p?.name || pid.slice(0, 8)}: ${bal} ticket(s)`);
        }

        addLog(`  Royalty: 5% ($7.50) \u2192 VibeTix Promotions`);

        const ahoy = sdkStore.simulateAhoyAction('TICKET_RESOLD', 'CONNECT');
        addLog(`  AHOY: +${ahoy.points} (balance: ${ahoy.newBalance})`);
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-purple-500/20">
            <h3 className="text-lg font-bold text-white mb-4">Secondary Market Transfer</h3>
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-white text-sm font-bold mb-2">FW</div>
                <p className="text-sm font-bold text-white">Fan Wallet</p>
                <p className="text-xs text-gray-500">0 tickets</p>
              </div>
              <div className="flex flex-col items-center gap-1 text-xs text-gray-500">
                <span>NFT \u2192</span>
                <div className="w-12 h-px bg-purple-500/50" />
              </div>
              <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-pink-400 to-rose-600 flex items-center justify-center text-white text-sm font-bold mb-2">SK</div>
                <p className="text-sm font-bold text-white">Sarah Kim</p>
                <p className="text-xs text-gray-500">1 ticket</p>
              </div>
            </div>
            <div className="bg-purple-500/10 p-3 rounded-lg border border-purple-500/20 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Royalty (5%)</span>
                <span className="text-sm font-bold text-purple-400">$7.50 \u2192 VibeTix Promotions</span>
              </div>
            </div>
            <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20 text-center">
              <span className="text-sm font-bold text-green-400">Resale Complete</span>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },

    {
      id: 14,
      sectionId: 'secondary-market',
      title: 'VIP Ticket Upgrade',
      description: 'Sarah Kim upgrades her Standard ticket to VIP — pays difference with discount',
      code: `// Check VIP availability and upgrade eligibility
const vipAvailable = await client.inventory.check(
  event.id, 'VIP'
);
const upgradePrice = 500 - 150; // VIP - Standard
const loyaltyDiscount = 0.10;   // 10% AHOY discount

// Process upgrade
await client.tickets.upgrade({
  eventId: event.id,
  holderId: buyer.id,
  fromTier: 'STANDARD',
  toTier: 'VIP',
  price: upgradePrice * (1 - loyaltyDiscount),
});

// Burn old ticket, mint new VIP ticket
await client.assets.burn(event.id, buyer.id, '1');
await client.assets.mint(event.id, buyer.id, '1', {
  tier: 'VIP',
  seat: 'VIP-A12',
});`,
      action: async (addLog, setData, data) => {
        addLog(`✓ Checking VIP upgrade eligibility`);
        addLog(`  Current ticket: Standard ($150)`);
        addLog(`  Target tier: VIP ($500)`);

        addLog(`✓ VIP inventory check`);
        addLog(`  VIP seats available: 550 / 1,000`);
        addLog(`  Upgrade available: YES`);

        const baseUpgrade = 500 - 150;
        const discount = baseUpgrade * 0.10;
        const finalPrice = baseUpgrade - discount;

        addLog(`✓ AHOY loyalty discount applied`);
        addLog(`  Base upgrade: $${baseUpgrade}`);
        addLog(`  AHOY discount (10%): -$${discount}`);
        addLog(`  Final price: $${finalPrice}`);

        addLog(`✓ Processing upgrade...`);
        addLog(`  Burning Standard ticket token`);
        addLog(`  Minting VIP ticket token`);

        const ahoy = sdkStore.simulateAhoyAction('TICKET_UPGRADE', 'CONNECT');
        addLog(`✓ Upgrade complete!`);
        addLog(`  New seat: VIP-A12 (Front Row)`);
        addLog(`  AHOY: +${ahoy.points} points (balance: ${ahoy.newBalance})`);

        setData(prev => ({ ...prev, ticketTier: 'VIP', seat: 'VIP-A12' }));
      },
      render: () => {
        const ahoy = sdkStore.getAhoyState();

        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-purple-500/20">
              <h3 className="text-lg font-bold text-white mb-4">VIP Upgrade</h3>

              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1 p-4 bg-gray-500/10 rounded-xl border border-gray-500/20 text-center">
                  <p className="text-xs text-gray-400">From</p>
                  <p className="text-sm font-bold text-white">Standard</p>
                  <p className="text-xs text-gray-500">$150</p>
                </div>
                <div className="text-purple-400 text-2xl">→</div>
                <div className="flex-1 p-4 bg-purple-500/10 rounded-xl border border-purple-500/20 text-center">
                  <p className="text-xs text-purple-300">Upgraded To</p>
                  <p className="text-sm font-bold text-white">VIP</p>
                  <p className="text-xs text-purple-400">$500</p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                  <span className="text-sm text-gray-300">Base Upgrade Cost</span>
                  <span className="text-sm font-bold text-white">$350.00</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <span className="text-sm text-gray-300">AHOY Discount (10%)</span>
                  <span className="text-sm font-bold text-amber-400">-$35.00</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                  <span className="text-sm font-bold text-white">Total Paid</span>
                  <span className="text-lg font-bold text-purple-400">$315.00</span>
                </div>
              </div>

              <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/20 text-center mb-4">
                <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30">
                  <span className="text-green-400 text-xl">✓</span>
                </div>
                <p className="text-sm font-bold text-green-400">Upgrade Complete!</p>
                <p className="text-xs text-gray-400 mt-1">New seat: VIP-A12 (Front Row)</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">VIP Benefits</p>
                  <ul className="text-xs text-white mt-1 space-y-0.5">
                    <li>• Front row seating</li>
                    <li>• Backstage access</li>
                    <li>• Meet & greet</li>
                  </ul>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">AHOY Rewards</p>
                  <p className="text-lg font-bold text-amber-400">+75 pts</p>
                  <p className="text-xs text-gray-500">Balance: {ahoy.balance}</p>
                </div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // E. Gate Validation (steps 15–16)
    // =========================================================================
    {
      id: 15,
      sectionId: 'gate-validation',
      title: 'Scan Ticket',
      description: 'Verify on-chain balance to validate ticket at the gate',
      code: `const balances = await client.assets.getBalances(
  event.id
);
// Verify Sarah Kim holds 1 ticket
const valid = balances[buyer.id] === '1';
const metadata = await client.assets.getMetadata(
  event.id
);
console.log('Access:', valid ? 'GRANTED' : 'DENIED');`,
      action: async (addLog, _setData, data) => {
        const balances = await sdkStore.getBalances(data.eventId);
        const buyerBal = balances[data.buyerId];
        addLog(`\u2713 Gate scan: checking balances`);
        addLog(`  Sarah Kim balance: ${buyerBal}`);
        addLog(`  Valid ticket: ${buyerBal === '1' ? 'YES \u2713' : 'NO \u2717'}`);

        const asset = sdkStore.getAsset(data.eventId);
        addLog(`  Event: ${asset?.name}`);
        addLog(`  State: ${asset?.state}`);
        addLog(`  Access: ${buyerBal === '1' ? 'GRANTED' : 'DENIED'}`);
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5 text-center">
            <div className="w-24 h-24 mx-auto mb-4 rounded-2xl bg-white/10 border-2 border-green-500/30 flex items-center justify-center relative">
              <svg className="w-12 h-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full animate-pulse" />
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Ticket Validated</h3>
            <p className="text-sm text-green-400 mb-4">On-chain balance verified</p>
            <div className="inline-block p-4 bg-white/5 rounded-xl border border-white/10 text-left w-full max-w-sm">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <span className="text-gray-500">Owner</span><span className="text-white font-bold">Sarah Kim</span>
                <span className="text-gray-500">Event</span><span className="text-white font-bold">Cosmic Beats</span>
                <span className="text-gray-500">Venue</span><span className="text-white font-bold">Dubai Arena</span>
                <span className="text-gray-500">Date</span><span className="text-white font-bold">June 15, 2024</span>
                <span className="text-gray-500">Balance</span><span className="text-white font-bold">1 ticket</span>
                <span className="text-gray-500">Status</span><span className="text-green-400 font-bold">ACCESS GRANTED</span>
              </div>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 16,
      sectionId: 'gate-validation',
      title: 'Mark Attendance',
      description: 'Record scan timestamp, gate number, and update attendance oracle',
      code: `await client.assets.setMetadata(event.id, {
  scanTimestamp: new Date().toISOString(),
  gateNumber: 'Gate B2',
  scannedBy: 'SCANNER-042',
});
await client.oracles.update(event.id, {
  type: 'ATTENDANCE',
  scanned: 1,
  total: 15000,
});`,
      action: async (addLog, _setData, data) => {
        const timestamp = new Date().toISOString();
        addLog(`\u2713 Attendance recorded`);
        addLog(`  Scan time: ${timestamp}`);
        addLog(`  Gate: B2`);
        addLog(`  Scanner: SCANNER-042`);
        addLog(`  Holder: Sarah Kim`);

        addLog(`\u2713 Oracle updated`);
        addLog(`  Attendance: 1 / 15,000 scanned`);
        addLog(`  Event status: IN_PROGRESS`);
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-purple-500/20 text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-purple-500/20 flex items-center justify-center border-2 border-purple-500/30">
              <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Attendance Confirmed</h3>
            <p className="text-sm text-gray-400 mb-4">Sarah Kim checked in at Gate B2</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Gate</p>
                <p className="text-lg font-bold text-white">B2</p>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Scanner</p>
                <p className="text-lg font-bold text-white">042</p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-purple-500/10 to-indigo-500/10 p-4 rounded-xl border border-purple-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">Scanned / Total</span>
                <span className="text-sm font-bold text-purple-400">1 / 15,000</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-3">
                <div className="bg-purple-500 h-3 rounded-full transition-all" style={{ width: '0.01%', minWidth: '4px' }} />
              </div>
              <p className="text-xs text-gray-500 mt-2 text-right">0.01% scanned</p>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },

    // =========================================================================
    // F. Settlement (steps 17–18)
    // =========================================================================
    {
      id: 17,
      sectionId: 'settlement',
      title: 'Revenue Settlement',
      description: 'Compute and distribute revenue split: Promoter, Venue, Artist, Platform',
      code: `const settlement = await client.settlements.create({
  assetId: event.id,
  totalRevenue: 2250000, // $2.25M total ticket sales
  splits: [
    { party: 'Promoter',  pct: 40 },
    { party: 'Venue',     pct: 30 },
    { party: 'Artist',    pct: 25 },
    { party: 'Platform',  pct: 5  },
  ],
});
console.log('Settlement:', settlement);`,
      action: async (addLog, _setData, data) => {
        const totalRevenue = 2250000;
        const splits = [
          { party: 'VibeTix Promotions', pct: 40 },
          { party: 'Dubai Arena (Venue)', pct: 30 },
          { party: 'Cosmic Beats (Artist)', pct: 25 },
          { party: 'Platform Fee', pct: 5 },
        ];
        addLog(`\u2713 Revenue settlement computed`);
        addLog(`  Total revenue: $${totalRevenue.toLocaleString()}`);
        for (const split of splits) {
          const amount = totalRevenue * (split.pct / 100);
          addLog(`  ${split.party}: ${split.pct}% \u2192 $${amount.toLocaleString()}`);
        }
        addLog(`  Settlement status: COMPLETED`);
      },
      render: () => {
        const totalRevenue = 2250000;
        const splits = [
          { party: 'Promoter', pct: 40, amount: 900000, color: 'purple' },
          { party: 'Venue', pct: 30, amount: 675000, color: 'blue' },
          { party: 'Artist', pct: 25, amount: 562500, color: 'pink' },
          { party: 'Platform', pct: 5, amount: 112500, color: 'gray' },
        ];
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-purple-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Revenue Settlement</h3>
              <div className="bg-purple-500/10 p-3 rounded-lg border border-purple-500/20 text-center mb-4">
                <p className="text-xs text-gray-500">Total Ticket Revenue</p>
                <p className="text-2xl font-bold text-purple-400">${(totalRevenue / 1e6).toFixed(2)}M</p>
              </div>
              <div className="mb-4">
                <div className="flex w-full h-6 rounded-full overflow-hidden">
                  <div className="bg-purple-500 h-full" style={{ width: '40%' }} />
                  <div className="bg-blue-500 h-full" style={{ width: '30%' }} />
                  <div className="bg-pink-500 h-full" style={{ width: '25%' }} />
                  <div className="bg-gray-500 h-full" style={{ width: '5%' }} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2 text-xs text-gray-500 px-3">
                  <span>Party</span><span className="text-right">Share</span><span className="text-right">Amount</span><span className="text-right">Status</span>
                </div>
                {splits.map(s => (
                  <div key={s.party} className="grid grid-cols-4 gap-2 p-3 bg-white/5 rounded-lg border border-white/5 items-center">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full bg-${s.color}-500`} />
                      <span className="text-sm text-white">{s.party}</span>
                    </div>
                    <span className="text-sm text-gray-400 text-right">{s.pct}%</span>
                    <span className="text-sm font-bold text-white text-right">${s.amount.toLocaleString()}</span>
                    <span className="text-xs text-green-400 text-right font-bold">PAID</span>
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
      id: 18,
      sectionId: 'settlement',
      title: 'Redeem & Close',
      description: 'Redeem event tokens, finalize settlement, and close the event lifecycle',
      code: `await client.assets.transition(
  event.id, 'REDEEMED', promoter.id
);
// Event concluded, tokens redeemed

const events = await client.events.list(event.id);
console.log('Total events:', events.length);
// AHOY: +points for EVENT_SETTLED`,
      action: async (addLog, _setData, data) => {
        const result = await sdkStore.transition(data.eventId, LifecycleState.REDEEMED, data.promoterId);
        addLog(`\u2713 \u2192 REDEEMED: ${result.success ? 'OK' : result.error}`);
        const asset = sdkStore.getAsset(data.eventId);
        addLog(`  Final state: ${asset?.state}`);

        const ahoy = sdkStore.simulateAhoyAction('EVENT_SETTLED', 'CONNECT');
        addLog(`  AHOY: +${ahoy.points} (balance: ${ahoy.newBalance})`);

        const events = sdkStore.getEvents(data.eventId);
        addLog(`  Total events on asset: ${events.length}`);

        const parties = sdkStore.getParties();
        addLog(`  Total parties: ${parties.length}`);
        addLog(`  Settlement: COMPLETE`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const event = assets.find(a => a.name === 'Cosmic Beats \u2014 Dubai Arena');
        const ahoy = sdkStore.getAhoyState();
        const allParties = sdkStore.getParties();
        const events = event ? sdkStore.getEvents(event.id) : [];
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-purple-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Event Settlement Complete</h3>
              <div className="bg-white/5 p-4 rounded-xl border border-white/5 mb-4 text-center">
                <p className="text-xs text-gray-500">Event State</p>
                <p className="text-2xl font-bold text-purple-400">{event?.state || '\u2014'}</p>
                <p className="text-xs text-gray-500 font-mono mt-1">{event?.id || '\u2014'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Total Parties</p>
                  <p className="text-sm font-bold text-white">{allParties.length}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Audit Events</p>
                  <p className="text-sm font-bold text-white">{events.length}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">AHOY Balance</p>
                  <p className="text-sm font-bold text-purple-400">{ahoy.balance}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Tier</p>
                  <p className="text-sm font-bold text-white">{ahoy.tier}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Lifetime Earned</p>
                  <p className="text-sm font-bold text-green-400">{ahoy.lifetimeEarned}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Revenue</p>
                  <p className="text-sm font-bold text-purple-400">$2.25M</p>
                </div>
              </div>
              <div className="mt-4 text-center">
                <span className="px-4 py-1.5 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">SETTLEMENT COMPLETE</span>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
  ],
};
