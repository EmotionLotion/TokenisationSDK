import { useState } from 'react';
import { SeatSelectionMap } from '@tokenisation/sdk/components';
import { Music, Ticket } from 'lucide-react';
import { useAhoyState } from '../contexts/SDKContext';

export function ConcertDemo() {
    const { simulateAhoyAction } = useAhoyState();
    const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);

    // Mock pricing logic for selected seats
    const getSeatPrice = (seatId: string) => {
        if (seatId.startsWith('A')) return 500; // VIP
        if (seatId.startsWith('B')) return 300;
        return 150;
    };

    const getSeatSection = (seatId: string) => {
        if (seatId.startsWith('A')) return 'VIP Section A';
        if (seatId.startsWith('B')) return 'Gold Section B';
        return 'Standard Section C';
    };

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20">
                        <Music className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">VibeTix</h1>
                        <p className="text-sm text-purple-400 font-medium">NFT Ticketing Platform</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Stage & Seat Map */}
                <div className="lg:col-span-2 space-y-6">
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
                    </div>
                </div>

                {/* Ticket Details */}
                <div className="space-y-6">
                    <div className="glass-card p-6 rounded-2xl border border-purple-500/30 bg-purple-900/5">
                        <h2 className="text-xl font-bold text-white mb-4">Ticket Selection</h2>
                        {selectedSeatId ? (
                            <div className="space-y-4">
                                <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                                    <div className="flex justify-between mb-2">
                                        <span className="text-gray-400">Seat ID</span>
                                        <span className="text-white font-mono">{selectedSeatId}</span>
                                    </div>
                                    <div className="flex justify-between mb-2">
                                        <span className="text-gray-400">Section</span>
                                        <span className="text-white">{getSeatSection(selectedSeatId)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Price</span>
                                        <span className="text-green-400 font-bold text-xl">${getSeatPrice(selectedSeatId)}</span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => simulateAhoyAction('TICKET_PURCHASED', 'AMS')}
                                    className="w-full py-3 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-purple-500/20"
                                >
                                    Mint NFT Ticket
                                </button>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                <Ticket className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                <p>Select a seat to view details</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
