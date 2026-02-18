import { useState } from 'react';
import {
  Building2, Plane, Hotel, Car, Music, Settings,
} from 'lucide-react';
import { sdkStore } from '../../store';
import { LifecycleState, RightType, PartyRole, PartyType } from '@tokenisation/sdk';
import { isKycVerified } from '../../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Vertical = 'realEstate' | 'airline' | 'hotel' | 'carRental' | 'concert' | 'crossCutting';

interface SectorAction {
  label: string;
  action: () => void | Promise<void>;
  color: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find or create an issuer-like party for a sector. */
function ensureParty(name: string, role: PartyRole, jurisdiction = 'AE') {
  const parties = sdkStore.getParties();
  const existing = parties.find(p => p.name === name);
  if (existing) return existing;
  sdkStore.logSdkCall('parties.create', { name, role, jurisdiction });
  return sdkStore.sdk.parties_.create({
    name,
    type: PartyType.ORGANIZATION,
    roles: [role],
    jurisdiction,
  });
}

function ensureInvestorParty(name: string, jurisdiction = 'AE') {
  const parties = sdkStore.getParties();
  const existing = parties.find(p => p.name === name);
  if (existing) return existing;
  sdkStore.logSdkCall('parties.create', { name, role: 'INVESTOR', jurisdiction });
  const party = sdkStore.sdk.parties_.create({
    name,
    type: PartyType.INDIVIDUAL,
    roles: [PartyRole.INVESTOR],
    jurisdiction,
  });
  sdkStore.sdk.parties_.setKyc(party.id, true);
  return party;
}

function findAssetByName(name: string) {
  return sdkStore.getAssets().find(a => a.name === name) ?? null;
}

async function fullActivation(assetId: string, actorId: string) {
  const stateOrder = [
    LifecycleState.DRAFT,
    LifecycleState.PENDING_VERIFICATION,
    LifecycleState.VERIFIED,
    LifecycleState.ACTIVE,
  ];
  const asset = sdkStore.getAsset(assetId);
  if (!asset) return { success: false, error: 'Asset not found' };
  const currentIdx = stateOrder.indexOf(asset.state as LifecycleState);
  for (let i = currentIdx + 1; i < stateOrder.length; i++) {
    const next = stateOrder[i];
    sdkStore.logSdkCall('assets.transition', { assetId, state: next, actorId });
    const res = await sdkStore.transition(assetId, next, actorId);
    if (!res.success) return res;
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// Vertical tab definitions
// ---------------------------------------------------------------------------

const TABS: { key: Vertical; label: string; icon: typeof Building2; accent: string }[] = [
  { key: 'realEstate', label: 'Real Estate', icon: Building2, accent: 'emerald' },
  { key: 'airline', label: 'Airline', icon: Plane, accent: 'sky' },
  { key: 'hotel', label: 'Hotel', icon: Hotel, accent: 'violet' },
  { key: 'carRental', label: 'Car Rental', icon: Car, accent: 'amber' },
  { key: 'concert', label: 'Concert', icon: Music, accent: 'pink' },
  { key: 'crossCutting', label: 'Cross-Cutting', icon: Settings, accent: 'gray' },
];

// Map accent names to Tailwind classes (avoids dynamic class generation issues)
const ACCENT_STYLES: Record<string, { tab: string; tabActive: string; btn: string }> = {
  emerald: {
    tab: 'text-emerald-400/60 hover:text-emerald-400',
    tabActive: 'text-emerald-400 border-emerald-400',
    btn: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20',
  },
  sky: {
    tab: 'text-sky-400/60 hover:text-sky-400',
    tabActive: 'text-sky-400 border-sky-400',
    btn: 'text-sky-400 border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20',
  },
  violet: {
    tab: 'text-violet-400/60 hover:text-violet-400',
    tabActive: 'text-violet-400 border-violet-400',
    btn: 'text-violet-400 border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20',
  },
  amber: {
    tab: 'text-amber-400/60 hover:text-amber-400',
    tabActive: 'text-amber-400 border-amber-400',
    btn: 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20',
  },
  pink: {
    tab: 'text-pink-400/60 hover:text-pink-400',
    tabActive: 'text-pink-400 border-pink-400',
    btn: 'text-pink-400 border-pink-500/30 bg-pink-500/10 hover:bg-pink-500/20',
  },
  gray: {
    tab: 'text-gray-400/60 hover:text-gray-400',
    tabActive: 'text-gray-400 border-gray-400',
    btn: 'text-gray-400 border-gray-500/30 bg-gray-500/10 hover:bg-gray-500/20',
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ManualOverridePanel() {
  const [activeVertical, setActiveVertical] = useState<Vertical>('realEstate');
  const [status, setStatus] = useState<string>('');

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(''), 4000);
  };

  // =========================================================================
  // REAL ESTATE actions
  // =========================================================================
  const realEstateActions: SectorAction[] = [
    {
      label: 'Create Property',
      color: 'emerald',
      action: async () => {
        const issuer = ensureParty('Marina Developments LLC', PartyRole.ISSUER, 'AE');
        sdkStore.logSdkCall('assets.create', { name: 'Marina Tower Unit', rightType: 'OWNERSHIP', jurisdiction: 'AE' });
        const asset = await sdkStore.createAsset({
          name: 'Marina Tower Unit',
          rightType: RightType.OWNERSHIP,
          jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
          issuerId: issuer.id,
        });
        showStatus(`Created property "${asset.name}" (${asset.id.slice(0, 8)}…)`);
      },
    },
    {
      label: 'Verify & Activate',
      color: 'emerald',
      action: async () => {
        const asset = findAssetByName('Marina Tower Unit');
        if (!asset) { showStatus('No property found — create one first'); return; }
        const issuer = ensureParty('Marina Developments LLC', PartyRole.ISSUER, 'AE');
        const res = await fullActivation(asset.id, issuer.id);
        showStatus(res.success ? `Property "${asset.name}" is now ACTIVE` : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Mint Shares',
      color: 'emerald',
      action: async () => {
        const asset = findAssetByName('Marina Tower Unit');
        if (!asset) { showStatus('No property found — create one first'); return; }
        const investor = ensureInvestorParty('Gulf Investor Fund');
        sdkStore.logSdkCall('tokens.mint', { assetId: asset.id, toPartyId: investor.id, amount: '500' });
        const res = await sdkStore.mint(asset.id, investor.id, '500');
        showStatus(res.success ? 'Tokenized property into 500 share tokens' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Transfer Shares',
      color: 'emerald',
      action: async () => {
        const asset = findAssetByName('Marina Tower Unit');
        if (!asset) { showStatus('No property found — create one first'); return; }
        const from = ensureInvestorParty('Gulf Investor Fund');
        const to = ensureInvestorParty('Nordic Capital Partners');
        sdkStore.logSdkCall('tokens.transfer', { assetId: asset.id, from: from.id, to: to.id, amount: '50' });
        const res = await sdkStore.transfer(asset.id, from.id, to.id, '50');
        showStatus(res.success ? 'Transferred 50 shares (secondary market sale)' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Valuation Update',
      color: 'emerald',
      action: () => {
        const asset = findAssetByName('Marina Tower Unit');
        if (!asset) { showStatus('No property found — create one first'); return; }
        const newValue = Math.round(Math.random() * 3_000_000 + 2_000_000);
        sdkStore.logSdkCall('assets.updateValuation', { assetId: asset.id, newValue });
        const result = sdkStore.updateAssetValuation(asset.id, newValue);
        showStatus(`Valuation updated to $${newValue.toLocaleString()} (${result.changePct >= 0 ? '+' : ''}${result.changePct.toFixed(1)}%)`);
      },
    },
    {
      label: 'Compliance Check',
      color: 'emerald',
      action: () => {
        const asset = findAssetByName('Marina Tower Unit');
        if (!asset) { showStatus('No property found — create one first'); return; }
        const from = ensureInvestorParty('Gulf Investor Fund');
        const to = ensureInvestorParty('Nordic Capital Partners');
        sdkStore.logSdkCall('compliance.checkTransfer', { assetId: asset.id, from: from.id, to: to.id, amount: '100' });
        const result = sdkStore.checkTransferCompliance(asset.id, from.id, to.id, '100');
        const passed = result.checks.filter(c => c.passed).length;
        showStatus(`Compliance: ${result.eligible ? 'ELIGIBLE' : 'BLOCKED'} (${passed}/${result.checks.length} checks passed)`);
      },
    },
  ];

  // =========================================================================
  // AIRLINE actions
  // =========================================================================
  const airlineActions: SectorAction[] = [
    {
      label: 'Create Flight',
      color: 'sky',
      action: async () => {
        const airline = ensureParty('Emirates Airlines', PartyRole.ISSUER, 'AE');
        sdkStore.logSdkCall('assets.create', { name: 'DXB→LHR EK001', rightType: 'ACCESS' });
        const asset = await sdkStore.createAsset({
          name: 'DXB→LHR EK001',
          rightType: RightType.ACCESS,
          jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
          issuerId: airline.id,
        });
        showStatus(`Created flight "${asset.name}"`);
      },
    },
    {
      label: 'Issue Ticket',
      color: 'sky',
      action: async () => {
        const asset = findAssetByName('DXB→LHR EK001');
        if (!asset) { showStatus('No flight found — create one first'); return; }
        const airline = ensureParty('Emirates Airlines', PartyRole.ISSUER, 'AE');
        const res = await fullActivation(asset.id, airline.id);
        showStatus(res.success ? 'Ticket issued — flight is now ACTIVE' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Mint Boarding Pass',
      color: 'sky',
      action: async () => {
        const asset = findAssetByName('DXB→LHR EK001');
        if (!asset) { showStatus('No flight found — create one first'); return; }
        const passenger = ensureInvestorParty('Passenger A. Khan');
        sdkStore.logSdkCall('tokens.mint', { assetId: asset.id, toPartyId: passenger.id, amount: '1' });
        const res = await sdkStore.mint(asset.id, passenger.id, '1');
        showStatus(res.success ? 'Issued boarding pass for DXB→LHR' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Transfer Ticket',
      color: 'sky',
      action: async () => {
        const asset = findAssetByName('DXB→LHR EK001');
        if (!asset) { showStatus('No flight found — create one first'); return; }
        const from = ensureInvestorParty('Passenger A. Khan');
        const to = ensureInvestorParty('Passenger B. Ahmed');
        sdkStore.logSdkCall('tokens.transfer', { assetId: asset.id, from: from.id, to: to.id, amount: '1' });
        const res = await sdkStore.transfer(asset.id, from.id, to.id, '1');
        showStatus(res.success ? 'Ticket transferred (name change / swap)' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Flight Delay Oracle',
      color: 'sky',
      action: () => {
        const asset = findAssetByName('DXB→LHR EK001');
        if (!asset) { showStatus('No flight found — create one first'); return; }
        sdkStore.setAssetMetadata(asset.id, 'flightStatus', 'DELAYED');
        sdkStore.setAssetMetadata(asset.id, 'delayMinutes', 180);
        sdkStore.logSdkCall('oracle.flightStatusUpdate', { assetId: asset.id, status: 'DELAYED', delayMinutes: 180 });
        sdkStore.updateAssetValuation(asset.id, 0); // price impact
        showStatus('Oracle: Flight DELAYED (180 min) for DXB→LHR EK001');
      },
    },
    {
      label: 'Cancel & Refund',
      color: 'sky',
      action: async () => {
        const asset = findAssetByName('DXB→LHR EK001');
        if (!asset) { showStatus('No flight found — create one first'); return; }
        const airline = ensureParty('Emirates Airlines', PartyRole.ISSUER, 'AE');
        sdkStore.logSdkCall('assets.transition', { assetId: asset.id, state: 'FROZEN', actorId: airline.id });
        const res = await sdkStore.transition(asset.id, LifecycleState.FROZEN, airline.id);
        showStatus(res.success ? 'Flight cancelled — ticket FROZEN (refund pending)' : `Failed: ${res.error}`);
      },
    },
  ];

  // =========================================================================
  // HOTEL actions
  // =========================================================================
  const hotelActions: SectorAction[] = [
    {
      label: 'Create Reservation',
      color: 'violet',
      action: async () => {
        const hotel = ensureParty('LuxeStay Hotels', PartyRole.ISSUER, 'AE');
        sdkStore.logSdkCall('assets.create', { name: 'LuxeStay Deluxe Suite 3N', rightType: 'ACCESS' });
        const asset = await sdkStore.createAsset({
          name: 'LuxeStay Deluxe Suite 3N',
          rightType: RightType.ACCESS,
          jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
          issuerId: hotel.id,
        });
        showStatus(`Created reservation "${asset.name}"`);
      },
    },
    {
      label: 'Confirm Booking',
      color: 'violet',
      action: async () => {
        const asset = findAssetByName('LuxeStay Deluxe Suite 3N');
        if (!asset) { showStatus('No reservation found — create one first'); return; }
        const hotel = ensureParty('LuxeStay Hotels', PartyRole.ISSUER, 'AE');
        const res = await fullActivation(asset.id, hotel.id);
        showStatus(res.success ? 'Booking confirmed — reservation is ACTIVE' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Mint Room Key',
      color: 'violet',
      action: async () => {
        const asset = findAssetByName('LuxeStay Deluxe Suite 3N');
        if (!asset) { showStatus('No reservation found — create one first'); return; }
        const guest = ensureInvestorParty('Guest M. Chen');
        sdkStore.logSdkCall('tokens.mint', { assetId: asset.id, toPartyId: guest.id, amount: '1' });
        const res = await sdkStore.mint(asset.id, guest.id, '1');
        showStatus(res.success ? 'Digital room key issued to guest' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Transfer Booking',
      color: 'violet',
      action: async () => {
        const asset = findAssetByName('LuxeStay Deluxe Suite 3N');
        if (!asset) { showStatus('No reservation found — create one first'); return; }
        const from = ensureInvestorParty('Guest M. Chen');
        const to = ensureInvestorParty('Guest L. Park');
        sdkStore.logSdkCall('tokens.transfer', { assetId: asset.id, from: from.id, to: to.id, amount: '1' });
        const res = await sdkStore.transfer(asset.id, from.id, to.id, '1');
        showStatus(res.success ? 'Booking transferred (guest name change)' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Extend Stay',
      color: 'violet',
      action: () => {
        const asset = findAssetByName('LuxeStay Deluxe Suite 3N');
        if (!asset) { showStatus('No reservation found — create one first'); return; }
        const newRate = Math.round(Math.random() * 500 + 800);
        sdkStore.logSdkCall('assets.updateValuation', { assetId: asset.id, newRate });
        sdkStore.updateAssetValuation(asset.id, newRate);
        showStatus(`Stay extended — rate adjusted to $${newRate}/night`);
      },
    },
    {
      label: 'Mark No-Show',
      color: 'violet',
      action: async () => {
        const asset = findAssetByName('LuxeStay Deluxe Suite 3N');
        if (!asset) { showStatus('No reservation found — create one first'); return; }
        const hotel = ensureParty('LuxeStay Hotels', PartyRole.ISSUER, 'AE');
        sdkStore.logSdkCall('assets.transition', { assetId: asset.id, state: 'FROZEN', actorId: hotel.id });
        const res = await sdkStore.transition(asset.id, LifecycleState.FROZEN, hotel.id);
        showStatus(res.success ? 'Guest marked as NO-SHOW — reservation FROZEN' : `Failed: ${res.error}`);
      },
    },
  ];

  // =========================================================================
  // CAR RENTAL actions
  // =========================================================================
  const carRentalActions: SectorAction[] = [
    {
      label: 'Create Rental',
      color: 'amber',
      action: async () => {
        const company = ensureParty('Velocity Rentals', PartyRole.ISSUER, 'AE');
        sdkStore.logSdkCall('assets.create', { name: 'Tesla Model S 7-Day', rightType: 'ACCESS' });
        const asset = await sdkStore.createAsset({
          name: 'Tesla Model S 7-Day',
          rightType: RightType.ACCESS,
          jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
          issuerId: company.id,
        });
        showStatus(`Created rental "${asset.name}"`);
      },
    },
    {
      label: 'Confirm & Activate',
      color: 'amber',
      action: async () => {
        const asset = findAssetByName('Tesla Model S 7-Day');
        if (!asset) { showStatus('No rental found — create one first'); return; }
        const company = ensureParty('Velocity Rentals', PartyRole.ISSUER, 'AE');
        const res = await fullActivation(asset.id, company.id);
        showStatus(res.success ? 'Rental confirmed — agreement ACTIVE' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Mint Rental Token',
      color: 'amber',
      action: async () => {
        const asset = findAssetByName('Tesla Model S 7-Day');
        if (!asset) { showStatus('No rental found — create one first'); return; }
        const driver = ensureInvestorParty('Driver J. Smith');
        sdkStore.logSdkCall('tokens.mint', { assetId: asset.id, toPartyId: driver.id, amount: '1' });
        const res = await sdkStore.mint(asset.id, driver.id, '1');
        showStatus(res.success ? 'Digital rental agreement token issued' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Transfer Driver',
      color: 'amber',
      action: async () => {
        const asset = findAssetByName('Tesla Model S 7-Day');
        if (!asset) { showStatus('No rental found — create one first'); return; }
        const from = ensureInvestorParty('Driver J. Smith');
        const to = ensureInvestorParty('Driver K. Lee');
        sdkStore.logSdkCall('tokens.transfer', { assetId: asset.id, from: from.id, to: to.id, amount: '1' });
        const res = await sdkStore.transfer(asset.id, from.id, to.id, '1');
        showStatus(res.success ? 'Driver swapped on rental agreement' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Damage Deposit',
      color: 'amber',
      action: () => {
        const asset = findAssetByName('Tesla Model S 7-Day');
        if (!asset) { showStatus('No rental found — create one first'); return; }
        const driver = ensureInvestorParty('Driver J. Smith');
        sdkStore.logSdkCall('settlements.create', { assetId: asset.id, partyId: driver.id, amount: 500, type: 'DEPOSIT' });
        sdkStore.createSettlement({ assetId: asset.id, partyId: driver.id, amount: 500, type: 'DEPOSIT' });
        showStatus('Damage deposit of $500 settled');
      },
    },
    {
      label: 'Return Vehicle',
      color: 'amber',
      action: async () => {
        const asset = findAssetByName('Tesla Model S 7-Day');
        if (!asset) { showStatus('No rental found — create one first'); return; }
        const company = ensureParty('Velocity Rentals', PartyRole.ISSUER, 'AE');
        sdkStore.setAssetMetadata(asset.id, 'vehicleCondition', 'GOOD');
        sdkStore.logSdkCall('assets.setMetadata', { assetId: asset.id, key: 'vehicleCondition', value: 'GOOD' });
        sdkStore.logSdkCall('assets.transition', { assetId: asset.id, state: 'FROZEN', actorId: company.id });
        const res = await sdkStore.transition(asset.id, LifecycleState.FROZEN, company.id);
        showStatus(res.success ? 'Vehicle returned (condition: GOOD) — rental closed' : `Failed: ${res.error}`);
      },
    },
  ];

  // =========================================================================
  // CONCERT actions
  // =========================================================================
  const concertActions: SectorAction[] = [
    {
      label: 'Create Event',
      color: 'pink',
      action: async () => {
        const venue = ensureParty('VibeTix Venues', PartyRole.ISSUER, 'AE');
        sdkStore.logSdkCall('assets.create', { name: 'VibeTix Main Stage', rightType: 'ACCESS' });
        const asset = await sdkStore.createAsset({
          name: 'VibeTix Main Stage',
          rightType: RightType.ACCESS,
          jurisdiction: { countryCode: 'AE', accreditedOnly: false, blockedJurisdictions: [] },
          issuerId: venue.id,
        });
        showStatus(`Created event "${asset.name}"`);
      },
    },
    {
      label: 'Issue Tickets',
      color: 'pink',
      action: async () => {
        const asset = findAssetByName('VibeTix Main Stage');
        if (!asset) { showStatus('No event found — create one first'); return; }
        const venue = ensureParty('VibeTix Venues', PartyRole.ISSUER, 'AE');
        const res = await fullActivation(asset.id, venue.id);
        showStatus(res.success ? 'Tickets issued — event is ACTIVE' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Mint Ticket Batch',
      color: 'pink',
      action: async () => {
        const asset = findAssetByName('VibeTix Main Stage');
        if (!asset) { showStatus('No event found — create one first'); return; }
        const fan = ensureInvestorParty('Fan S. Rivera');
        sdkStore.logSdkCall('tokens.mint', { assetId: asset.id, toPartyId: fan.id, amount: '4' });
        const res = await sdkStore.mint(asset.id, fan.id, '4');
        showStatus(res.success ? 'Minted 4 tickets (group booking)' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Resale Transfer',
      color: 'pink',
      action: async () => {
        const asset = findAssetByName('VibeTix Main Stage');
        if (!asset) { showStatus('No event found — create one first'); return; }
        const from = ensureInvestorParty('Fan S. Rivera');
        const to = ensureInvestorParty('Fan T. Nakamura');
        sdkStore.logSdkCall('tokens.transfer', { assetId: asset.id, from: from.id, to: to.id, amount: '1' });
        const res = await sdkStore.transfer(asset.id, from.id, to.id, '1');
        showStatus(res.success ? 'Ticket resold on secondary market' : `Failed: ${res.error}`);
      },
    },
    {
      label: 'Age Verify',
      color: 'pink',
      action: () => {
        const fan = ensureInvestorParty('Fan T. Nakamura');
        sdkStore.logSdkCall('parties.setKyc', { partyId: fan.id, verified: true });
        sdkStore.verifyKyc(fan.id);
        showStatus(`Age verification passed for "${fan.name}"`);
      },
    },
    {
      label: 'Cancel Event',
      color: 'pink',
      action: async () => {
        const asset = findAssetByName('VibeTix Main Stage');
        if (!asset) { showStatus('No event found — create one first'); return; }
        const venue = ensureParty('VibeTix Venues', PartyRole.ISSUER, 'AE');
        sdkStore.logSdkCall('assets.transition', { assetId: asset.id, state: 'FROZEN', actorId: venue.id });
        const res = await sdkStore.transition(asset.id, LifecycleState.FROZEN, venue.id);
        if (res.success) {
          sdkStore.logSdkCall('compliance.checkTransfer', { assetId: asset.id, note: 'post-cancellation compliance' });
        }
        showStatus(res.success ? 'Event cancelled — tickets FROZEN' : `Failed: ${res.error}`);
      },
    },
  ];

  // =========================================================================
  // CROSS-CUTTING actions
  // =========================================================================
  const crossCuttingActions: SectorAction[] = [
    {
      label: 'KYC Approve All',
      color: 'gray',
      action: () => {
        const parties = sdkStore.getParties();
        const unverified = parties.filter(p => !isKycVerified(p));
        if (unverified.length === 0) { showStatus('All parties already verified'); return; }
        unverified.forEach(p => {
          sdkStore.logSdkCall('parties.setKyc', { partyId: p.id, verified: true });
          sdkStore.verifyKyc(p.id);
        });
        showStatus(`Verified ${unverified.length} parties`);
      },
    },
    {
      label: 'Force KYC Fail',
      color: 'gray',
      action: () => {
        const parties = sdkStore.getParties();
        const verified = parties.filter(p => isKycVerified(p));
        if (verified.length === 0) { showStatus('No verified parties to fail'); return; }
        const target = verified[verified.length - 1];
        sdkStore.sdk.parties_.setKyc(target.id, false);
        sdkStore.logSdkCall('parties.setKyc', { partyId: target.id, verified: false });
        showStatus(`KYC FAILED for "${target.name}"`);
      },
    },
    {
      label: 'Block Jurisdiction',
      color: 'gray',
      action: () => {
        const assets = sdkStore.getAssets();
        if (assets.length === 0) { showStatus('No assets available'); return; }
        const asset = assets[0];
        sdkStore.setAssetMetadata(asset.id, 'blockedJurisdiction', 'KP');
        sdkStore.logSdkCall('compliance.blockJurisdiction', { assetId: asset.id, jurisdiction: 'KP' });
        showStatus(`Blocked jurisdiction "KP" on "${asset.name}"`);
      },
    },
    {
      label: 'Clear Snapshots',
      color: 'gray',
      action: () => {
        sdkStore.clearSnapshots();
        showStatus('Debugger snapshots cleared');
      },
    },
  ];

  // =========================================================================
  // Action map
  // =========================================================================
  const SECTOR_ACTIONS: Record<Vertical, SectorAction[]> = {
    realEstate: realEstateActions,
    airline: airlineActions,
    hotel: hotelActions,
    carRental: carRentalActions,
    concert: concertActions,
    crossCutting: crossCuttingActions,
  };

  const activeTab = TABS.find(t => t.key === activeVertical)!;
  const actions = SECTOR_ACTIONS[activeVertical];
  const styles = ACCENT_STYLES[activeTab.accent];

  return (
    <div className="space-y-3 p-2">
      <p className="text-xs text-gray-500">
        Sector-specific SDK actions. Each button triggers real pack engine operations.
      </p>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b border-gray-700/50 pb-1">
        {TABS.map(({ key, label, icon: Icon, accent }) => {
          const isActive = key === activeVertical;
          const s = ACCENT_STYLES[accent];
          return (
            <button
              key={key}
              onClick={() => setActiveVertical(key)}
              className={`flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium rounded-t transition-colors border-b-2 ${
                isActive
                  ? `${s.tabActive} bg-white/5`
                  : `${s.tab} border-transparent`
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Action grid */}
      <div className="grid grid-cols-2 gap-2">
        {actions.map(({ label, action }) => (
          <button
            key={label}
            onClick={action}
            className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors text-left ${styles.btn}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Status toast */}
      {status && (
        <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 font-mono">
          {status}
        </div>
      )}
    </div>
  );
}
