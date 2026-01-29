import React, { useState } from 'react';
import { defaultTheme, type TokenisationTheme } from '../../theme.js';

export interface SeatSelectionMapProps {
    rows?: number;
    cols?: number;
    blockedSeats?: string[]; // e.g. "A1", "B2"
    onSelect?: (seat: string) => void;
    theme?: TokenisationTheme;
}

export function SeatSelectionMap({
    rows = 5,
    cols = 8,
    blockedSeats = ['A3', 'A4', 'C2', 'C3', 'C4'],
    onSelect,
    theme = defaultTheme
}: SeatSelectionMapProps) {
    const [selected, setSelected] = useState<string | null>(null);

    const rowLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    const handleSeatClick = (seatId: string) => {
        if (blockedSeats.includes(seatId)) return;
        setSelected(seatId);
        onSelect?.(seatId);
    };

    return (
        <div style={{
            padding: theme.spacing.md,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.borderRadius.lg,
            border: `1px solid ${theme.colors.border}`,
            display: 'inline-block'
        }}>
            {/* Stage */}
            <div style={{
                width: '100%',
                height: '40px',
                backgroundColor: '#333',
                borderRadius: '4px 4px 50% 50%',
                marginBottom: theme.spacing.xl,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '2px'
            }}>
                STAGE
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
                {Array.from({ length: rows }).map((_, r) => {
                    const rowLabel = rowLabels[r];
                    return (
                        <div key={r} style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'center' }}>
                            {Array.from({ length: cols }).map((_, c) => {
                                const seatId = `${rowLabel}${c + 1}`;
                                const isBlocked = blockedSeats.includes(seatId);
                                const isSelected = selected === seatId;

                                return (
                                    <button
                                        key={seatId}
                                        onClick={() => handleSeatClick(seatId)}
                                        disabled={isBlocked}
                                        title={isBlocked ? `Seat ${seatId} (Unavailable)` : `Seat ${seatId}`}
                                        style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            backgroundColor: isBlocked
                                                ? '#374151'
                                                : isSelected
                                                    ? theme.colors.primary
                                                    : '#4B5563',
                                            cursor: isBlocked ? 'not-allowed' : 'pointer',
                                            color: isSelected ? '#000' : '#FFF',
                                            fontSize: '10px',
                                            fontWeight: 600,
                                            transition: 'all 0.2s',
                                            transform: isSelected ? 'scale(1.1)' : 'scale(1)'
                                        }}
                                    >
                                        {c + 1}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'center', marginTop: theme.spacing.lg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: theme.colors.textMuted }}>
                    <div style={{ width: 12, height: 12, backgroundColor: '#4B5563', borderRadius: 4 }}></div>
                    Available
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: theme.colors.textMuted }}>
                    <div style={{ width: 12, height: 12, backgroundColor: theme.colors.primary, borderRadius: 4 }}></div>
                    Selected
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: theme.colors.textMuted }}>
                    <div style={{ width: 12, height: 12, backgroundColor: '#374151', borderRadius: 4 }}></div>
                    Taken
                </div>
            </div>
        </div>
    );
}
