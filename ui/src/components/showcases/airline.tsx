import { Plane } from 'lucide-react';
import { sdkStore } from '../../store';
import { useSDKStore } from '../../core/store';
import { RightType, PartyType, PartyRole, LifecycleState, isKycVerified } from '../../types';
import type { ShowcaseConfig } from './types';

export const airlineShowcase: ShowcaseConfig = {
  id: 'airline',
  name: 'Airline Ticket Tokenisation',
  shortName: 'Airline',
  description: 'Tokenized flight tickets with insurance, disruption handling, and secondary transfers',
  color: 'sky',
  icon: <Plane className="w-5 h-5" />,
  sections: [
    { id: 'partner-onboarding', label: 'A. Partner Onboarding' },
    { id: 'ticket-issuance', label: 'B. Ticket Issuance' },
    { id: 'end-user', label: 'C. End User Experience' },
    { id: 'flight-status', label: 'D. Flight Status Updates' },
    { id: 'refund-disruption', label: 'E. Refund & Disruption' },
    { id: 'ticket-transfer', label: 'F. Ticket Transfer' },
    { id: 'flight-oracle', label: 'G. Flight Oracle (Amadeus)' },
  ],
  steps: [
    // =========================================================================
    // A. Partner Onboarding (steps 1–3)
    // =========================================================================
    {
      id: 1,
      sectionId: 'partner-onboarding',
      title: 'Configure Airline',
      description: 'Register AHOY Airways as an issuing organization',
      code: `const airline = await client.parties.create({
  name: 'AHOY Airways',
  type: 'ORGANIZATION',
  roles: ['ISSUER', 'VERIFIER'],
  jurisdiction: 'AE',
  metadata: {
    iataCode: 'AH',
    fleet: 42,
    hubs: ['DXB', 'LHR', 'SIN']
  }
});`,
      action: async (addLog, setData) => {
        const airline = await sdkStore.createParty({
          name: 'AHOY Airways',
          type: PartyType.ORGANIZATION,
          roles: [PartyRole.ISSUER, PartyRole.VERIFIER],
          jurisdiction: 'AE',
        });
        sdkStore.verifyKyc(airline.id);
        setData(prev => ({ ...prev, airlineId: airline.id }));
        addLog(`✓ Airline registered: AHOY Airways`);
        addLog(`  Party ID: ${airline.id}`);
        addLog(`  IATA Code: AH`);
        addLog(`  Roles: ISSUER, VERIFIER`);
        addLog(`  Fleet: 42 aircraft`);
        addLog(`  Hubs: DXB, LHR, SIN`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const airline = parties.find(p => p.name === 'AHOY Airways');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-900/10 to-blue-900/5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg">AH</div>
                <div>
                  <h3 className="text-lg font-bold text-white">AHOY Airways</h3>
                  <p className="text-sm text-gray-400">Premium International Carrier</p>
                </div>
                <div className="ml-auto px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">
                  {isKycVerified(airline) ? 'VERIFIED' : 'PENDING'}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5 text-center">
                  <p className="text-xs text-gray-500">IATA</p>
                  <p className="text-lg font-bold text-sky-400">AH</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5 text-center">
                  <p className="text-xs text-gray-500">Fleet</p>
                  <p className="text-lg font-bold text-white">42</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5 text-center">
                  <p className="text-xs text-gray-500">Hubs</p>
                  <p className="text-sm font-bold text-white">DXB LHR SIN</p>
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
      title: 'Setup Flight Oracle',
      description: 'Configure real-time flight data oracle and store config on-chain',
      code: `await client.assets.setMetadata(airline.id, 'oracle', {
  provider: 'FlightAware API',
  pollingInterval: 30,
  webhookUrl: 'https://ahoy.aero/oracle',
  events: ['DELAY', 'CANCEL', 'GATE_CHANGE'],
});`,
      action: async (addLog, _setData, data) => {
        sdkStore.setAssetMetadata(data.airlineId, 'oracle', {
          provider: 'FlightAware API',
          pollingInterval: 30,
          webhookUrl: 'https://ahoy.aero/oracle',
          events: ['DELAY', 'CANCEL', 'GATE_CHANGE'],
          status: 'CONNECTED',
        });
        const meta = sdkStore.getAssetMetadata(data.airlineId);
        const oracle = meta.oracle as Record<string, unknown>;
        addLog(`✓ Flight oracle configured`);
        addLog(`  Provider: ${oracle.provider}`);
        addLog(`  Polling: every ${oracle.pollingInterval}s`);
        addLog(`  Events: ${(oracle.events as string[]).join(', ')}`);
        addLog(`  Status: ${oracle.status}`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const airline = parties.find(p => p.name === 'AHOY Airways');
        const meta = airline ? sdkStore.getAssetMetadata(airline.id) : {};
        const oracle = (meta.oracle || {}) as Record<string, unknown>;
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Flight Oracle</h3>
              <div className="space-y-3">
                {[
                  { label: 'Provider', value: String(oracle.provider || '—') },
                  { label: 'Polling Interval', value: oracle.pollingInterval ? `${oracle.pollingInterval} seconds` : '—' },
                  { label: 'Webhook', value: String(oracle.webhookUrl || '—').replace('https://', '') },
                  { label: 'Connection', value: String(oracle.status || 'PENDING') },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                    <span className="text-sm text-gray-300">{item.label}</span>
                    <span className={`text-sm font-bold ${item.value === 'CONNECTED' ? 'text-green-400' : 'text-white'}`}>{item.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-green-400 font-medium">Oracle connected — receiving live data</span>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 3,
      sectionId: 'partner-onboarding',
      title: 'Configure Refund Rules',
      description: 'Store refund and compensation policies on-chain',
      code: `await client.assets.setMetadata(airline.id, 'refundPolicy', {
  cancellation: { fullRefund: true, deadline: 24 },
  delay: {
    threshold60: { voucher: 50 },
    threshold120: { cashRefund: 0.5 },
    threshold240: { fullRefund: true },
  },
  insurance: { premium: 0.05, maxPayout: 500 },
});`,
      action: async (addLog, _setData, data) => {
        sdkStore.setAssetMetadata(data.airlineId, 'refundPolicy', {
          cancellation: { fullRefund: true, deadline: 24 },
          delay: {
            threshold60: { voucher: 50 },
            threshold120: { cashRefund: 0.5 },
            threshold240: { fullRefund: true },
          },
          insurance: { premium: 0.05, maxPayout: 500 },
        });
        const meta = sdkStore.getAssetMetadata(data.airlineId);
        addLog(`✓ Refund rules stored on-chain`);
        addLog(`  Cancellation: Full refund (24h before)`);
        addLog(`  Delay >60min: $50 voucher`);
        addLog(`  Delay >120min: 50% cash refund`);
        addLog(`  Delay >240min: Full refund`);
        addLog(`  Insurance premium: 5% of ticket`);
        addLog(`  Max insurance payout: $500`);
        addLog(`  Metadata keys: ${Object.keys(meta).join(', ')}`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const airline = parties.find(p => p.name === 'AHOY Airways');
        const meta = airline ? sdkStore.getAssetMetadata(airline.id) : {};
        const policy = (meta.refundPolicy || {}) as Record<string, unknown>;
        const hasPolicy = Object.keys(policy).length > 0;
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Refund & Compensation Rules</h3>
              {!hasPolicy ? (
                <p className="text-sm text-gray-500">No refund policy configured</p>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                    <p className="text-xs text-gray-500 mb-1">Cancellation Policy</p>
                    <p className="text-sm text-white">Full refund if cancelled 24h+ before departure</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { delay: '>60 min', comp: '$50 voucher', color: 'text-yellow-400' },
                      { delay: '>120 min', comp: '50% refund', color: 'text-orange-400' },
                      { delay: '>240 min', comp: 'Full refund', color: 'text-red-400' },
                    ].map(rule => (
                      <div key={rule.delay} className="p-3 bg-white/5 rounded-lg border border-white/5 text-center">
                        <p className={`text-xs font-bold ${rule.color}`}>{rule.delay}</p>
                        <p className="text-sm text-white mt-1">{rule.comp}</p>
                      </div>
                    ))}
                  </div>
                  <div className="p-3 bg-sky-500/10 rounded-lg border border-sky-500/20">
                    <p className="text-xs text-gray-500 mb-1">Insurance</p>
                    <div className="flex justify-between">
                      <span className="text-sm text-white">Premium: 5% of ticket</span>
                      <span className="text-sm text-sky-400 font-bold">Max: $500</span>
                    </div>
                  </div>
                </div>
              )}
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
      title: 'Create Flight Asset',
      description: 'Register a flight as a tokenizable ACCESS asset',
      code: `const flight = await client.assets.create({
  name: 'AH702 LHR→DXB',
  rightType: 'ACCESS',
  jurisdiction: { countryCode: 'AE' },
  issuerId: airline.id,
  metadata: { flightNumber: 'AH702', origin: 'LHR',
    destination: 'DXB', departureTime: '14:30' }
});
await client.assets.transition(flight.id, 'ACTIVE', airline.id);`,
      action: async (addLog, setData, data) => {
        const flight = await sdkStore.createAsset({
          name: 'AH702 LHR→DXB',
          description: 'AHOY Airways flight LHR to DXB, 2024-03-15',
          rightType: RightType.ACCESS,
          jurisdiction: { countryCode: 'AE' },
          issuerId: data.airlineId,
          metadata: { flightNumber: 'AH702', origin: 'LHR', destination: 'DXB', departureTime: '14:30', arrivalTime: '22:45', date: '2024-03-15', gate: 'B22', aircraft: 'A350-900' },
        });
        setData(prev => ({ ...prev, flightAssetId: flight.id }));
        addLog(`✓ Flight asset created: ${flight.name}`);
        addLog(`  Asset ID: ${flight.id}`);
        addLog(`  Right: ${(flight as any).rightType}`);

        const offering = sdkStore.createOffering(flight.id, {
          totalSupply: 180,
          pricePerToken: 850,
          minInvestment: 850,
          maxInvestment: 5100,
          currency: 'USD',
        });
        addLog(`  Offering: ${offering.totalSupply} seats @ $${offering.pricePerToken}`);

        await sdkStore.transition(flight.id, LifecycleState.PENDING_VERIFICATION, data.airlineId);
        await sdkStore.transition(flight.id, LifecycleState.VERIFIED, data.airlineId);
        await sdkStore.transition(flight.id, LifecycleState.ACTIVE, data.airlineId);
        const active = sdkStore.getAsset(flight.id);
        addLog(`  State: ${active?.state}`);

        sdkStore.setAssetMetadata(flight.id, 'flightStatus', 'SCHEDULED');
        sdkStore.setAssetMetadata(flight.id, 'delayMinutes', 0);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const flight = assets.find(a => a.name === 'AH702 LHR→DXB');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">AH702</h3>
                <span className="px-3 py-1 rounded-full text-xs font-bold border bg-green-500/20 text-green-400 border-green-500/30">
                  {flight?.state || '—'}
                </span>
              </div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">LHR</p>
                  <p className="text-xs text-gray-500">London</p>
                  <p className="text-sm text-sky-400 mt-1">14:30</p>
                </div>
                <div className="flex-1 flex items-center px-4">
                  <div className="w-full h-px bg-sky-500/30 relative">
                    <Plane className="w-4 h-4 text-sky-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">DXB</p>
                  <p className="text-xs text-gray-500">Dubai</p>
                  <p className="text-sm text-sky-400 mt-1">22:45</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center">
                  <p className="text-xs text-gray-500">Date</p>
                  <p className="text-sm font-bold text-white">2024-03-15</p>
                </div>
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center">
                  <p className="text-xs text-gray-500">Gate</p>
                  <p className="text-sm font-bold text-white">B22</p>
                </div>
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center">
                  <p className="text-xs text-gray-500">Aircraft</p>
                  <p className="text-sm font-bold text-white">A350-900</p>
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
      sectionId: 'ticket-issuance',
      title: 'Onboard Passenger',
      description: 'KYC verification for passenger identity',
      code: `const passenger = await client.parties.create({
  name: 'Alice Johnson', type: 'INDIVIDUAL',
  roles: ['INVESTOR'], jurisdiction: 'GB',
});
await client.parties.verifyKyc(passenger.id);`,
      action: async (addLog, setData) => {
        const passenger = await sdkStore.createParty({ name: 'Alice Johnson', type: PartyType.INDIVIDUAL, roles: [PartyRole.INVESTOR], jurisdiction: 'GB' });
        sdkStore.verifyKyc(passenger.id);
        setData(prev => ({ ...prev, passengerId: passenger.id }));
        addLog(`✓ Passenger registered: Alice Johnson`);
        addLog(`  Party ID: ${passenger.id}`);
        addLog(`  KYC: VERIFIED`);
      },
      render: () => {
        const parties = sdkStore.getParties();
        const passenger = parties.find(p => p.name === 'Alice Johnson');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20 bg-sky-900/5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center text-white font-bold text-xl">AJ</div>
                <div>
                  <h3 className="text-lg font-bold text-white">{passenger?.name || 'Alice Johnson'}</h3>
                  <p className="text-sm text-gray-400">Passenger — GB</p>
                </div>
                <div className="ml-auto px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold border border-green-500/30">
                  {isKycVerified(passenger) ? 'KYC VERIFIED' : 'PENDING'}
                </div>
              </div>
              <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                <p className="text-xs text-gray-500">Party ID</p>
                <p className="text-sm font-mono text-white">{passenger?.id.slice(0, 16) || '—'}...</p>
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
      title: 'Book & Issue Ticket',
      description: 'Mint an ACCESS token (ticket NFT) to the passenger',
      code: `await client.assets.mint(flight.id, passenger.id, '1');
await client.assets.setMetadata(flight.id,
  \`ticket_\${passenger.id}\`,
  { seatClass: 'BUSINESS', seat: '4A', insurance: true }
);`,
      action: async (addLog, _setData, data) => {
        const result = await sdkStore.mint(data.flightAssetId, data.passengerId, '1');
        addLog(`✓ Ticket minted: ${result.success ? 'SUCCESS' : result.error}`);
        if (result.success) {
          sdkStore.updateOfferingSold(data.flightAssetId, 1);
          sdkStore.setAssetMetadata(data.flightAssetId, `ticket_${data.passengerId}`, { seatClass: 'BUSINESS', seatNumber: '4A', hasInsurance: true, insurancePremium: 42.50, price: 850, checkedIn: false });
          addLog(`  Seat: 4A (BUSINESS), Insurance: Active ($42.50)`);
          const balances = await sdkStore.getBalances(data.flightAssetId);
          addLog(`  Total tickets issued: ${Object.keys(balances).length}`);
        }
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const flight = assets.find(a => a.name === 'AH702 LHR→DXB');
        const parties = sdkStore.getParties();
        const passenger = parties.find(p => p.name === 'Alice Johnson');
        const meta = flight && passenger ? sdkStore.getAssetMetadata(flight.id) : {};
        const ticket = passenger ? (meta[`ticket_${passenger.id}`] || {}) as Record<string, unknown> : {};
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-900/10 to-blue-900/5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">Boarding Pass</h3>
                <span className="px-2 py-0.5 text-xs font-bold bg-sky-500/20 text-sky-400 rounded border border-sky-500/30">NFT TICKET</span>
              </div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-center"><p className="text-2xl font-bold text-white">LHR</p><p className="text-xs text-gray-500">London</p></div>
                <div className="flex-1 flex items-center px-4"><div className="w-full h-px bg-sky-500/30 relative"><Plane className="w-4 h-4 text-sky-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" /></div></div>
                <div className="text-center"><p className="text-2xl font-bold text-white">DXB</p><p className="text-xs text-gray-500">Dubai</p></div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center"><p className="text-xs text-gray-500">Passenger</p><p className="text-xs font-bold text-white">Alice Johnson</p></div>
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center"><p className="text-xs text-gray-500">Seat</p><p className="text-sm font-bold text-white">{String(ticket.seatNumber || '4A')}</p></div>
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center"><p className="text-xs text-gray-500">Class</p><p className="text-xs font-bold text-sky-400">{String(ticket.seatClass || 'BUSINESS')}</p></div>
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center"><p className="text-xs text-gray-500">Insurance</p><p className="text-sm font-bold text-green-400">{ticket.hasInsurance ? 'Active' : 'None'}</p></div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // C. End User Experience (steps 7–9)
    // =========================================================================
    {
      id: 7, sectionId: 'end-user', title: 'View My Tickets', description: 'Passenger views token holdings as a ticket wallet',
      code: `const assets = client.assets.getAll().filter(a => a.rightType === 'ACCESS');\nfor (const a of assets) {\n  const bal = await client.tokens.getBalance(a.id, passenger.id);\n  if (bal > 0) console.log(a.name, bal);\n}`,
      action: async (addLog, _setData, data) => {
        const balances = await sdkStore.getBalances(data.flightAssetId);
        const asset = sdkStore.getAsset(data.flightAssetId);
        addLog(`✓ Ticket wallet loaded`);
        addLog(`  Flight: ${asset?.name}`);
        for (const [pid, bal] of Object.entries(balances)) { const p = sdkStore.getParty(pid); addLog(`  ${p?.name || pid.slice(0, 8)}: ${bal} ticket(s)`); }
      },
      render: () => {
        const assets = sdkStore.getAssets().filter(a => (a as any).rightType === RightType.ACCESS);
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white">My Tickets ({assets.length})</h3>
            {assets.map(asset => {
              const meta = sdkStore.getAssetMetadata(asset.id);
              const status = String(meta.flightStatus || 'SCHEDULED');
              return (
                <div key={asset.id} className="glass-card p-4 rounded-xl border border-sky-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-white">{asset.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${status === 'SCHEDULED' ? 'bg-sky-500/20 text-sky-400' : status === 'DELAYED' ? 'bg-amber-500/20 text-amber-400' : status === 'CANCELLED' ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>{status}</span>
                  </div>
                  <p className="text-xs text-gray-500">{asset.state} — {(asset as any).rightType}</p>
                </div>
              );
            })}
          </div>
        );
      },
      completed: false,
    },
    {
      id: 8, sectionId: 'end-user', title: 'Check Flight Status', description: 'Read live flight status from asset metadata',
      code: `const meta = client.assets.getMetadata(flight.id);\nconsole.log('Status:', meta.flightStatus);\nconsole.log('State:', flight.state);`,
      action: async (addLog, _setData, data) => {
        const asset = sdkStore.getAsset(data.flightAssetId);
        const meta = sdkStore.getAssetMetadata(data.flightAssetId);
        if (!asset) { addLog('⚠ Flight asset not found'); return; }
        const fm = (asset.metadata || {}) as Record<string, unknown>;
        addLog(`✓ Flight status loaded`);
        addLog(`  Flight: ${asset.name}`);
        addLog(`  Asset state: ${asset.state}`);
        addLog(`  Flight status: ${meta.flightStatus || 'SCHEDULED'}`);
        addLog(`  Gate: ${fm.gate || 'TBD'}`);
        addLog(`  Departure: ${fm.departureTime || '—'}`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const flight = assets.find(a => a.name === 'AH702 LHR→DXB');
        const meta = flight ? sdkStore.getAssetMetadata(flight.id) : {};
        const fm = (flight?.metadata || {}) as Record<string, unknown>;
        const status = String(meta.flightStatus || 'SCHEDULED');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">{String(fm.flightNumber || 'AH702')}</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${status === 'SCHEDULED' ? 'bg-sky-500/20 text-sky-400 border-sky-500/30' : status === 'DELAYED' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-green-500/20 text-green-400 border-green-500/30'}`}>{status}</span>
              </div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-center"><p className="text-2xl font-bold text-white">LHR</p><p className="text-xs text-gray-500">London</p><p className="text-sm text-sky-400 mt-1">{String(fm.departureTime || '14:30')}</p></div>
                <div className="flex-1 flex items-center px-4"><div className="w-full h-px bg-sky-500/30 relative"><Plane className="w-4 h-4 text-sky-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" /></div></div>
                <div className="text-center"><p className="text-2xl font-bold text-white">DXB</p><p className="text-xs text-gray-500">Dubai</p><p className="text-sm text-sky-400 mt-1">{String(fm.arrivalTime || '22:45')}</p></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center"><p className="text-xs text-gray-500">Gate</p><p className="text-sm font-bold text-white">{String(fm.gate || 'TBD')}</p></div>
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center"><p className="text-xs text-gray-500">Aircraft</p><p className="text-xs font-bold text-white">{String(fm.aircraft || '—')}</p></div>
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center"><p className="text-xs text-gray-500">Date</p><p className="text-sm font-bold text-white">{String(fm.date || '—')}</p></div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 9, sectionId: 'end-user', title: 'Check In', description: 'Update ticket metadata to mark passenger as checked in',
      code: `const ticketMeta = client.assets.getMetadata(flight.id, \`ticket_\${passenger.id}\`);\nawait client.assets.setMetadata(flight.id, \`ticket_\${passenger.id}\`, { ...ticketMeta, checkedIn: true });`,
      action: async (addLog, _setData, data) => {
        const meta = sdkStore.getAssetMetadata(data.flightAssetId);
        const key = `ticket_${data.passengerId}`;
        const ticket = (meta[key] || {}) as Record<string, unknown>;
        sdkStore.setAssetMetadata(data.flightAssetId, key, { ...ticket, checkedIn: true, checkedInAt: new Date().toISOString() });
        addLog(`✓ Check-in complete`);
        addLog(`  Passenger: Alice Johnson`);
        addLog(`  Seat: ${ticket.seatNumber || '4A'} (${ticket.seatClass || 'BUSINESS'})`);
        addLog(`  Status: CHECKED IN`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const flight = assets.find(a => a.name === 'AH702 LHR→DXB');
        const parties = sdkStore.getParties();
        const passenger = parties.find(p => p.name === 'Alice Johnson');
        const meta = flight ? sdkStore.getAssetMetadata(flight.id) : {};
        const ticket = passenger ? (meta[`ticket_${passenger.id}`] || {}) as Record<string, unknown> : {};
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5 text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center border-2 border-green-500/30">
                <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Check-In Complete</h3>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5"><p className="text-xs text-gray-500">Flight</p><p className="text-sm font-bold text-white">AH702</p></div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5"><p className="text-xs text-gray-500">Seat</p><p className="text-sm font-bold text-white">{String(ticket.seatNumber || '4A')}</p></div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5"><p className="text-xs text-gray-500">Status</p><p className="text-sm font-bold text-green-400">{ticket.checkedIn ? 'CHECKED IN' : 'PENDING'}</p></div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // D. Flight Status Updates (steps 10–12)
    // =========================================================================
    {
      id: 10, sectionId: 'flight-status', title: 'Oracle: Flight Delayed', description: 'Update flight metadata to DELAYED via oracle',
      code: `await client.assets.setMetadata(flight.id, 'flightStatus', 'DELAYED');\nawait client.assets.setMetadata(flight.id, 'delayMinutes', 90);`,
      action: async (addLog, _setData, data) => {
        sdkStore.setAssetMetadata(data.flightAssetId, 'flightStatus', 'DELAYED');
        sdkStore.setAssetMetadata(data.flightAssetId, 'delayMinutes', 90);
        const meta = sdkStore.getAssetMetadata(data.flightAssetId);
        addLog(`✓ Flight delay recorded`);
        addLog(`  Status: ${meta.flightStatus}`);
        addLog(`  Delay: ${meta.delayMinutes} minutes`);
        addLog(`  New departure: 16:00`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const flight = assets.find(a => a.name === 'AH702 LHR→DXB');
        const meta = flight ? sdkStore.getAssetMetadata(flight.id) : {};
        const delay = Number(meta.delayMinutes || 0);
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-amber-500/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">AH702</h3>
                <span className="px-3 py-1 rounded-full text-xs font-bold border bg-amber-500/20 text-amber-400 border-amber-500/30">DELAYED</span>
              </div>
              <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20 mb-4">
                <div className="flex items-center justify-between">
                  <div><p className="text-xs text-gray-500">Delay</p><p className="text-2xl font-bold text-amber-400">{delay} min</p></div>
                  <div className="text-right"><p className="text-xs text-gray-500">New Departure</p><p className="text-lg font-bold text-white">{(() => { const m = 14*60+30+delay; return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; })()}</p></div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm"><span className="text-gray-400">LHR</span><span className="text-gray-600">→</span><span className="text-gray-400">DXB</span><span className="ml-auto text-xs text-gray-500">Gate B22</span></div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 11, sectionId: 'flight-status', title: 'Push Notification', description: 'Notify token holders (passengers) of the delay',
      code: `const balances = await client.tokens.getBalances(flight.id);\nfor (const [partyId] of Object.entries(balances)) {\n  const party = client.parties.get(partyId);\n  await client.notify.push({ to: party.email, title: 'Flight Delayed' });\n}`,
      action: async (addLog, _setData, data) => {
        const balances = await sdkStore.getBalances(data.flightAssetId);
        const meta = sdkStore.getAssetMetadata(data.flightAssetId);
        addLog(`✓ Notifications sent to token holders`);
        addLog(`  Affected passengers: ${Object.keys(balances).length}`);
        for (const [pid] of Object.entries(balances)) { const p = sdkStore.getParty(pid); addLog(`  → ${p?.name || pid.slice(0, 8)} (1 ticket)`); }
        addLog(`  Delay: ${meta.delayMinutes} minutes`);
      },
      render: () => (
        <div className="space-y-4">
          <div className="glass-card p-6 rounded-xl border border-sky-500/20">
            <h3 className="text-lg font-bold text-white mb-4">Push Notification</h3>
            <div className="bg-gray-900 rounded-2xl p-4 border border-white/10 max-w-xs mx-auto">
              <div className="flex items-center gap-2 mb-2"><div className="w-6 h-6 rounded-lg bg-sky-500 flex items-center justify-center"><Plane className="w-3 h-3 text-white" /></div><span className="text-xs text-gray-400">AHOY Airways</span><span className="text-xs text-gray-600 ml-auto">now</span></div>
              <p className="text-sm font-bold text-white">Flight Delayed</p>
              <p className="text-xs text-gray-400 mt-1">Your flight AH702 has been delayed by 90 minutes. New departure: 16:00.</p>
            </div>
          </div>
        </div>
      ),
      completed: false,
    },
    {
      id: 12, sectionId: 'flight-status', title: 'Oracle: Flight Cancelled', description: 'Cancel flight — freeze asset to halt all transfers',
      code: `await client.assets.setMetadata(flight.id, 'flightStatus', 'CANCELLED');\nawait client.assets.transition(flight.id, 'FROZEN', airline.id);\n// All ticket transfers halted`,
      action: async (addLog, _setData, data) => {
        sdkStore.setAssetMetadata(data.flightAssetId, 'flightStatus', 'CANCELLED');
        const r = await sdkStore.transition(data.flightAssetId, LifecycleState.FROZEN, data.airlineId);
        const asset = sdkStore.getAsset(data.flightAssetId);
        addLog(`✓ Flight cancelled`);
        addLog(`  Metadata: flightStatus = CANCELLED`);
        addLog(`  Transition → FROZEN: ${r.success ? 'OK' : r.error}`);
        addLog(`  Asset state: ${asset?.state}`);
        addLog(`  All ticket transfers halted`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const flight = assets.find(a => a.name === 'AH702 LHR→DXB');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-red-500/20">
              <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold text-white">AH702</h3><span className="px-3 py-1 rounded-full text-xs font-bold border bg-red-500/20 text-red-400 border-red-500/30">CANCELLED</span></div>
              <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20 mb-4 text-center">
                <p className="text-sm text-red-400 font-bold mb-1">Flight Cancelled</p>
                <p className="text-xs text-gray-400">Asset state: {flight?.state || 'FROZEN'} — All transfers halted</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest">Passenger Options</p>
                {[{ label: 'Full Refund', desc: 'Original payment method' }, { label: 'Rebook', desc: 'Next available flight + $50 voucher' }, { label: 'Token Credit', desc: '110% value in platform credits' }].map(opt => (
                  <div key={opt.label} className="p-3 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between">
                    <div><p className="text-sm font-bold text-white">{opt.label}</p><p className="text-xs text-gray-500">{opt.desc}</p></div>
                    <div className="w-4 h-4 rounded-full border-2 border-white/20" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // E. Refund & Disruption (steps 13–15)
    // =========================================================================
    {
      id: 13, sectionId: 'refund-disruption', title: 'Compute Refund Options', description: 'Read ticket metadata and refund policy to compute options',
      code: `const ticket = client.assets.getMetadata(flight.id, \`ticket_\${passenger.id}\`);\nconst policy = client.assets.getMetadata(airline.id, 'refundPolicy');\n// Compute: full refund, rebook, or credit`,
      action: async (addLog, _setData, data) => {
        const meta = sdkStore.getAssetMetadata(data.flightAssetId);
        const ticket = (meta[`ticket_${data.passengerId}`] || {}) as Record<string, unknown>;
        const price = Number(ticket.price || 850);
        const airlineMeta = sdkStore.getAssetMetadata(data.airlineId);
        addLog(`✓ Refund options computed from on-chain data`);
        addLog(`  Ticket price: $${price}`);
        addLog(`  Refund policy: ${airlineMeta.refundPolicy ? 'LOADED' : 'NOT FOUND'}`);
        addLog(`  Option A: Full refund → $${price}`);
        addLog(`  Option B: Rebook + $50 voucher`);
        addLog(`  Option C: Credit → ${Math.round(price * 1.1)} tokens (110%)`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const flight = assets.find(a => a.name === 'AH702 LHR→DXB');
        const parties = sdkStore.getParties();
        const passenger = parties.find(p => p.name === 'Alice Johnson');
        const meta = flight && passenger ? sdkStore.getAssetMetadata(flight.id) : {};
        const ticket = passenger ? (meta[`ticket_${passenger.id}`] || {}) as Record<string, unknown> : {};
        const price = Number(ticket.price || 850);
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Refund Options</h3>
              <div className="space-y-3">
                {[
                  { label: 'Full Cash Refund', value: `$${price}`, desc: 'Credited to original payment', hl: false },
                  { label: 'Rebook + Voucher', value: '$50 voucher', desc: 'Next available AH flight + travel credit', hl: false },
                  { label: 'Token Credit', value: `${Math.round(price * 1.1)} credits`, desc: '110% value — best deal', hl: true },
                ].map((opt, i) => (
                  <div key={opt.label} className={`p-4 rounded-xl border ${opt.hl ? 'bg-sky-500/10 border-sky-500/20' : 'bg-white/5 border-white/5'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${opt.hl ? 'bg-sky-500 text-white' : 'bg-white/10 text-gray-400'}`}>{String.fromCharCode(65 + i)}</div>
                        <span className="text-sm font-bold text-white">{opt.label}</span>
                      </div>
                      <span className={`text-sm font-bold ${opt.hl ? 'text-sky-400' : 'text-white'}`}>{opt.value}</span>
                    </div>
                    <p className="text-xs text-gray-500 ml-8">{opt.desc}</p>
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
      id: 14, sectionId: 'refund-disruption', title: 'Process Insurance Claim', description: 'Create a settlement record for the insurance payout',
      code: `const settlement = client.settlements.create({\n  assetId: flight.id, partyId: passenger.id,\n  amount: 180, type: 'INSURANCE_CLAIM',\n});`,
      action: async (addLog, setData, data) => {
        const meta = sdkStore.getAssetMetadata(data.flightAssetId);
        const key = `ticket_${data.passengerId}`;
        const ticket = (meta[key] || {}) as Record<string, unknown>;
        if (!ticket.hasInsurance) { addLog(`⚠ No insurance on this ticket`); return; }
        const settlement = sdkStore.createSettlement({ assetId: data.flightAssetId, partyId: data.passengerId, amount: 180, type: 'INSURANCE_CLAIM' });
        setData(prev => ({ ...prev, settlementId: settlement.id }));
        sdkStore.setAssetMetadata(data.flightAssetId, key, { ...ticket, insuranceClaimed: true, settlementId: settlement.id });
        addLog(`✓ Insurance claim processed`);
        addLog(`  Settlement ID: ${settlement.id.slice(0, 8)}`);
        addLog(`  Payout: $${settlement.amount}`);
        addLog(`  Status: ${settlement.status}`);
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const flight = assets.find(a => a.name === 'AH702 LHR→DXB');
        const parties = sdkStore.getParties();
        const passenger = parties.find(p => p.name === 'Alice Johnson');
        const meta = flight && passenger ? sdkStore.getAssetMetadata(flight.id) : {};
        const ticket = passenger ? (meta[`ticket_${passenger.id}`] || {}) as Record<string, unknown> : {};
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-green-500/20 bg-green-900/5 text-center">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center border-2 border-green-500/30">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-4">Insurance Claim Approved</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/5 p-3 rounded-lg border border-white/5"><p className="text-xs text-gray-500">Payout</p><p className="text-lg font-bold text-green-400">{ticket.insuranceClaimed ? '$180' : '—'}</p></div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5"><p className="text-xs text-gray-500">Type</p><p className="text-sm font-bold text-white">INSURANCE</p></div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/5"><p className="text-xs text-gray-500">Status</p><p className="text-lg font-bold text-green-400">SETTLED</p></div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 15, sectionId: 'refund-disruption', title: 'Track Settlement', description: 'Read settlement record from the SDK store',
      code: `const settlement = client.settlements.get(settlementId);\nconsole.log('Status:', settlement.status);\nconsole.log('Filed:', settlement.filedAt);`,
      action: async (addLog, _setData, data) => {
        const settlement = data.settlementId ? sdkStore.getSettlement(data.settlementId) : null;
        if (!settlement) { addLog('⚠ No settlement found'); return; }
        addLog(`✓ Settlement tracked`);
        addLog(`  ID: ${settlement.id.slice(0, 8)}`);
        addLog(`  Type: ${settlement.type}`);
        addLog(`  Amount: $${settlement.amount}`);
        addLog(`  Status: ${settlement.status}`);
        addLog(`  Filed: ${settlement.filedAt}`);
        addLog(`  Settled: ${settlement.settledAt || '—'}`);
      },
      render: (_data) => {
        const settlement = _data.settlementId ? sdkStore.getSettlement(_data.settlementId) : null;
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Settlement Timeline</h3>
              <div className="space-y-0">
                {[
                  { label: 'Claim Filed', time: settlement?.filedAt ? new Date(settlement.filedAt).toLocaleTimeString() : '—', done: !!settlement },
                  { label: 'Processing', time: settlement?.processedAt ? new Date(settlement.processedAt).toLocaleTimeString() : '—', done: !!settlement?.processedAt },
                  { label: 'Settled', time: settlement?.settledAt ? new Date(settlement.settledAt).toLocaleTimeString() : '—', done: settlement?.status === 'SETTLED' },
                ].map((step, i) => (
                  <div key={step.label} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${step.done ? 'bg-green-500' : 'bg-white/10'}`}>{step.done ? '✓' : i+1}</div>
                      {i < 2 && <div className={`w-px h-8 ${step.done ? 'bg-green-500/30' : 'bg-white/10'}`} />}
                    </div>
                    <div className="pt-1"><p className="text-sm font-bold text-white">{step.label}</p><p className="text-xs text-gray-500">{step.time}</p></div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-green-500/10 rounded-lg border border-green-500/20 text-center">
                <p className="text-xs text-gray-500">Amount</p>
                <p className="text-lg font-bold text-green-400">${settlement?.amount || '—'}</p>
                <p className="text-xs text-gray-500">via smart contract</p>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // F. Ticket Transfer (steps 16–18)
    // =========================================================================
    {
      id: 16, sectionId: 'ticket-transfer', title: 'Mint Second Ticket', description: 'Unfreeze flight, create Bob, and mint his ticket token',
      code: `await client.assets.transition(flight.id, 'ACTIVE', airline.id);\nconst bob = await client.parties.create({ name: 'Bob Martinez', ... });\nawait client.assets.mint(flight.id, bob.id, '1');`,
      action: async (addLog, setData, data) => {
        const r = await sdkStore.transition(data.flightAssetId, LifecycleState.ACTIVE, data.airlineId);
        addLog(`✓ Flight unfrozen: ${r.success ? 'OK' : r.error}`);
        sdkStore.setAssetMetadata(data.flightAssetId, 'flightStatus', 'REBOOKING');
        const bob = await sdkStore.createParty({ name: 'Bob Martinez', type: PartyType.INDIVIDUAL, roles: [PartyRole.INVESTOR], jurisdiction: 'US' });
        sdkStore.verifyKyc(bob.id);
        setData(prev => ({ ...prev, bobId: bob.id }));
        addLog(`✓ Created: Bob Martinez (${bob.id.slice(0, 8)})`);
        const mint = await sdkStore.mint(data.flightAssetId, bob.id, '1');
        addLog(`✓ Ticket minted: ${mint.success ? 'SUCCESS' : mint.error}`);
        if (mint.success) {
          sdkStore.updateOfferingSold(data.flightAssetId, 1);
          sdkStore.setAssetMetadata(data.flightAssetId, `ticket_${bob.id}`, { seatClass: 'ECONOMY', seatNumber: '28C', hasInsurance: false, price: 450, checkedIn: false });
          addLog(`  Seat: 28C (ECONOMY), $450`);
        }
      },
      render: () => {
        const parties = sdkStore.getParties();
        const bob = parties.find(p => p.name === 'Bob Martinez');
        const assets = sdkStore.getAssets();
        const flight = assets.find(a => a.name === 'AH702 LHR→DXB');
        const meta = flight && bob ? sdkStore.getAssetMetadata(flight.id) : {};
        const ticket = bob ? (meta[`ticket_${bob.id}`] || {}) as Record<string, unknown> : {};
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-900/10 to-blue-900/5">
              <div className="flex items-center justify-between mb-3"><h3 className="text-lg font-bold text-white">Bob's Boarding Pass</h3><span className="px-2 py-0.5 text-xs font-bold bg-sky-500/20 text-sky-400 rounded border border-sky-500/30">NFT TICKET</span></div>
              <div className="flex items-center justify-between mb-4">
                <div className="text-center"><p className="text-2xl font-bold text-white">LHR</p><p className="text-xs text-gray-500">London</p></div>
                <div className="flex-1 flex items-center px-4"><div className="w-full h-px bg-sky-500/30 relative"><Plane className="w-4 h-4 text-sky-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" /></div></div>
                <div className="text-center"><p className="text-2xl font-bold text-white">DXB</p><p className="text-xs text-gray-500">Dubai</p></div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center"><p className="text-xs text-gray-500">Passenger</p><p className="text-xs font-bold text-white">Bob Martinez</p></div>
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center"><p className="text-xs text-gray-500">Seat</p><p className="text-sm font-bold text-white">{String(ticket.seatNumber || '28C')}</p></div>
                <div className="bg-white/5 p-2 rounded-lg border border-white/5 text-center"><p className="text-xs text-gray-500">Class</p><p className="text-xs font-bold text-sky-400">{String(ticket.seatClass || 'ECONOMY')}</p></div>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 17, sectionId: 'ticket-transfer', title: 'Check Transfer Eligibility', description: 'Run compliance checks for ticket transfer',
      code: `const carla = await client.parties.create({ name: 'Carla Diaz', ... });\nawait client.parties.verifyKyc(carla.id);\nconst result = client.compliance.check({ assetId: flight.id, from: bob.id, to: carla.id, amount: '1' });`,
      action: async (addLog, setData, data) => {
        const carla = await sdkStore.createParty({ name: 'Carla Diaz', type: PartyType.INDIVIDUAL, roles: [PartyRole.INVESTOR], jurisdiction: 'US' });
        sdkStore.verifyKyc(carla.id);
        setData(prev => ({ ...prev, carlaId: carla.id }));
        addLog(`✓ Created: Carla Diaz (${carla.id.slice(0, 8)})`);
        const result = sdkStore.checkTransferCompliance(data.flightAssetId, data.bobId, carla.id, '1');
        addLog(`✓ Transfer compliance: ${result.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
        for (const check of result.checks) { addLog(`  ${check.name}: ${check.passed ? '✓' : '✗'} (${check.detail})`); }
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const flight = assets.find(a => a.name === 'AH702 LHR→DXB');
        const parties = sdkStore.getParties();
        const bob = parties.find(p => p.name === 'Bob Martinez');
        const carla = parties.find(p => p.name === 'Carla Diaz');
        const result = flight && bob && carla ? sdkStore.checkTransferCompliance(flight.id, bob.id, carla.id, '1') : null;
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-2">Transfer Eligibility</h3>
            <div className="space-y-2">
              {(result?.checks || []).map(check => (
                <div key={check.name} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${check.passed ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>{check.passed ? '✓' : '✗'}</div>
                  <span className={`text-sm ${check.passed ? 'text-green-400' : 'text-red-400'}`}>{check.name}</span>
                  <span className="text-xs text-gray-500 ml-auto">{check.detail}</span>
                </div>
              ))}
            </div>
            <div className={`p-3 rounded-lg border text-center ${result?.eligible ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <span className={`text-sm font-bold ${result?.eligible ? 'text-green-400' : 'text-red-400'}`}>{result?.eligible ? 'All checks passed — Transfer eligible' : 'Checks pending'}</span>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 18, sectionId: 'ticket-transfer', title: 'Transfer Ticket', description: 'Transfer Bob\'s ticket token to Carla via SDK',
      code: `await client.assets.transfer(\n  flight.id, bob.id, carla.id, '1'\n);\n// NFT ticket transferred on-chain`,
      action: async (addLog, _setData, data) => {
        const result = await sdkStore.transfer(data.flightAssetId, data.bobId, data.carlaId, '1');
        addLog(`✓ Transfer: ${result.success ? 'SUCCESS' : result.error}`);
        const meta = sdkStore.getAssetMetadata(data.flightAssetId);
        const bobTicket = (meta[`ticket_${data.bobId}`] || {}) as Record<string, unknown>;
        sdkStore.setAssetMetadata(data.flightAssetId, `ticket_${data.carlaId}`, { ...bobTicket, transferredFrom: data.bobId });
        const balances = await sdkStore.getBalances(data.flightAssetId);
        addLog(`  Updated balances:`);
        for (const [pid, bal] of Object.entries(balances)) { const p = sdkStore.getParty(pid); addLog(`    ${p?.name || pid.slice(0, 8)}: ${bal} ticket(s)`); }
      },
      render: () => {
        const assets = sdkStore.getAssets();
        const flight = assets.find(a => a.name === 'AH702 LHR→DXB');
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Ticket Transfer</h3>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                  <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-orange-400 to-red-600 flex items-center justify-center text-white text-sm font-bold mb-2">BM</div>
                  <p className="text-sm font-bold text-white">Bob Martinez</p>
                  <p className="text-xs text-gray-500">Sender</p>
                </div>
                <div className="flex flex-col items-center gap-1 text-xs text-gray-500"><span>1 token →</span><div className="w-12 h-px bg-sky-500/50" /></div>
                <div className="flex-1 p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                  <div className="w-10 h-10 mx-auto rounded-full bg-gradient-to-br from-pink-400 to-rose-600 flex items-center justify-center text-white text-sm font-bold mb-2">CD</div>
                  <p className="text-sm font-bold text-white">Carla Diaz</p>
                  <p className="text-xs text-gray-500">Receiver</p>
                </div>
              </div>
              <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20 text-center">
                <span className="text-sm font-bold text-green-400">Transfer Complete — Asset state: {flight?.state || '—'}</span>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },

    // =========================================================================
    // G. Flight Oracle — Amadeus (steps 19–21)
    // =========================================================================
    {
      id: 19,
      sectionId: 'flight-oracle',
      title: 'Search Flights (Amadeus)',
      description: 'Search for flights using Amadeus integration with DON oracle',
      code: `const results = await amadeusPlugin.searchFlights({
  origin: 'LHR',
  dest: 'DXB',
  date: '2024-06-15',
  class: 'BUSINESS',
});
console.log(\`Found \${results.length} flights\`);`,
      action: async (addLog) => {
        const store = useSDKStore.getState();
        const results = store.searchFlights({ origin: 'LHR', dest: 'DXB', date: '2024-06-15', class: 'BUSINESS' });
        addLog(`✓ Amadeus DON oracle query submitted`);
        addLog(`  Origin: LHR (London Heathrow)`);
        addLog(`  Destination: DXB (Dubai International)`);
        addLog(`  Date: 2024-06-15`);
        addLog(`  Class: BUSINESS`);
        addLog(`  ---`);
        addLog(`  Found ${results.length} flights:`);
        results.slice(0, 3).forEach(f => {
          addLog(`  ${f.flightNumber}  ${f.origin}→${f.destination}  $${f.price}  ${f.cabin}`);
        });
        addLog(`  Oracle consensus: 5/5 DON nodes confirmed pricing`);
        sdkStore.logSdkCall('searchFlights', { origin: 'LHR', dest: 'DXB', date: '2024-06-15', class: 'BUSINESS' });
      },
      render: () => {
        const mockFlights = [
          { flight: 'AH702', dep: '14:30', arr: '22:45', price: 1240, seats: 12 },
          { flight: 'AH718', dep: '08:15', arr: '16:30', price: 1180, seats: 4 },
          { flight: 'AH734', dep: '21:00', arr: '05:15', price: 980, seats: 22 },
        ];
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Amadeus Flight Search</h3>
              {/* Search form */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                  <p className="text-xs text-gray-500 mb-1">Origin</p>
                  <p className="text-sm font-bold text-white">LHR — London Heathrow</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                  <p className="text-xs text-gray-500 mb-1">Destination</p>
                  <p className="text-sm font-bold text-white">DXB — Dubai International</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                  <p className="text-xs text-gray-500 mb-1">Date</p>
                  <p className="text-sm font-bold text-white">2024-06-15</p>
                </div>
                <div className="bg-white/5 p-3 rounded-lg border border-white/10">
                  <p className="text-xs text-gray-500 mb-1">Class</p>
                  <p className="text-sm font-bold text-sky-400">BUSINESS</p>
                </div>
              </div>
              {/* Results grid */}
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest mb-2">Results</p>
              <div className="space-y-2">
                {mockFlights.map(f => (
                  <div key={f.flight} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-white">{f.flight}</span>
                      <span className="text-xs text-gray-400">LHR</span>
                      <Plane className="w-3 h-3 text-sky-400" />
                      <span className="text-xs text-gray-400">DXB</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-500">{f.dep} — {f.arr}</span>
                      <span className="text-xs text-gray-500">{f.seats} seats</span>
                      <span className="text-sm font-bold text-sky-400">${f.price}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-green-400 font-medium">DON Oracle — 5/5 nodes confirmed pricing data</span>
              </div>
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 20,
      sectionId: 'flight-oracle',
      title: 'Monitor Flight Status (DON Consensus)',
      description: 'Monitor real-time flight status with DON oracle consensus verification',
      code: `const status = await amadeusPlugin.getFlightStatus('AH702');
const consensus = await donOracle.verify({
  flightNumber: 'AH702',
  requiredNodes: 5,
});
console.log(status, consensus);`,
      action: async (addLog) => {
        const store = useSDKStore.getState();
        const status = store.getFlightStatus('AH702');
        addLog(`✓ DON oracle flight status query`);
        addLog(`  Flight: ${status.flightNumber}`);
        addLog(`  Status: ${status.status}`);
        addLog(`  Delay: ${status.delayMinutes} minutes`);
        addLog(`  ---`);
        addLog(`  DON consensus round:`);
        addLog(`    ${status.donConsensus.agreed}/${status.donConsensus.total} nodes agreed`);
        addLog(`  Qualifies for refund: ${status.qualifiesForRefund ? 'YES' : 'NO'} (threshold: 180 min)`);
        sdkStore.logSdkCall('getFlightStatus', { flightNumber: 'AH702' });
      },
      render: () => {
        const delayMinutes = 195;
        const qualifiesForRefund = delayMinutes >= 180;
        const nodes = [
          { id: 'us-east', status: 'DELAYED', delay: 195, agreed: true },
          { id: 'eu-west', status: 'DELAYED', delay: 195, agreed: true },
          { id: 'ap-south', status: 'DELAYED', delay: 190, agreed: true },
          { id: 'us-west', status: 'TIMEOUT', delay: 0, agreed: false },
          { id: 'eu-central', status: 'DELAYED', delay: 195, agreed: false },
        ];
        const agreedCount = nodes.filter(n => n.agreed).length;
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">AH702 — Live Status</h3>
                <span className="px-3 py-1 rounded-full text-xs font-bold border bg-amber-500/20 text-amber-400 border-amber-500/30">DELAYED</span>
              </div>
              {/* Flight number input display */}
              <div className="bg-white/5 p-3 rounded-lg border border-white/10 mb-4">
                <p className="text-xs text-gray-500 mb-1">Flight Number</p>
                <p className="text-sm font-bold text-white font-mono">AH702</p>
              </div>
              {/* Status display */}
              <div className="p-4 bg-amber-500/10 rounded-xl border border-amber-500/20 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">Delay</p>
                    <p className="text-2xl font-bold text-amber-400">{delayMinutes} min</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">New Departure</p>
                    <p className="text-lg font-bold text-white">17:45</p>
                  </div>
                </div>
              </div>
              {/* DON Consensus overlay */}
              <div className="p-4 bg-white/5 rounded-xl border border-white/10 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest">DON Consensus</p>
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">{agreedCount}/5 nodes agreed</span>
                </div>
                <div className="space-y-2">
                  {nodes.map(node => (
                    <div key={node.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-xs font-mono text-gray-400">{node.id}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{node.status === 'TIMEOUT' ? 'TIMEOUT' : `${node.delay}min`}</span>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${node.agreed ? 'bg-green-500 text-white' : 'bg-red-500/30 text-red-400'}`}>
                          {node.agreed ? '\u2713' : '\u2717'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Refund qualification badge */}
              {qualifiesForRefund && (
                <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20 flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  <div>
                    <p className="text-sm font-bold text-green-400">Qualifies for Parametric Refund</p>
                    <p className="text-xs text-gray-500">Delay of {delayMinutes} min exceeds 180 min threshold</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      },
      completed: false,
    },
    {
      id: 21,
      sectionId: 'flight-oracle',
      title: 'Parametric Refund Trigger',
      description: 'Trigger automatic parametric refund based on verified DON consensus delay data',
      code: `const refund = await parametricRefund.trigger({
  flightNumber: 'AH702',
  delayThreshold: 180,
  verifiedDelay: 195,
  passengerId: passenger.id,
  aiVerification: true,
});
console.log('Refund tx:', refund.txHash);`,
      action: async (addLog) => {
        const store = useSDKStore.getState();
        const aiResult = store.verifyDelayWithAI('AH702', 195);
        addLog(`✓ Parametric refund trigger initiated`);
        addLog(`  Flight: AH702`);
        addLog(`  Delay threshold: 180 min`);
        addLog(`  Verified delay: 195 min (DON consensus)`);
        addLog(`  ---`);
        addLog(`  AI Verification: ${aiResult.confirmed ? 'PASSED' : 'FAILED'}`);
        addLog(`    Confidence: ${aiResult.confidence.toFixed(1)}%`);
        const refund = store.triggerParametricRefund('AH702', 'ticket-001');
        addLog(`  ---`);
        addLog(`  Refund triggered on-chain`);
        addLog(`  Tx Hash: ${refund.txHash.slice(0, 10)}...${refund.txHash.slice(-4)}`);
        addLog(`  Amount: $${refund.refundAmount} ${refund.currency}`);
        addLog(`  Status: ${refund.status.toUpperCase()}`);
        sdkStore.logSdkCall('triggerParametricRefund', { flightNumber: 'AH702', ticketTokenId: 'ticket-001' });
      },
      render: () => {
        const txHash = '0x8a3f7b2e1d9c4a6f0e5b3d8c7a2f1e0d9b4c6a8f3e7d2c1b0a9f8e7d6c5b4a';
        return (
          <div className="space-y-4">
            <div className="glass-card p-6 rounded-xl border border-sky-500/20">
              <h3 className="text-lg font-bold text-white mb-4">Parametric Refund</h3>
              {/* Delay threshold */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 bg-white/5 rounded-lg border border-white/10 text-center">
                  <p className="text-xs text-gray-500 mb-1">Delay Threshold</p>
                  <p className="text-xl font-bold text-white">180 min</p>
                </div>
                <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20 text-center">
                  <p className="text-xs text-gray-500 mb-1">Verified Delay</p>
                  <p className="text-xl font-bold text-amber-400">195 min</p>
                </div>
              </div>
              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 bg-sky-500/10 rounded-xl border border-sky-500/20 text-center">
                  <svg className="w-6 h-6 text-sky-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  <p className="text-xs font-bold text-sky-400">Verify with AI</p>
                  <p className="text-xs text-gray-500 mt-1">Confidence: 98.7%</p>
                </div>
                <div className="p-3 bg-green-500/10 rounded-xl border border-green-500/20 text-center">
                  <svg className="w-6 h-6 text-green-400 mx-auto mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <p className="text-xs font-bold text-green-400">Trigger Refund</p>
                  <p className="text-xs text-gray-500 mt-1">On-chain execution</p>
                </div>
              </div>
              {/* Refund result */}
              <div className="p-4 bg-green-500/10 rounded-xl border border-green-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30">
                    <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-green-400">Refund Confirmed</p>
                    <p className="text-xs text-gray-500">2 block confirmations</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                    <p className="text-xs text-gray-500">Amount</p>
                    <p className="text-sm font-bold text-green-400">$850</p>
                  </div>
                  <div className="bg-white/5 p-2 rounded-lg border border-white/5">
                    <p className="text-xs text-gray-500">Recipient</p>
                    <p className="text-xs font-bold text-white">Alice Johnson</p>
                  </div>
                </div>
                <div className="mt-2 bg-white/5 p-2 rounded-lg border border-white/5">
                  <p className="text-xs text-gray-500">Tx Hash</p>
                  <p className="text-xs font-mono text-sky-400 truncate">{txHash}</p>
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
