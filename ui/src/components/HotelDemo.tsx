import { useState } from 'react';
import { RoomSelector } from '@tokenisation/sdk/components';
import { BedDouble, Calendar, Star } from 'lucide-react';
import { useAhoyState } from '../contexts/SDKContext';

// Define Room type locally to match what we expect from SDK
interface Room {
    id: string;
    name: string;
    type: string;
    pricePerNight: string;
    amenities: string[];
}

export function HotelDemo() {
    const { simulateAhoyAction } = useAhoyState();
    const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg shadow-rose-500/20">
                        <BedDouble className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">LuxeStay</h1>
                        <p className="text-sm text-rose-400 font-medium">Tokenised Hospitality</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Room Selection */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="glass-card p-6 rounded-2xl border border-white/5">
                        <h2 className="text-lg font-bold text-white mb-4">Select Your Room</h2>
                        <RoomSelector
                            onSelect={(room) => setSelectedRoom(room as Room)}
                        />
                    </div>
                </div>

                {/* Booking Summary */}
                <div className="space-y-6">
                    <div className="glass-card p-6 rounded-2xl border border-rose-500/30 bg-rose-900/5">
                        <h2 className="text-xl font-bold text-white mb-4">Booking Summary</h2>
                        {selectedRoom ? (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Room</span>
                                    <span className="text-white font-medium">{selectedRoom.name}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Price per night</span>
                                    <span className="text-white font-medium">{selectedRoom.pricePerNight}</span>
                                </div>
                                <div className="pt-4 border-t border-white/10">
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="text-gray-300 font-bold">Total (3 nights)</span>
                                        <span className="text-xl font-bold text-white">
                                            {/* Extract number from string like 'AED 1,200' */}
                                            AED {(parseInt(selectedRoom.pricePerNight.replace(/[^0-9]/g, '')) * 3).toLocaleString()}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => simulateAhoyAction('SERVICE_BOOKED', 'H2O')}
                                        className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-rose-500/20"
                                    >
                                        Book with Ahoy
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
                                <p>Select a room to proceed</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
