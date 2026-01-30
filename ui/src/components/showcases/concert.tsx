import { Music } from 'lucide-react';
import { SeatSelectionMap } from '@tokenisation/sdk/components';
import { sdkStore } from '../../store';
import { RightType, PartyType, PartyRole, LifecycleState } from '../../types';
import type { ShowcaseConfig } from './types';

export const concertShowcase: ShowcaseConfig = {
  id: 'concert',
  name: 'Concert Ticket Tokenisation',
  shortName: 'Concert',
  description: 'NFT event tickets with secondary market and gate validation',
  color: 'purple',
  icon: <Music className="w-5 h-5" />,
  sections: [{ id: 'default', label: 'Steps' }],
  steps: [
    {
      id: 1,
      sectionId: 'default',
      title: 'Create Event Asset',
      description: 'Register concert event on-chain',
      code: `const event = await client.assets.create({
  name: 'Cosmic Beats — Dubai Arena',
  rightType: 'ACCESS',
  jurisdiction: { countryCode: 'AE' },
  metadata: {
    artist: 'Cosmic Beats',
    venue: 'Dubai Arena',
    date: '2024-06-15',
    capacity: 15000
  }
});`,
      action: async (addLog, setData) => {
        const promoter = await sdkStore.createParty({
          name: 'VibeTix Promotions',
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER],
          jurisdiction: 'AE',
        });
        sdkStore.verifyKyc(promoter.id);
        addLog(`✓ Promoter: VibeTix Promotions (${promoter.id.slice(0, 8)})`);

        const event = await sdkStore.createAsset({
          name: 'Cosmic Beats — Dubai Arena',
          description: 'Live concert, June 15 2024',
          rightType: RightType.ACCESS,
          jurisdiction: { countryCode: 'AE' },
          issuerId: promoter.id,
          metadata: { artist: 'Cosmic Beats', venue: 'Dubai Arena', capacity: 15000 },
        });
        setData(prev => ({ ...prev, promoterId: promoter.id, eventId: event.id }));
        addLog(`✓ Event: ${event.name} (${event.id.slice(0, 8)})`);
        addLog(`  State: ${event.state}`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const event = assets.find(a => a.name === 'Cosmic Beats — Dubai Arena');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-900/20 to-indigo-900/10">
              <div className="text-center mb-4">
                <p className="text-xs uppercase tracking-widest text-purple-400 mb-2">VibeTix Presents</p>
                <h3 className="text-2xl font-bold text-white">Cosmic Beats</h3>
                <p className="text-sm text-gray-400 mt-1">Dubai Arena — June 15, 2024</p>
                <p className="text-xs text-gray-600 font-mono mt-1">{event?.id || '—'}</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[['VIP', '$500', 'purple'], ['Gold', '$300', 'yellow'], ['Standard', '$150', 'gray']].map(([tier, price, color]) => (
                  <div key={tier} className={`bg-${color}-500/10 p-3 rounded-lg text-center border border-${color}-500/20`}>
                    <p className={`text-xs text-${color}-300`}>{tier}</p>
                    <p className="text-lg font-bold text-white">{price}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between text-xs text-gray-500">
                <span>State: {event?.state || 'DRAFT'}</span>
                <span>Capacity: 15,000</span>
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
      title: 'Issue Ticket NFTs',
      description: 'Deploy event token and mint ticket',
      code: `await client.assets.transition(
  event.id, 'PENDING_VERIFICATION', promoter.id
);
await client.assets.transition(
  event.id, 'VERIFIED', promoter.id
);
await client.assets.transition(
  event.id, 'ACTIVE', promoter.id
);

const fan = await client.parties.create({
  name: 'Fan Wallet', type: 'INDIVIDUAL',
  roles: ['INVESTOR'], jurisdiction: 'AE'
});
await client.assets.mint(event.id, fan.id, '1');`,
      action: async (addLog, setData, data) => {
        await sdkStore.transition(data.eventId, LifecycleState.PENDING_VERIFICATION, data.promoterId);
        await sdkStore.transition(data.eventId, LifecycleState.VERIFIED, data.promoterId);
        await sdkStore.transition(data.eventId, LifecycleState.ACTIVE, data.promoterId);
        const event = sdkStore.getAsset(data.eventId);
        addLog(`✓ Event state: ${event?.state}`);

        const fan = await sdkStore.createParty({
          name: 'Fan Wallet',
          type: PartyType.INDIVIDUAL,
          roles: [PartyRole.INVESTOR],
          jurisdiction: 'AE',
        });
        sdkStore.verifyKyc(fan.id);
        setData(prev => ({ ...prev, fanId: fan.id }));
        addLog(`✓ Fan: ${fan.id.slice(0, 8)}`);

        const mint = await sdkStore.mint(data.eventId, fan.id, '1');
        addLog(`✓ Ticket minted: ${mint.success ? 'SUCCESS' : mint.error}`);

        const ahoy = sdkStore.simulateAhoyAction('TICKET_PURCHASED', 'CONNECT');
        addLog(`  AHOY: +${ahoy.points}`);
      },
      render: () => (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white">Select Your Seat</h3>
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
      ),
      completed: false,
    },
    {
      id: 3,
      sectionId: 'default',
      title: 'Transfer on Secondary Market',
      description: 'Transfer ticket NFT to buyer',
      code: `const buyer = await client.parties.create({
  name: 'Sarah Kim', type: 'INDIVIDUAL',
  roles: ['INVESTOR'], jurisdiction: 'KR'
});
await client.parties.verifyKyc(buyer.id);
await client.assets.transfer(
  event.id, fan.id, buyer.id, '1'
);`,
      action: async (addLog, setData, data) => {
        const buyer = await sdkStore.createParty({
          name: 'Sarah Kim',
          type: PartyType.INDIVIDUAL,
          roles: [PartyRole.INVESTOR],
          jurisdiction: 'KR',
        });
        sdkStore.verifyKyc(buyer.id);
        setData(prev => ({ ...prev, buyerId: buyer.id }));
        addLog(`✓ Buyer: Sarah Kim (${buyer.id.slice(0, 8)})`);

        const result = await sdkStore.transfer(data.eventId, data.fanId, buyer.id, '1');
        addLog(`✓ Transfer: ${result.success ? 'SUCCESS' : result.error}`);

        const balances = await sdkStore.getBalances(data.eventId);
        for (const [pid, bal] of Object.entries(balances)) {
          const p = sdkStore.getParty(pid);
          addLog(`  ${p?.name || pid.slice(0, 8)}: ${bal}`);
        }
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-purple-500/20">
            <h3 className="text-lg font-bold text-white mb-4">Secondary Market Transfer</h3>
            <div className="flex items-center gap-4">
              <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center text-white text-sm font-bold mb-2">FN</div>
                <p className="text-sm font-bold text-white">Fan Wallet</p>
                <p className="text-xs text-gray-500">Seller</p>
              </div>
              <div className="flex flex-col items-center gap-1 text-xs text-gray-500">
                <span>NFT →</span>
                <div className="w-12 h-px bg-purple-500/50" />
              </div>
              <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-pink-400 to-rose-600 flex items-center justify-center text-white text-sm font-bold mb-2">SK</div>
                <p className="text-sm font-bold text-white">Sarah Kim</p>
                <p className="text-xs text-gray-500">Buyer</p>
              </div>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 4,
      sectionId: 'default',
      title: 'Verify at Gate',
      description: 'Validate ticket ownership on-chain',
      code: `const balances = await client.assets.getBalances(
  event.id
);
// Verify Sarah Kim holds 1 ticket
const valid = balances[buyer.id] === '1';`,
      action: async (addLog, _setData, data) => {
        const balances = await sdkStore.getBalances(data.eventId);
        const buyerBal = balances[data.buyerId];
        addLog(`✓ Gate scan: checking balances`);
        addLog(`  Sarah Kim balance: ${buyerBal}`);
        addLog(`  Valid ticket: ${buyerBal === '1' ? 'YES ✓' : 'NO ✗'}`);
        addLog(`  Access: ${buyerBal === '1' ? 'GRANTED' : 'DENIED'}`);
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5 text-center">
            <div className="w-24 h-24 mx-auto mb-4 rounded-2xl bg-white/10 border-2 border-green-500/30 flex items-center justify-center">
              <svg className="w-12 h-12 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-1">Ticket Validated</h3>
            <p className="text-sm text-green-400 mb-4">On-chain balance verified</p>
            <div className="inline-block p-4 bg-white/5 rounded-xl border border-white/10 text-left">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <span className="text-gray-500">Owner</span><span className="text-white font-bold">Sarah Kim</span>
                <span className="text-gray-500">Event</span><span className="text-white font-bold">Cosmic Beats</span>
                <span className="text-gray-500">Status</span><span className="text-green-400 font-bold">ACCESS GRANTED</span>
              </div>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 5,
      sectionId: 'default',
      title: 'Post-Event Settlement',
      description: 'Redeem event token, finalize',
      code: `await client.assets.transition(
  event.id, 'REDEEMED', promoter.id
);
// Event concluded, tokens redeemed`,
      action: async (addLog, _setData, data) => {
        const result = await sdkStore.transition(data.eventId, LifecycleState.REDEEMED, data.promoterId);
        addLog(`✓ → REDEEMED: ${result.success ? 'OK' : result.error}`);
        const asset = sdkStore.getAsset(data.eventId);
        addLog(`  Final state: ${asset?.state}`);

        const events = sdkStore.getEvents(data.eventId);
        addLog(`  Total events on asset: ${events.length}`);

        const ahoy = sdkStore.simulateAhoyAction('EVENT_SETTLED', 'CONNECT');
        addLog(`  AHOY: +${ahoy.points} (balance: ${ahoy.newBalance})`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const event = assets.find(a => a.name === 'Cosmic Beats — Dubai Arena');
        const ahoy = sdkStore.getAhoyState();
        const allParties = sdkStore.getParties();
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-purple-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Event Settlement</h3>
              <div className="bg-white/5 p-4 rounded-xl border border-white/5 mb-4 text-center">
                <p className="text-xs text-gray-500">Event State</p>
                <p className="text-2xl font-bold text-purple-400">{event?.state || '—'}</p>
                <p className="text-xs text-gray-500 font-mono mt-1">{event?.id || '—'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Total Parties</p>
                  <p className="text-sm font-bold text-white">{allParties.length}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">AHOY Balance</p>
                  <p className="text-sm font-bold text-amber-400">{ahoy.balance}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Tier</p>
                  <p className="text-sm font-bold text-white">{ahoy.tier}</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Lifetime Earned</p>
                  <p className="text-sm font-bold text-green-400">{ahoy.lifetimeEarned}</p>
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
