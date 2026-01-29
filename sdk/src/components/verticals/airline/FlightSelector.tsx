import React, { useState } from 'react';
import { defaultTheme, createStyles, type TokenisationTheme } from '../../theme.js';

export interface Flight {
    id: string;
    airline: string;
    flightNumber: string;
    origin: string;
    destination: string;
    time: string;
    price: string;
}

export interface FlightSelectorProps {
    onSelect: (flight: Flight) => void;
    theme?: TokenisationTheme;
}

const MOCK_FLIGHTS: Flight[] = [
    { id: '1', airline: 'Dubai Emirates', flightNumber: 'EK202', origin: 'DXB', destination: 'JFK', time: '08:30 AM', price: 'AED 4,500' },
    { id: '2', airline: 'British Airways', flightNumber: 'BA105', origin: 'DXB', destination: 'LHR', time: '10:15 AM', price: 'AED 3,200' },
    { id: '3', airline: 'Lufthansa', flightNumber: 'LH631', origin: 'DXB', destination: 'FRA', time: '02:45 PM', price: 'AED 2,800' },
];

export function FlightSelector({ onSelect, theme = defaultTheme }: FlightSelectorProps) {
    const styles = createStyles(theme);
    const [selectedId, setSelectedId] = useState<string>('');

    return (
        <div style={{ ...styles.card, maxWidth: '400px' }}>
            <label style={styles.label}>Select Flight</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
                {MOCK_FLIGHTS.map((flight) => (
                    <div
                        key={flight.id}
                        onClick={() => {
                            setSelectedId(flight.id);
                            onSelect(flight);
                        }}
                        style={{
                            padding: theme.spacing.md,
                            borderRadius: theme.borderRadius.md,
                            border: `1px solid ${selectedId === flight.id ? theme.colors.primary : theme.colors.border}`,
                            backgroundColor: selectedId === flight.id ? `${theme.colors.primary}10` : 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}
                    >
                        <div>
                            <div style={{ fontWeight: 600, color: theme.colors.text }}>{flight.airline} {flight.flightNumber}</div>
                            <div style={{ fontSize: '12px', color: theme.colors.textMuted }}>
                                {flight.origin} ✈️ {flight.destination} • {flight.time}
                            </div>
                        </div>
                        <div style={{ fontWeight: 600, color: theme.colors.primary }}>
                            {flight.price}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
