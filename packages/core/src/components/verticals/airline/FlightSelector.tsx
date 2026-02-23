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
    flights?: Flight[];
    onSelect: (flight: Flight) => void;
    theme?: TokenisationTheme;
}

export function FlightSelector({ flights = [], onSelect, theme = defaultTheme }: FlightSelectorProps) {
    const styles = createStyles(theme);
    const [selectedId, setSelectedId] = useState<string>('');

    if (flights.length === 0) {
        return (
            <div style={{ ...styles.card, maxWidth: '400px', textAlign: 'center', padding: theme.spacing.xl }}>
                <div style={{ fontSize: '12px', color: theme.colors.textMuted }}>No flights available</div>
            </div>
        );
    }

    return (
        <div style={{ ...styles.card, maxWidth: '400px' }}>
            <label style={styles.label}>Select Flight</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
                {flights.map((flight) => (
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
