import { useState, useSyncExternalStore } from 'react';
import { SeatSelectionMap } from '@tokenisation/sdk/components';
import {
    Music, Ticket, Coins, Shield, Users, DollarSign,
    ArrowRight, CheckCircle, Loader2, Sparkles, QrCode,
    BarChart3, TrendingUp, Tag, Eye, Radio
} from 'lucide-react';
import { useAhoyState } from '../contexts/SDKContext';
import { sdkStore } from '../store';
import { PartyType, PartyRole, LifecycleState } from '@tokenisation/sdk';
import { VerticalDemoShell, type TabDef } from './shared/VerticalDemoShell';
import { AssetLifecycleVisualizer, type LifecycleNode } from './shared/AssetLifecycleVisualizer';
import { TokenOperationsPanel } from './shared/TokenOperationsPanel';
import { EventFeed } from './shared/EventFeed';
import { ConfigureCompliance } from './blueprints/ConfigureCompliance';
import { SecondaryResaleMarket } from './blueprints/SecondaryResaleMarket';
import { SecondaryTransfer } from './blueprints/SecondaryTransfer';
import TicketLifecycleManager from './blueprints/TicketLifecycleManager';
import type { StatCard } from './shared/StatsRow';

function useStore() {
    const subscribe = (cb: () => void) => sdkStore.subscribe(cb);
    const getSnapshot = () => sdkStore.getVersion();
    useSyncExternalStore(subscribe, getSnapshot);
}

const CONCERT_LIFECYCLE: LifecycleNode[] = [
    { state: 'DRAFT', label: 'Created', description: 'Event registered' },
    { state: 'PENDING_VERIFICATION', label: 'Booked', description: 'Ticket issued' },
    { state: 'VERIFIED', label: 'Scanned', description: 'Gate validated' },
    { state: 'ACTIVE', label: 'Inside', description: 'Attending event' },
    { state: 'FROZEN', label: 'Completed', description: 'Event ended' },
    { state: 'REDEEMED', label: 'Settled', description: 'Revenue distributed' },
];

const getSeatPrice = (seatId: string) => {
    if (seatId.startsWith('A')) return 500;
    if (seatId.startsWith('B')) return 300;
    return 150;
};

const getSeatSection = (seatId: string) => {
    if (seatId.startsWith('A')) return 'VIP Section A';
    if (seatId.startsWith('B')) return 'Gold Section B';
    return 'Standard Section C';
};

export function ConcertDemo() {
    const { simulateAhoyAction, ahoyState } = useAhoyState();
    useStore();

    const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
    const [eventAssetId, setEventAssetId] = useState<string | null>(null);
    const [promoterPartyId, setPromoterPartyId] = useState<string | null>(null);
    const [fanPartyId, setFanPartyId] = useState<string | null>(null);
    const [buyerPartyId, setBuyerPartyId] = useState<string | null>(null);
    const [gateScanned, setGateScanned] = useState(false);
    const [loading, setLoading] = useState(false);

    const currentAsset = eventAssetId ? sdkStore.getAsset(eventAssetId) : null;
    const currentState = currentAsset ? String(currentAsset.state) : 'DRAFT';

    const stats: StatCard[] = [
        { label: 'Tickets Sold', value: '8,420', change: '94% capacity', changeColor: 'text-green-400', icon: Ticket, iconColor: 'text-purple-400' },
        { label: 'Revenue', value: '$2.1M', change: '+22% vs last event', changeColor: 'text-green-400', icon: DollarSign, iconColor: 'text-green-400' },
        { label: 'Resale Volume', value: '342', change: 'Avg markup: 1.4x', changeColor: 'text-blue-400', icon: TrendingUp, iconColor: 'text-blue-400' },
        { label: 'AHOY Earned', value: ahoyState.lifetimeEarned.toLocaleString(), change: `${ahoyState.tier} tier`, changeColor: 'text-amber-400', icon: Sparkles, iconColor: 'text-amber-400' },
    ];

    const complianceRules = [
        { label: 'Minimum Age (16+)', value: 'Required', status: true },
        { label: 'Ticket Limit (4 per person)', value: 'Enforced', status: true },
        { label: 'Resale Price Cap (2x face value)', value: 'Active', status: true },
        { label: 'VIP KYC Verification', value: 'VIP sections only', status: true },
        { label: 'Anti-Bot Verification', value: 'CAPTCHA + wallet check', status: true },
        { label: 'Royalty on Resale (5%)', value: 'Auto-enforced', status: true },
    ];

    // Create event & mint ticket
    const handleCreateEvent = async () => {
        setLoading(true);
        try {
            const promoter = await sdkStore.createParty({
                name: 'Cosmic Events LLC',
                type: PartyType.ORGANIZATION,
                roles: [PartyRole.ISSUER],
                jurisdiction: 'AE',
            });
            sdkStore.logSdkCall('createParty', { name: 'Cosmic Events LLC', role: 'ISSUER' });
            setPromoterPartyId(promoter.id);

            const fan = await sdkStore.createParty({
                name: 'Fan Nakamura',
                type: PartyType.INDIVIDUAL,
                roles: [PartyRole.INVESTOR],
                jurisdiction: 'JP',
            });
            sdkStore.logSdkCall('createParty', { name: 'Fan Nakamura', role: 'INVESTOR' });
            sdkStore.verifyKyc(fan.id);
            sdkStore.logSdkCall('verifyKyc', { partyId: fan.id });
            setFanPartyId(fan.id);

            const asset = await sdkStore.createAsset({
                name: 'Cosmic Beats — Dubai Arena',
                type: 'CONCERT_TICKET',
                jurisdiction: 'AE',
                metadata: { vertical: 'CONCERT', seat: selectedSeatId, section: selectedSeatId ? getSeatSection(selectedSeatId) : 'TBD' },
            });
            sdkStore.logSdkCall('createAsset', { name: 'Cosmic Beats', type: 'CONCERT_TICKET' });
            setEventAssetId(asset.id);

            await sdkStore.transition(asset.id, LifecycleState.PENDING_VERIFICATION, promoter.id);
            sdkStore.logSdkCall('transition', { assetId: asset.id, toState: 'PENDING_VERIFICATION' });

            await sdkStore.mint(asset.id, fan.id, '1');
            sdkStore.logSdkCall('mint', { assetId: asset.id, toPartyId: fan.id, amount: '1' });

            sdkStore.setAssetMetadata(asset.id, 'seatId', selectedSeatId);
            sdkStore.setAssetMetadata(asset.id, 'price', selectedSeatId ? getSeatPrice(selectedSeatId) : 150);
            sdkStore.logSdkCall('setAssetMetadata', { assetId: asset.id });

            sdkStore.createOffering(asset.id, {
                totalSupply: 10000,
                pricePerToken: selectedSeatId ? getSeatPrice(selectedSeatId) : 150,
                minInvestment: 150,
                maxInvestment: 2000,
                currency: 'USD',
            });
            sdkStore.logSdkCall('createOffering', { assetId: asset.id });

            simulateAhoyAction('TOKEN_MINTED', 'AMS');
        } finally {
            setLoading(false);
        }
    };

    const handleSecondaryTransfer = async () => {
        if (!eventAssetId || !fanPartyId) return;
        setLoading(true);
        try {
            const buyer = await sdkStore.createParty({
                name: 'Sarah Kim',
                type: PartyType.INDIVIDUAL,
                roles: [PartyRole.INVESTOR],
                jurisdiction: 'KR',
            });
            sdkStore.verifyKyc(buyer.id);
            sdkStore.logSdkCall('createParty', { name: 'Sarah Kim' });
            setBuyerPartyId(buyer.id);

            const compliance = sdkStore.checkTransferCompliance(eventAssetId, fanPartyId, buyer.id, '1');
            sdkStore.logSdkCall('checkTransferCompliance', { assetId: eventAssetId });

            if (compliance.eligible) {
                await sdkStore.transfer(eventAssetId, fanPartyId, buyer.id, '1');
                sdkStore.logSdkCall('transfer', { assetId: eventAssetId, from: fanPartyId, to: buyer.id });
                sdkStore.updateOfferingSold(eventAssetId, 1);
                sdkStore.logSdkCall('updateOfferingSold', { assetId: eventAssetId, amount: 1 });
            }

            simulateAhoyAction('PASS_TRANSFERRED', 'FLYPLUS');
        } finally {
            setLoading(false);
        }
    };

    const handleGateScan = async () => {
        if (!eventAssetId || !promoterPartyId) return;
        setLoading(true);
        try {
            const holderId = buyerPartyId || fanPartyId;
            if (holderId) {
                const balances = await sdkStore.getBalances(eventAssetId);
                sdkStore.logSdkCall('getBalances', { assetId: eventAssetId });
                const meta = sdkStore.getAssetMetadata(eventAssetId);
                sdkStore.logSdkCall('getAssetMetadata', { assetId: eventAssetId });

                const hasTicket = balances && (balances as any)[holderId] === '1';
                if (hasTicket) {
                    await sdkStore.transition(eventAssetId, LifecycleState.VERIFIED, promoterPartyId);
                    sdkStore.logSdkCall('transition', { assetId: eventAssetId, toState: 'VERIFIED' });
                    setGateScanned(true);
                }
            }
            simulateAhoyAction('CROSS_PLATFORM_SYNC', 'CONNECT');
        } finally {
            setLoading(false);
        }
    };

    const handleSettlement = async () => {
        if (!eventAssetId || !promoterPartyId) return;
        setLoading(true);
        try {
            await sdkStore.transition(eventAssetId, LifecycleState.ACTIVE, promoterPartyId);
            sdkStore.logSdkCall('transition', { assetId: eventAssetId, toState: 'ACTIVE' });
            await sdkStore.transition(eventAssetId, LifecycleState.FROZEN, promoterPartyId);
            sdkStore.logSdkCall('transition', { assetId: eventAssetId, toState: 'FROZEN' });
            await sdkStore.transition(eventAssetId, LifecycleState.REDEEMED, promoterPartyId);
            sdkStore.logSdkCall('transition', { assetId: eventAssetId, toState: 'REDEEMED' });

            sdkStore.createSettlement({
                assetId: eventAssetId,
                partyId: promoterPartyId,
                amount: 2100000,
                type: 'EVENT_REVENUE_SPLIT',
            });
            sdkStore.logSdkCall('createSettlement', { assetId: eventAssetId, type: 'EVENT_REVENUE_SPLIT' });
            simulateAhoyAction('AGENT_TASK_COMPLETION', 'CONNECT');
        } finally {
            setLoading(false);
        }
    };

    const tabs: TabDef[] = [
        {
            id: 'seats',
            label: 'Event & Seats',
            icon: Music,
            content: (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <div className="glass-card p-6 rounded-2xl border border-white/5 bg-black/40 text-center">
                            <div className="mb-8 w-full mt-4">
                                <div className="w-3/4 mx-auto h-12 bg-purple-500/20 rounded-t-full border-t-4 border-purple-500 flex items-center justify-center shadow-[0_0_50px_rgba(168,85,247,0.4)]">
                                    <span className="text-purple-300 font-bold tracking-widest text-sm uppercase">Stage</span>
                                </div>
                            </div>
                            <div className="inline-block relative">
                                <SeatSelectionMap
                                    rows={8}
                                    cols={12}
                                    blockedSeats={['A5', 'A6', 'B2', 'C8', 'D1', 'E5']}
                                    onSelect={(id) => setSelectedSeatId(id)}
                                />
                            </div>
                            <div className="flex justify-center gap-4 mt-4 text-xs text-gray-400">
                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-purple-500" /> VIP ($500)</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-500" /> Gold ($300)</span>
                                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-gray-500" /> Standard ($150)</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Event Details */}
                        <div className="glass-card p-5 rounded-xl border border-purple-500/20 bg-purple-900/5">
                            <h3 className="font-bold text-white mb-3">Cosmic Beats Live</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-gray-400">Venue</span><span className="text-white">Dubai Arena</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">Date</span><span className="text-white">Mar 15, 2026</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">Capacity</span><span className="text-white">10,000</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">Artists</span><span className="text-white">DJ Nova, Luna K</span></div>
                            </div>
                        </div>

                        {/* Ticket Selection */}
                        <div className="glass-card p-5 rounded-xl border border-purple-500/30">
                            <h3 className="font-bold text-white mb-3">Ticket Selection</h3>
                            {selectedSeatId ? (
                                <div className="space-y-3">
                                    <div className="bg-white/5 p-3 rounded-lg border border-white/10 space-y-2 text-sm">
                                        <div className="flex justify-between"><span className="text-gray-400">Seat</span><span className="text-white font-mono">{selectedSeatId}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-400">Section</span><span className="text-white">{getSeatSection(selectedSeatId)}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-400">Price</span><span className="text-green-400 font-bold text-xl">${getSeatPrice(selectedSeatId)}</span></div>
                                    </div>
                                    <button
                                        onClick={handleCreateEvent}
                                        disabled={loading || !!eventAssetId}
                                        className="w-full py-3 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ticket className="w-4 h-4" />}
                                        {eventAssetId ? 'Ticket Minted' : 'Mint NFT Ticket'}
                                    </button>
                                </div>
                            ) : (
                                <div className="text-center py-6 text-gray-500">
                                    <Ticket className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                    <p>Select a seat to view details</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ),
        },
        {
            id: 'lifecycle',
            label: 'Ticket Lifecycle',
            icon: ArrowRight,
            content: (
                <div className="space-y-6">
                    <TicketLifecycleManager
                        ticketId={eventAssetId || undefined}
                        initialState={currentState as any}
                        onStateChange={(_from, to) => {
                            sdkStore.logSdkCall('transition', { assetId: eventAssetId, toState: to });
                        }}
                    />
                    <AssetLifecycleVisualizer
                        assetId={eventAssetId || undefined}
                        currentState={currentState}
                        nodes={CONCERT_LIFECYCLE}
                        accentColor="text-purple-400"
                        actorId={promoterPartyId || undefined}
                        onTransition={() => simulateAhoyAction('CROSS_PLATFORM_SYNC', 'CONNECT')}
                    />
                </div>
            ),
        },
        {
            id: 'tokenops',
            label: 'Token Ops',
            icon: Coins,
            content: (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <TokenOperationsPanel
                        assetId={eventAssetId || undefined}
                        accentColor="text-purple-400"
                        onMint={() => simulateAhoyAction('TOKEN_MINTED', 'AMS')}
                        onTransfer={() => simulateAhoyAction('PASS_TRANSFERRED', 'FLYPLUS')}
                    />
                    <div className="space-y-6">
                        <AssetLifecycleVisualizer
                            assetId={eventAssetId || undefined}
                            currentState={currentState}
                            nodes={CONCERT_LIFECYCLE}
                            accentColor="text-purple-400"
                            actorId={promoterPartyId || undefined}
                        />
                        <EventFeed assetId={eventAssetId || undefined} accentColor="text-purple-400" />
                    </div>
                </div>
            ),
        },
        {
            id: 'secondary',
            label: 'Secondary Market',
            icon: TrendingUp,
            content: (
                <div className="space-y-6">
                    {/* Royalty Protection Badge */}
                    <div className="flex items-center gap-3 p-3 bg-[#F8B032]/5 border border-[#F8B032]/20 rounded-xl">
                        <Shield className="w-5 h-5 text-[#F8B032]" />
                        <div>
                            <span className="text-sm font-medium text-white">Royalty Protection: </span>
                            <span className="text-sm text-[#F8B032] font-bold">Enabled (CRE)</span>
                        </div>
                        <a href="/oracles" className="ml-auto text-[10px] text-gray-400 hover:text-[#F8B032] transition-colors">
                            View CRE Workflows &rarr;
                        </a>
                    </div>
                    <SecondaryResaleMarket
                        assetId={eventAssetId || 'concert-demo'}
                        assetName="Concert Ticket"
                        onPurchase={() => simulateAhoyAction('PASS_TRANSFERRED', 'FLYPLUS')}
                    />
                    {eventAssetId && fanPartyId && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="glass-card p-6 rounded-2xl border border-white/10">
                                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                                    <ArrowRight className="w-4 h-4 text-purple-400" /> Quick Transfer
                                </h3>
                                <p className="text-xs text-gray-400 mb-4">Transfer ticket to a secondary buyer with compliance check.</p>
                                <button
                                    onClick={handleSecondaryTransfer}
                                    disabled={loading || !!buyerPartyId}
                                    className="w-full py-2 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-lg hover:bg-purple-500/20 transition-all text-sm font-bold disabled:opacity-50"
                                >
                                    {buyerPartyId ? 'Transferred to Sarah Kim' : 'Transfer to Secondary Buyer'}
                                </button>
                            </div>
                            {buyerPartyId && (
                                <SecondaryTransfer
                                    assetId={eventAssetId}
                                    assetName="Cosmic Beats Ticket"
                                    fromParty={{ id: fanPartyId, name: 'Fan Nakamura', kycVerified: true, jurisdiction: 'JP' }}
                                    toParty={{ id: buyerPartyId, name: 'Sarah Kim', kycVerified: true, jurisdiction: 'KR' }}
                                    onTransfer={async () => ({ success: true })}
                                />
                            )}
                        </div>
                    )}
                </div>
            ),
        },
        {
            id: 'compliance',
            label: 'Compliance',
            icon: Shield,
            content: (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ConfigureCompliance rules={complianceRules} isEditable />
                    <div className="glass-card p-6 rounded-2xl border border-white/10">
                        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                            <Shield className="w-4 h-4 text-purple-400" /> Transfer Compliance
                        </h3>
                        <p className="text-xs text-gray-400 mb-4">Verify ticket transfer eligibility with royalty enforcement.</p>
                        <button
                            onClick={() => {
                                if (eventAssetId && fanPartyId) {
                                    const result = sdkStore.checkTransferCompliance(eventAssetId, fanPartyId, fanPartyId, '1');
                                    sdkStore.logSdkCall('checkTransferCompliance', { assetId: eventAssetId });
                                    alert(`Compliance: ${result.eligible ? 'PASSED' : 'FAILED'}\n${result.checks.map((c: any) => `${c.passed ? '✓' : '✗'} ${c.name}`).join('\n')}`);
                                }
                            }}
                            disabled={!eventAssetId}
                            className="w-full py-2 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-lg hover:bg-purple-500/20 transition-all text-sm font-bold disabled:opacity-50"
                        >
                            Run Compliance Check
                        </button>
                    </div>
                </div>
            ),
        },
        {
            id: 'gate',
            label: 'Gate Validation',
            icon: QrCode,
            content: (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="glass-card p-6 rounded-2xl border border-white/10">
                        <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                            <QrCode className="w-5 h-5 text-purple-400" /> On-Chain Gate Scan
                        </h3>
                        <p className="text-xs text-gray-400 mb-6">
                            Verify ticket ownership by checking on-chain balance. Transitions the asset to VERIFIED (scanned) state.
                        </p>

                        {gateScanned ? (
                            <div className="p-6 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
                                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/10 border-2 border-green-500/30 flex items-center justify-center">
                                    <CheckCircle className="w-10 h-10 text-green-400" />
                                </div>
                                <h4 className="text-xl font-bold text-white mb-1">Access Granted</h4>
                                <p className="text-sm text-green-400 mb-4">Ticket validated on-chain</p>
                                <div className="inline-block p-4 bg-white/5 rounded-xl border border-white/10 text-left text-sm">
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                        <span className="text-gray-500">Owner</span><span className="text-white font-bold">{buyerPartyId ? 'Sarah Kim' : 'Fan Nakamura'}</span>
                                        <span className="text-gray-500">Event</span><span className="text-white font-bold">Cosmic Beats</span>
                                        <span className="text-gray-500">Seat</span><span className="text-white font-bold">{selectedSeatId || '—'}</span>
                                        <span className="text-gray-500">Status</span><span className="text-green-400 font-bold">VERIFIED</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="p-6 bg-white/5 rounded-xl border border-dashed border-white/20 text-center">
                                    <QrCode className="w-16 h-16 text-gray-600 mx-auto mb-3" />
                                    <p className="text-sm text-gray-400">Simulate scanning a ticket at the venue gate</p>
                                    <p className="text-[10px] text-gray-600 mt-1">SDK: getBalances + getAssetMetadata + transition</p>
                                </div>
                                <button
                                    onClick={handleGateScan}
                                    disabled={loading || !eventAssetId}
                                    className="w-full py-3 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                                    Scan Ticket
                                </button>
                            </div>
                        )}
                    </div>
                    <EventFeed assetId={eventAssetId || undefined} accentColor="text-purple-400" title="Gate Events" />
                </div>
            ),
        },
        {
            id: 'settlement',
            label: 'Settlement',
            icon: BarChart3,
            content: (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="glass-card p-6 rounded-2xl border border-white/10">
                            <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-purple-400" /> Revenue Split
                            </h3>
                            <div className="space-y-3 mb-6">
                                {[
                                    { party: 'Promoter (Cosmic Events)', share: '40%', amount: '$840,000', color: 'text-purple-400' },
                                    { party: 'Venue (Dubai Arena)', share: '30%', amount: '$630,000', color: 'text-blue-400' },
                                    { party: 'Artists (DJ Nova + Luna K)', share: '25%', amount: '$525,000', color: 'text-pink-400' },
                                    { party: 'Platform Fee', share: '5%', amount: '$105,000', color: 'text-gray-400' },
                                ].map(s => (
                                    <div key={s.party} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                                        <div>
                                            <p className="text-sm text-white">{s.party}</p>
                                            <p className="text-[10px] text-gray-600">{s.share}</p>
                                        </div>
                                        <span className={`font-bold ${s.color}`}>{s.amount}</span>
                                    </div>
                                ))}
                            </div>
                            <button
                                onClick={handleSettlement}
                                disabled={loading || !eventAssetId || currentState === 'REDEEMED'}
                                className="w-full py-3 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                                {currentState === 'REDEEMED' ? 'Settlement Complete' : 'Execute Settlement'}
                            </button>
                            <p className="text-[10px] text-gray-600 text-center mt-2">SDK: transition (full chain) + createSettlement</p>
                        </div>

                        <div className="space-y-4">
                            <div className="glass-card p-5 rounded-xl border border-white/10">
                                <h4 className="font-bold text-white mb-3">Final Stats</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { label: 'Total Revenue', value: '$2.1M' },
                                        { label: 'Tickets Redeemed', value: '8,420' },
                                        { label: 'Resale Royalties', value: '$17,100' },
                                        { label: 'AHOY Distributed', value: '42,100' },
                                    ].map(s => (
                                        <div key={s.label} className="p-3 bg-white/5 rounded-lg">
                                            <p className="text-[10px] text-gray-500">{s.label}</p>
                                            <p className="text-sm font-bold text-white">{s.value}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <EventFeed assetId={eventAssetId || undefined} accentColor="text-purple-400" title="Settlement Events" />
                        </div>
                    </div>
                </div>
            ),
        },
    ];

    return (
        <VerticalDemoShell
            title="VibeTix"
            subtitle="NFT Ticketing Platform"
            icon={Music}
            gradientFrom="from-purple-500"
            gradientTo="to-indigo-600"
            accentColor="text-purple-400"
            ahoyVertical="CONNECT"
            stats={stats}
            tabs={tabs}
        />
    );
}
