/**
 * FlyPlusDemo - Travel Services with Tokenization
 *
 * Demonstrates:
 * - Flight Pass NFTs - Transferable travel access tokens
 * - Delay Insurance - Oracle-triggered automatic payouts
 * - AHOY Token earn/burn flows for travel services
 * - Real SDK asset creation with marketplace
 * - Tokenized Service Credits - Prepaid services (luggage, check-in, etc.)
 */

import { useState, useEffect, useSyncExternalStore } from 'react';
import {
    Plane, QrCode, ShieldCheck, CheckCircle2,
    AlertCircle, DollarSign, Users, Scale, Plus,
    Coins, TrendingUp, TrendingDown, Sparkles, Ticket, Clock,
    Luggage, CreditCard, Package, ShieldPlus
} from 'lucide-react';
import { useFlyPlusPasses, FlightPass } from '../hooks/useVerticals';
import { useAhoyState, useSDK } from '../contexts/SDKContext';
import { AhoyBalanceWidget, AhoyActionButton } from './AhoyBalanceWidget';
import { sdkStore, type FlyPlusFlight, type FlyPlusBooking, type FlyPlusServiceType, FLYPLUS_SERVICE_CATALOG } from '../store';

// Custom hook for FlyPlus store data
function useFlyPlusStore() {
    const subscribe = (callback: () => void) => sdkStore.subscribe(callback);
    const getSnapshot = () => sdkStore.getVersion();

    useSyncExternalStore(subscribe, getSnapshot);

    return {
        flights: sdkStore.getFlights(),
        bookings: sdkStore.getBookings(),
        serviceCredits: sdkStore.getServiceCredits(),
        serviceCatalog: sdkStore.getServiceCatalog(),
        serviceRedemptions: sdkStore.getServiceRedemptions(),
        bookFlight: sdkStore.bookFlight.bind(sdkStore),
        checkIn: sdkStore.checkInBooking.bind(sdkStore),
        transferBooking: sdkStore.transferBooking.bind(sdkStore),
        claimInsurance: sdkStore.claimInsurance.bind(sdkStore),
        simulateDelay: sdkStore.simulateFlightDelay.bind(sdkStore),
        purchaseLoungeAccess: sdkStore.purchaseLoungeAccess.bind(sdkStore),
        requestSeatUpgrade: sdkStore.requestSeatUpgrade.bind(sdkStore),
        purchaseServiceCredits: sdkStore.purchaseServiceCredits.bind(sdkStore),
        redeemServiceCredits: sdkStore.redeemServiceCredits.bind(sdkStore),
    };
}

export function FlyPlusDemo() {
    const [activeTab, setActiveTab] = useState<'trips' | 'services' | 'tokenization' | 'wallet'>('trips');
    const [showSellModal, setShowSellModal] = useState(false);
    const [showBookModal, setShowBookModal] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<FlyPlusBooking | null>(null);
    const [selectedFlight, setSelectedFlight] = useState<FlyPlusFlight | null>(null);
    const [sellPrice, setSellPrice] = useState('250');
    const [creditsToBuy, setCreditsToBuy] = useState(100);
    const [isProcessing, setIsProcessing] = useState(false);
    const [recentAction, setRecentAction] = useState<{ action: string; points: number } | null>(null);

    // Wire to real store data
    const {
        flights,
        bookings,
        serviceCredits,
        serviceCatalog,
        bookFlight,
        checkIn,
        transferBooking,
        claimInsurance,
        simulateDelay,
        purchaseLoungeAccess,
        requestSeatUpgrade,
        purchaseServiceCredits,
        redeemServiceCredits,
    } = useFlyPlusStore();

    // Wire to SDK via hooks for legacy support
    const {
        passes,
        isLoading,
        purchasePass,
        transferPass,
        checkFlightStatus
    } = useFlyPlusPasses();

    const { ahoyState, simulateAhoyAction } = useAhoyState();
    const { assets } = useSDK();

    // Get FLYPLUS-related assets from SDK
    const flyPlusAssets = assets.filter(a => a.metadata?.vertical === 'FLYPLUS');

    // Clear recent action after 3 seconds
    useEffect(() => {
        if (recentAction) {
            const timer = setTimeout(() => setRecentAction(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [recentAction]);

    // Use real bookings from store
    const activeBookings = bookings.filter(b => b.status !== 'TRANSFERRED' && b.status !== 'CANCELLED');

    // Handler: Book a flight
    const handleBookFlight = async (flight: FlyPlusFlight, seatClass: 'ECONOMY' | 'BUSINESS' | 'FIRST') => {
        setIsProcessing(true);
        const result = bookFlight({
            flightId: flight.id,
            passengerName: 'Demo User',
            passengerEmail: 'demo@ahoy.com',
            seatClass,
            hasInsurance: true,
        });
        if (result.success && result.ahoyEarned) {
            setRecentAction({ action: 'Flight Booked!', points: result.ahoyEarned });
        }
        setIsProcessing(false);
        setShowBookModal(false);
        setSelectedFlight(null);
    };

    // Handler: Check in
    const handleCheckIn = (bookingId: string) => {
        const result = checkIn(bookingId);
        if (result.success) {
            setRecentAction({ action: 'Checked In!', points: 25 });
        }
    };

    // Handler: Simulate delay for testing insurance
    const handleSimulateDelay = (flightId: string) => {
        const delayMinutes = 90 + Math.floor(Math.random() * 60); // 90-150 min delay
        simulateDelay(flightId, delayMinutes);
        setRecentAction({ action: `Flight Delayed ${delayMinutes}min`, points: 0 });
    };

    // Handler: Claim insurance
    const handleClaimInsurance = (bookingId: string) => {
        const result = claimInsurance(bookingId);
        if (result.success && result.ahoyEarned) {
            setRecentAction({ action: `Insurance Claimed! $${result.payout}`, points: result.ahoyEarned });
        } else if (result.error) {
            setRecentAction({ action: result.error, points: 0 });
        }
    };

    // Handler: Purchase service credits
    const handlePurchaseCredits = () => {
        setIsProcessing(true);
        const result = purchaseServiceCredits(creditsToBuy);
        if (result.success) {
            setRecentAction({ action: `${creditsToBuy} Fly+ Credits Purchased`, points: -result.ahoyCost });
        } else {
            setRecentAction({ action: result.error || 'Purchase failed', points: 0 });
        }
        setIsProcessing(false);
    };

    // Handler: Redeem service
    const handleRedeemService = (serviceType: FlyPlusServiceType, bookingId?: string) => {
        const service = serviceCatalog.find(s => s.serviceType === serviceType);
        const result = redeemServiceCredits(serviceType, bookingId);
        if (result.success) {
            setRecentAction({ action: `${service?.name} Redeemed`, points: -result.creditsUsed });
        } else {
            setRecentAction({ action: result.error || 'Redemption failed', points: 0 });
        }
    };

    const handleSellTicket = async () => {
        if (!selectedTicket) return;
        setIsProcessing(true);

        const result = transferBooking(selectedTicket.id, '0xBuyerAddress123');
        if (result.success && result.ahoyEarned) {
            setRecentAction({ action: 'Pass Transferred', points: result.ahoyEarned });
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        setIsProcessing(false);
        setShowSellModal(false);
        setSelectedTicket(null);
    };

    const handleLoungeAccess = async (bookingId: string) => {
        const result = purchaseLoungeAccess(bookingId);
        if (result.success) {
            setRecentAction({ action: 'Lounge Access Purchased', points: -result.ahoyCost! });
        } else {
            setRecentAction({ action: result.error || 'Purchase failed', points: 0 });
        }
    };

    const handleSeatUpgrade = async (bookingId: string) => {
        const result = requestSeatUpgrade(bookingId);
        if (result.success) {
            setRecentAction({ action: `Upgraded to ${result.newClass}`, points: -result.ahoyCost! });
        } else {
            setRecentAction({ action: result.error || 'Upgrade failed', points: 0 });
        }
    };

    // Get flight status for a booking
    const getFlightForBooking = (booking: FlyPlusBooking) => {
        return flights.find(f => f.id === booking.flightId);
    };

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Header with AHOY Balance */}
            <div className="flex items-start justify-between mb-6 gap-6">
                <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-gradient-to-br from-sky-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-sky-500/20">
                        <Plane className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">FLY+</h1>
                        <p className="text-sm text-sky-400 font-medium">Sovereign Travel Identity</p>
                        <p className="text-xs text-gray-500 mt-0.5">Tokenized flight passes & insurance</p>
                    </div>
                </div>

                {/* AHOY Balance Widget */}
                <div className="w-72">
                    <AhoyBalanceWidget vertical="FLYPLUS" />
                </div>
            </div>

            {/* Recent Action Toast */}
            {recentAction && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg animate-in slide-in-from-top-4 duration-300 flex items-center gap-3 ${
                    recentAction.points > 0
                        ? 'bg-green-500/90 text-white'
                        : 'bg-red-500/90 text-white'
                }`}>
                    {recentAction.points > 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                    <div>
                        <p className="font-bold">{recentAction.action}</p>
                        <p className="text-sm opacity-90">{recentAction.points > 0 ? '+' : ''}{recentAction.points} AHOY</p>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6">
                <button
                    onClick={() => setActiveTab('trips')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'trips' ? 'bg-sky-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Plane className="w-4 h-4" /> My Trips
                </button>
                <button
                    onClick={() => setActiveTab('services')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'services' ? 'bg-green-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <CreditCard className="w-4 h-4" /> Service Credits
                    {serviceCredits.balance > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-green-400/20 text-green-300 rounded-full">
                            {serviceCredits.balance}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('tokenization')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'tokenization' ? 'bg-amber-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Coins className="w-4 h-4" /> Tokenization
                </button>
                <button
                    onClick={() => setActiveTab('wallet')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        activeTab === 'wallet' ? 'bg-purple-500 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                >
                    <Ticket className="w-4 h-4" /> Benefits
                </button>
            </div>

            {/* Trips Tab */}
            {activeTab === 'trips' && (
                <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 space-y-4">
                        {/* My Bookings */}
                        {activeBookings.length === 0 ? (
                            <div className="glass-card p-8 rounded-2xl border border-white/10 text-center">
                                <Plane className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                                <p className="text-gray-400">No bookings yet. Book a flight to get started!</p>
                            </div>
                        ) : (
                            activeBookings.map(booking => {
                                const flight = getFlightForBooking(booking);
                                const isDelayed = flight?.status === 'DELAYED';
                                return (
                                    <div key={booking.id} className="relative overflow-hidden group">
                                        <div className={`absolute inset-0 bg-gradient-to-r ${isDelayed ? 'from-yellow-900/40 to-slate-900/40 border-yellow-500/30' : 'from-sky-900/40 to-slate-900/40 border-sky-500/20'} border rounded-2xl backdrop-blur-sm`} />

                                        <div className="relative p-6 flex items-center justify-between">
                                            <div className="flex items-center gap-8">
                                                <div className="flex items-center gap-4">
                                                    <div className="text-center">
                                                        <p className="text-2xl font-bold text-white">{booking.origin}</p>
                                                        <p className="text-xs text-gray-400">{booking.departureTime}</p>
                                                    </div>

                                                    <div className="flex flex-col items-center gap-1 w-24">
                                                        <p className="text-xs text-sky-400 font-mono">{booking.flightNumber}</p>
                                                        <div className="relative w-full h-px bg-sky-500/30">
                                                            <Plane className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 text-sky-400 rotate-90" />
                                                        </div>
                                                    </div>

                                                    <div className="text-center">
                                                        <p className="text-2xl font-bold text-white">{booking.destination}</p>
                                                        <p className="text-xs text-gray-400">{booking.arrivalTime}</p>
                                                    </div>
                                                </div>

                                                <div className="h-10 w-px bg-white/10 mx-2" />

                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-gray-400">Date</span>
                                                        <span className="text-sm text-gray-200 font-medium">{booking.date}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-gray-400">Class</span>
                                                        <span className="text-sm text-sky-400 font-medium">{booking.seatClass}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-gray-400">Seat</span>
                                                        <span className="text-sm text-gray-200 font-medium">{booking.seatNumber}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {booking.status === 'CONFIRMED' && (
                                                    <button
                                                        onClick={() => handleCheckIn(booking.id)}
                                                        className="px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-all text-sm font-bold text-green-400"
                                                    >
                                                        Check In
                                                    </button>
                                                )}
                                                {booking.status === 'CHECKED_IN' && (
                                                    <span className="px-3 py-2 rounded-xl bg-green-500/20 text-green-400 text-sm font-bold">
                                                        Checked In
                                                    </span>
                                                )}
                                                <button className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
                                                    <QrCode className="w-5 h-5 text-gray-400" />
                                                </button>
                                                {booking.transferable && booking.status === 'CONFIRMED' && (
                                                    <button
                                                        onClick={() => { setSelectedTicket(booking); setShowSellModal(true); }}
                                                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 transition-all"
                                                    >
                                                        <DollarSign className="w-4 h-4 text-sky-400" />
                                                        <span className="text-sm font-bold text-sky-200">Sell</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <div className="bg-black/20 px-6 py-2 flex items-center justify-between border-t border-white/5">
                                            <div className="flex items-center gap-4">
                                                <p className="text-[10px] font-mono text-gray-500 flex items-center gap-1">
                                                    <ShieldCheck className="w-3 h-3" />
                                                    Token: {booking.tokenId}
                                                </p>
                                                {booking.hasInsurance && (
                                                    <span className="text-[10px] text-green-400 flex items-center gap-1">
                                                        <ShieldPlus className="w-3 h-3" /> Insured
                                                    </span>
                                                )}
                                            </div>
                                            {isDelayed && (
                                                <div className="flex items-center gap-2">
                                                    <p className="text-xs text-yellow-400 font-bold animate-pulse flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" />
                                                        Delayed {flight?.delayMinutes}min
                                                    </p>
                                                    {booking.hasInsurance && !booking.insuranceClaimed && (
                                                        <button
                                                            onClick={() => handleClaimInsurance(booking.id)}
                                                            className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-lg hover:bg-yellow-500/30"
                                                        >
                                                            Claim Insurance
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        {/* Available Flights */}
                        <div className="glass-card p-6 rounded-2xl border border-white/10">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Plus className="w-5 h-5 text-sky-400" />
                                    Book a Flight
                                </h3>
                            </div>
                            <div className="space-y-3">
                                {flights.slice(0, 3).map((flight) => (
                                    <div
                                        key={flight.id}
                                        className="p-4 bg-white/5 border border-white/10 rounded-xl hover:border-sky-500/30 hover:bg-sky-500/5 transition-all"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="text-center">
                                                    <p className="text-lg font-bold text-white">{flight.origin}</p>
                                                    <p className="text-[10px] text-gray-500">{flight.departureTime}</p>
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-xs text-sky-400 font-mono">{flight.flightNumber}</p>
                                                    <Plane className="w-4 h-4 text-sky-400 mx-auto rotate-90" />
                                                </div>
                                                <div className="text-center">
                                                    <p className="text-lg font-bold text-white">{flight.destination}</p>
                                                    <p className="text-[10px] text-gray-500">{flight.arrivalTime}</p>
                                                </div>
                                                <div className="ml-4 text-xs text-gray-400">
                                                    {flight.date}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-right text-xs">
                                                    <p className="text-gray-400">from</p>
                                                    <p className="text-sky-400 font-bold">${flight.prices.economy}</p>
                                                </div>
                                                <button
                                                    onClick={() => { setSelectedFlight(flight); setShowBookModal(true); }}
                                                    className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-all text-sm font-bold"
                                                >
                                                    Book
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-4">
                        {/* AHOY Actions */}
                        <div className="glass-card p-4 rounded-xl border border-white/10">
                            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                                <Coins className="w-4 h-4 text-amber-400" /> AHOY Actions
                            </h3>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between items-center p-2 bg-green-500/5 rounded-lg border border-green-500/10">
                                    <span className="text-gray-300">Book Flight</span>
                                    <span className="text-green-400 font-bold">+50 AHOY</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-green-500/5 rounded-lg border border-green-500/10">
                                    <span className="text-gray-300">Transfer Pass</span>
                                    <span className="text-green-400 font-bold">+20 AHOY</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-green-500/5 rounded-lg border border-green-500/10">
                                    <span className="text-gray-300">Insurance Claim</span>
                                    <span className="text-green-400 font-bold">+50 AHOY</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-red-500/5 rounded-lg border border-red-500/10">
                                    <span className="text-gray-300">Lounge Access</span>
                                    <span className="text-red-400 font-bold">-50 AHOY</span>
                                </div>
                                <div className="flex justify-between items-center p-2 bg-red-500/5 rounded-lg border border-red-500/10">
                                    <span className="text-gray-300">Seat Upgrade</span>
                                    <span className="text-red-400 font-bold">-150 AHOY</span>
                                </div>
                            </div>
                        </div>

                        {/* Demo Controls */}
                        <div className="glass-card p-4 rounded-xl border border-orange-500/20 bg-gradient-to-b from-orange-900/10 to-transparent">
                            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-orange-400" /> Demo Controls
                            </h3>
                            <p className="text-xs text-gray-400 mb-3">
                                Simulate a flight delay to test insurance claims.
                            </p>
                            {flights.slice(0, 2).map(flight => (
                                <button
                                    key={flight.id}
                                    onClick={() => handleSimulateDelay(flight.id)}
                                    disabled={flight.status === 'DELAYED'}
                                    className="w-full mb-2 py-2 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-lg hover:bg-orange-500/20 transition-all text-xs font-bold disabled:opacity-50"
                                >
                                    {flight.status === 'DELAYED' ? `${flight.flightNumber} Already Delayed` : `Delay ${flight.flightNumber}`}
                                </button>
                            ))}
                        </div>

                        {/* Service Credits Balance */}
                        <div className="glass-card p-4 rounded-xl border border-green-500/20 bg-gradient-to-b from-green-900/10 to-transparent">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-white flex items-center gap-2">
                                    <CreditCard className="w-4 h-4 text-green-400" /> Fly+ Credits
                                </h3>
                                <span className="text-lg font-bold text-green-400">{serviceCredits.balance}</span>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Prepaid service tokens for luggage, check-in & more.
                            </p>
                            <button
                                onClick={() => setActiveTab('services')}
                                className="w-full py-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/20 transition-all text-sm font-bold"
                            >
                                View Services
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Services Tab - Tokenized Service Credits */}
            {activeTab === 'services' && (
                <div className="grid grid-cols-3 gap-6">
                    <div className="col-span-2 space-y-6">
                        {/* Service Credits Balance */}
                        <div className="glass-card p-6 rounded-2xl border border-green-500/20 bg-gradient-to-r from-green-900/20 to-slate-900/20">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                        <CreditCard className="w-6 h-6 text-green-400" />
                                        Fly+ Service Credits
                                    </h2>
                                    <p className="text-sm text-gray-400 mt-1">
                                        Prepaid tokens for premium travel services
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-4xl font-bold text-green-400">{serviceCredits.balance}</p>
                                    <p className="text-xs text-gray-400">Credits Available</p>
                                </div>
                            </div>

                            {/* Purchase Credits */}
                            <div className="mt-6 p-4 bg-black/20 rounded-xl border border-white/5">
                                <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                        <label className="text-xs text-gray-400 mb-1 block">Purchase Credits (1 AHOY = 1 Credit)</label>
                                        <input
                                            type="number"
                                            value={creditsToBuy}
                                            onChange={(e) => setCreditsToBuy(Math.max(1, parseInt(e.target.value) || 0))}
                                            className="w-full bg-black/30 border border-white/10 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-green-500"
                                            min="1"
                                        />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs text-gray-400">Cost</p>
                                        <p className="text-lg font-bold text-amber-400">{creditsToBuy} AHOY</p>
                                    </div>
                                    <button
                                        onClick={handlePurchaseCredits}
                                        disabled={isProcessing}
                                        className="px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all font-bold disabled:opacity-50"
                                    >
                                        Buy Credits
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Service Catalog */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-bold text-white">Available Services</h3>
                            <div className="grid grid-cols-2 gap-4">
                                {serviceCatalog.map((service) => {
                                    const canAfford = serviceCredits.balance >= service.tokenCost;
                                    const icons: Record<FlyPlusServiceType, React.ReactNode> = {
                                        LUGGAGE_PICKUP: <Luggage className="w-6 h-6" />,
                                        HOME_CHECKIN: <CheckCircle2 className="w-6 h-6" />,
                                        PRIORITY_SERVICE: <Sparkles className="w-6 h-6" />,
                                        PREMIUM_TRACKING: <Package className="w-6 h-6" />,
                                        FAST_TRACK_SECURITY: <ShieldCheck className="w-6 h-6" />,
                                        MEET_GREET: <Users className="w-6 h-6" />,
                                    };
                                    return (
                                        <div
                                            key={service.id}
                                            className={`p-5 rounded-xl border transition-all ${
                                                canAfford
                                                    ? 'bg-white/5 border-white/10 hover:border-green-500/30 hover:bg-green-500/5'
                                                    : 'bg-white/2 border-white/5 opacity-60'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="p-2 bg-green-500/20 rounded-lg text-green-400">
                                                    {icons[service.serviceType]}
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-bold text-green-400">{service.tokenCost}</p>
                                                    <p className="text-[10px] text-gray-500">credits</p>
                                                </div>
                                            </div>
                                            <h4 className="font-bold text-white">{service.name}</h4>
                                            <p className="text-xs text-gray-400 mt-1 mb-3">{service.description}</p>
                                            <button
                                                onClick={() => handleRedeemService(service.serviceType)}
                                                disabled={!canAfford}
                                                className={`w-full py-2 rounded-lg text-sm font-bold transition-all ${
                                                    canAfford
                                                        ? 'bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20'
                                                        : 'bg-gray-500/10 border border-gray-500/20 text-gray-500 cursor-not-allowed'
                                                }`}
                                            >
                                                {canAfford ? 'Redeem' : 'Insufficient Credits'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-4">
                        {/* How It Works */}
                        <div className="glass-card p-4 rounded-xl border border-white/10">
                            <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                                <Coins className="w-4 h-4 text-amber-400" /> How It Works
                            </h3>
                            <div className="space-y-3 text-xs">
                                <div className="flex items-start gap-2">
                                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
                                    <p className="text-gray-300">Convert AHOY tokens to Fly+ Service Credits (1:1 ratio)</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="w-5 h-5 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
                                    <p className="text-gray-300">Use credits to prepay for premium services</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-[10px] font-bold shrink-0">3</span>
                                    <p className="text-gray-300">Redeem at any time for luggage, check-in, and more</p>
                                </div>
                            </div>
                        </div>

                        {/* Recent Redemptions */}
                        {serviceCredits.creditsUsed.length > 0 && (
                            <div className="glass-card p-4 rounded-xl border border-white/10">
                                <h3 className="font-bold text-white mb-3 flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-gray-400" /> Recent Redemptions
                                </h3>
                                <div className="space-y-2">
                                    {serviceCredits.creditsUsed.slice(0, 5).map((redemption) => {
                                        const service = serviceCatalog.find(s => s.serviceType === redemption.serviceType);
                                        return (
                                            <div key={redemption.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-xs">
                                                <div>
                                                    <p className="text-white font-medium">{service?.name}</p>
                                                    <p className="text-gray-500">{new Date(redemption.redeemedAt).toLocaleDateString()}</p>
                                                </div>
                                                <span className="text-green-400 font-bold">-{redemption.creditsUsed}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Benefits */}
                        <div className="glass-card p-4 rounded-xl border border-green-500/20 bg-gradient-to-b from-green-900/10 to-transparent">
                            <h3 className="font-bold text-white mb-3">Why Service Credits?</h3>
                            <div className="space-y-2 text-xs text-gray-400">
                                <p className="flex items-center gap-2">
                                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    No cross-border payment friction
                                </p>
                                <p className="flex items-center gap-2">
                                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    Supports micropayments
                                </p>
                                <p className="flex items-center gap-2">
                                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    Instant redemption, no wait times
                                </p>
                                <p className="flex items-center gap-2">
                                    <CheckCircle2 className="w-3 h-3 text-green-400" />
                                    Transferable between users
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tokenization Tab */}
            {activeTab === 'tokenization' && (
                <div className="space-y-6">
                    {/* Tokenization Flow */}
                    <div className="glass-card p-6 rounded-xl border border-amber-500/20">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Coins className="w-5 h-5 text-amber-400" />
                            FLY+ Tokenization Model
                        </h2>

                        <div className="grid grid-cols-4 gap-4">
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-sky-500/20 rounded-full flex items-center justify-center">
                                    <Plane className="w-6 h-6 text-sky-400" />
                                </div>
                                <p className="text-sm font-bold text-white">Book Flight</p>
                                <p className="text-xs text-gray-400 mt-1">Purchase creates Pass NFT</p>
                            </div>
                            <div className="flex items-center justify-center">
                                <div className="w-full h-0.5 bg-gradient-to-r from-sky-500 to-green-500" />
                            </div>
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-green-500/20 rounded-full flex items-center justify-center">
                                    <Coins className="w-6 h-6 text-green-400" />
                                </div>
                                <p className="text-sm font-bold text-white">Earn AHOY</p>
                                <p className="text-xs text-gray-400 mt-1">+100 AHOY per booking</p>
                            </div>
                            <div className="flex items-center justify-center">
                                <div className="w-full h-0.5 bg-gradient-to-r from-green-500 to-purple-500" />
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mt-6">
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-purple-500/20 rounded-full flex items-center justify-center">
                                    <DollarSign className="w-6 h-6 text-purple-400" />
                                </div>
                                <p className="text-sm font-bold text-white">Trade/Transfer</p>
                                <p className="text-xs text-gray-400 mt-1">Sell passes in marketplace</p>
                            </div>
                            <div className="flex items-center justify-center">
                                <div className="w-full h-0.5 bg-gradient-to-r from-purple-500 to-amber-500" />
                            </div>
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-2 bg-amber-500/20 rounded-full flex items-center justify-center">
                                    <Scale className="w-6 h-6 text-amber-400" />
                                </div>
                                <p className="text-sm font-bold text-white">Insurance</p>
                                <p className="text-xs text-gray-400 mt-1">Oracle-triggered payouts</p>
                            </div>
                            <div className="flex items-center justify-center">
                                <div className="w-full h-0.5 bg-gradient-to-r from-amber-500 to-sky-500" />
                            </div>
                        </div>
                    </div>

                    {/* Token Types */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="glass-card p-5 rounded-xl border border-sky-500/20 bg-gradient-to-b from-sky-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <Ticket className="w-5 h-5 text-sky-400" />
                                <h3 className="font-bold text-white">Flight Pass NFT</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Transferable flight access token. Can be sold in marketplace before departure.
                            </p>
                            <div className="text-xs space-y-1 text-gray-500">
                                <p>• Flight details on-chain</p>
                                <p>• Transfer to any wallet</p>
                                <p>• Sell for AHOY tokens</p>
                                <p>• Automatic check-in</p>
                            </div>
                        </div>

                        <div className="glass-card p-5 rounded-xl border border-amber-500/20 bg-gradient-to-b from-amber-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <Scale className="w-5 h-5 text-amber-400" />
                                <h3 className="font-bold text-white">Insurance Escrow</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Smart contract insurance backed by Chainlink oracles for flight status.
                            </p>
                            <div className="text-xs space-y-1 text-gray-500">
                                <p>• Oracle-verified delays</p>
                                <p>• Automatic payout</p>
                                <p>• No claims process</p>
                                <p>• Instant settlement</p>
                            </div>
                        </div>

                        <div className="glass-card p-5 rounded-xl border border-purple-500/20 bg-gradient-to-b from-purple-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-3">
                                <Sparkles className="w-5 h-5 text-purple-400" />
                                <h3 className="font-bold text-white">Loyalty SBT</h3>
                            </div>
                            <p className="text-xs text-gray-400 mb-3">
                                Soulbound token tracking travel history and tier benefits.
                            </p>
                            <div className="text-xs space-y-1 text-gray-500">
                                <p>• Flight miles record</p>
                                <p>• Tier progression</p>
                                <p>• Non-transferable</p>
                                <p>• Lifetime benefits</p>
                            </div>
                        </div>
                    </div>

                    {/* SDK Assets */}
                    {flyPlusAssets.length > 0 && (
                        <div className="glass-card p-5 rounded-xl border border-white/10">
                            <h3 className="font-bold text-white mb-3">Created Assets ({flyPlusAssets.length})</h3>
                            <div className="space-y-2">
                                {flyPlusAssets.slice(0, 5).map(asset => (
                                    <div key={asset.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg text-xs">
                                        <div>
                                            <p className="text-white font-medium">{asset.name}</p>
                                            <p className="text-gray-500 font-mono">{asset.id.slice(0, 16)}...</p>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-[10px] ${
                                            asset.state === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                                        }`}>
                                            {asset.state}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Benefits Tab */}
            {activeTab === 'wallet' && (
                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                        <h2 className="text-lg font-bold text-white">Premium Services</h2>

                        <div className="glass-card p-5 rounded-xl border border-sky-500/20">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-white">Lounge Access</h3>
                                <span className="text-xs text-gray-400">Single use</span>
                            </div>
                            <p className="text-xs text-gray-400 mb-4">
                                Access to premium airport lounges with complimentary food and drinks.
                            </p>
                            <AhoyActionButton
                                label="Purchase Access"
                                points={50}
                                isEarn={false}
                                onClick={handleLoungeAccess}
                                icon={<Sparkles className="w-4 h-4" />}
                                className="w-full"
                            />
                        </div>

                        <div className="glass-card p-5 rounded-xl border border-purple-500/20">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-white">Seat Upgrade</h3>
                                <span className="text-xs text-gray-400">Next class up</span>
                            </div>
                            <p className="text-xs text-gray-400 mb-4">
                                Upgrade to the next seat class when available.
                            </p>
                            <AhoyActionButton
                                label="Request Upgrade"
                                points={150}
                                isEarn={false}
                                onClick={handleSeatUpgrade}
                                icon={<TrendingUp className="w-4 h-4" />}
                                className="w-full"
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-lg font-bold text-white">Your Benefits</h2>

                        <div className="glass-card p-5 rounded-xl border border-white/10">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                                    <Sparkles className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                    <p className="font-bold text-white">{ahoyState.tier} Member</p>
                                    <p className="text-xs text-gray-400">{ahoyState.lifetimeEarned.toLocaleString()} lifetime AHOY</p>
                                </div>
                            </div>

                            <div className="space-y-2 text-sm">
                                {ahoyState.tier !== 'BRONZE' && (
                                    <div className="flex items-center gap-2 text-green-400">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>Priority Boarding</span>
                                    </div>
                                )}
                                {['GOLD', 'PLATINUM', 'DIAMOND'].includes(ahoyState.tier) && (
                                    <div className="flex items-center gap-2 text-green-400">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>Lounge Access</span>
                                    </div>
                                )}
                                {['PLATINUM', 'DIAMOND'].includes(ahoyState.tier) && (
                                    <div className="flex items-center gap-2 text-green-400">
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>Free Upgrades</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="glass-card p-5 rounded-xl border border-green-500/20">
                            <h3 className="font-bold text-white mb-3">Refer a Friend</h3>
                            <p className="text-xs text-gray-400 mb-3">
                                Earn 200 AHOY when your friend makes their first booking.
                            </p>
                            <button className="w-full py-2 bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg hover:bg-green-500/20 transition-all text-sm font-bold">
                                Share Referral Link +200 AHOY
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Book Flight Modal */}
            {showBookModal && selectedFlight && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-md bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">Book Flight</h3>
                            <button onClick={() => { setShowBookModal(false); setSelectedFlight(null); }} className="text-gray-400 hover:text-white">Close</button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-xs text-gray-400">Flight</span>
                                    <span className="text-sm font-mono text-sky-400">{selectedFlight.flightNumber}</span>
                                </div>
                                <div className="flex items-center justify-center gap-4">
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-white">{selectedFlight.origin}</p>
                                        <p className="text-xs text-gray-400">{selectedFlight.originCity}</p>
                                    </div>
                                    <Plane className="w-5 h-5 text-sky-400 rotate-90" />
                                    <div className="text-center">
                                        <p className="text-2xl font-bold text-white">{selectedFlight.destination}</p>
                                        <p className="text-xs text-gray-400">{selectedFlight.destinationCity}</p>
                                    </div>
                                </div>
                                <div className="mt-3 text-center text-xs text-gray-400">
                                    {selectedFlight.date} • {selectedFlight.departureTime} - {selectedFlight.arrivalTime}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Select Class</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {(['ECONOMY', 'BUSINESS', 'FIRST'] as const).map((seatClass) => {
                                        const key = seatClass.toLowerCase() as 'economy' | 'business' | 'first';
                                        const available = selectedFlight.availableSeats[key] > 0;
                                        return (
                                            <button
                                                key={seatClass}
                                                onClick={() => handleBookFlight(selectedFlight, seatClass)}
                                                disabled={isProcessing || !available}
                                                className={`p-3 rounded-xl border transition-all text-center ${
                                                    available
                                                        ? 'bg-white/5 border-white/10 hover:border-sky-500/30 hover:bg-sky-500/10'
                                                        : 'bg-gray-800/50 border-gray-700/50 opacity-50 cursor-not-allowed'
                                                }`}
                                            >
                                                <p className="text-xs font-bold text-white">{seatClass}</p>
                                                <p className="text-lg font-mono text-sky-400">${selectedFlight.prices[key]}</p>
                                                <p className="text-[10px] text-gray-500">{selectedFlight.availableSeats[key]} seats</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="p-3 bg-green-500/10 rounded-xl border border-green-500/20 flex gap-3">
                                <ShieldPlus className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-bold text-green-200">Flight Insurance Included</p>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        Automatic payout if flight is delayed &gt;60 minutes
                                    </p>
                                </div>
                            </div>

                            <p className="text-xs text-green-400 text-center">Earn +50 AHOY for booking!</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Sell Modal */}
            {showSellModal && selectedTicket && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="w-full max-w-md bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-white">Sell Ticket</h3>
                            <button onClick={() => setShowSellModal(false)} className="text-gray-400 hover:text-white">Close</button>
                        </div>

                        <div className="p-6 space-y-6">
                            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                                <p className="text-xs text-gray-400 mb-1">Asset Token ID</p>
                                <p className="text-sm font-mono text-sky-400 break-all">{selectedTicket.tokenId}</p>
                                <div className="mt-3 flex items-center justify-between">
                                    <span className="text-sm text-gray-200">{selectedTicket.origin} → {selectedTicket.destination}</span>
                                    <span className="text-sm text-gray-200">{selectedTicket.date}</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Resale Price (AHOY)</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                    <input
                                        type="number"
                                        value={sellPrice}
                                        onChange={(e) => setSellPrice(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-sky-500 transition-colors"
                                    />
                                </div>
                                <p className="text-xs text-green-400 mt-2">You'll earn +20 AHOY for this transfer</p>
                            </div>

                            <div className="p-3 bg-sky-500/10 rounded-xl border border-sky-500/20 flex gap-3">
                                <Users className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-bold text-sky-200">Matching Engine</p>
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        The SDK will automatically match your ticket with the highest bidder.
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={handleSellTicket}
                                disabled={isProcessing}
                                className="w-full py-3.5 bg-gradient-to-r from-sky-600 to-sky-500 rounded-xl font-bold text-white shadow-lg hover:scale-[1.02] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Executing Smart Contract...
                                    </>
                                ) : (
                                    'Confirm Transaction'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
