import { useState } from 'react';
import { RentalCalendar } from '@tokenisation/sdk/components';
import { Car, Fuel, Gauge } from 'lucide-react';
import { useAhoyState } from '../contexts/SDKContext';

// Define expected selection type from SDK
interface DateRange {
    start: Date | null;
    end: Date | null;
}

export function CarRentalDemo() {
    const { simulateAhoyAction } = useAhoyState();
    const [selectedDateRange, setSelectedDateRange] = useState<DateRange | null>(null);

    const car = {
        name: 'Tesla Model S Plaid',
        image: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?q=80&w=400&auto=format&fit=crop',
        pricePerDay: 250,
        features: {
            range: '396 mi',
            acceleration: '1.99s',
            topSpeed: '200mph'
        },
        unavailableDates: [
            new Date(new Date().setDate(new Date().getDate() + 2)), // Occupied in 2 days
            new Date(new Date().setDate(new Date().getDate() + 3)),
        ]
    };

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-red-600 to-red-800 rounded-2xl flex items-center justify-center shadow-lg shadow-red-600/20">
                        <Car className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">DriveChain</h1>
                        <p className="text-sm text-red-400 font-medium">Decentralized Fleet Network</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Car Details */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="glass-card p-6 rounded-2xl border border-white/5">
                        <img
                            src={car.image}
                            alt={car.name}
                            className="w-full h-48 object-cover rounded-xl mb-4"
                        />
                        <h2 className="text-xl font-bold text-white mb-2">{car.name}</h2>
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-2xl font-bold text-red-400">${car.pricePerDay}</span>
                            <span className="text-sm text-gray-500">/ day</span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-4">
                            <div className="bg-white/5 p-2 rounded-lg text-center">
                                <Fuel className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                                <span className="text-xs text-white">{car.features.range}</span>
                            </div>
                            <div className="bg-white/5 p-2 rounded-lg text-center">
                                <Gauge className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                                <span className="text-xs text-white">{car.features.acceleration}</span>
                            </div>
                            <div className="bg-white/5 p-2 rounded-lg text-center">
                                <Car className="w-4 h-4 mx-auto mb-1 text-gray-400" />
                                <span className="text-xs text-white">{car.features.topSpeed}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Calendar & Booking */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="glass-card p-6 rounded-2xl border border-white/5">
                        <h2 className="text-lg font-bold text-white mb-4">Select Rental Dates</h2>

                        <div className="flex justify-center">
                            <RentalCalendar
                                blockedDates={car.unavailableDates}
                                onSelect={(range) => setSelectedDateRange(range)}
                            />
                        </div>

                        {selectedDateRange && selectedDateRange.start && selectedDateRange.end && (
                            <div className="mt-6 p-4 bg-red-900/10 border border-red-500/20 rounded-xl flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-400">Total Price</p>
                                    <div className="flex items-baseline gap-2">
                                        <p className="text-xl font-bold text-white">
                                            ${car.pricePerDay * Math.ceil((selectedDateRange.end.getTime() - selectedDateRange.start.getTime()) / (1000 * 60 * 60 * 24))}
                                        </p>
                                        <span className="text-xs text-gray-400">
                                            ({Math.ceil((selectedDateRange.end.getTime() - selectedDateRange.start.getTime()) / (1000 * 60 * 60 * 24))} days)
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => simulateAhoyAction('CAR_RENTED', 'GTS')}
                                    className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-600/20"
                                >
                                    Confirm Rental
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
