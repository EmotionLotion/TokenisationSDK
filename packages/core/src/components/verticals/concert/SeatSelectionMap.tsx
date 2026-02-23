import React, { useState } from 'react';
import { defaultTheme, type TokenisationTheme } from '../../theme.js';

export interface Section {
    name: string;
    rows: number;
    cols: number;
    price?: string;
    color?: string;
}

export interface SeatSelectionMapProps {
    rows?: number;
    cols?: number;
    sections?: Section[];
    blockedSeats?: string[]; // e.g. "A1", "B2", or "VIP-A1"
    onSelect?: (seat: string) => void;
    theme?: TokenisationTheme;
}

export function SeatSelectionMap({
    rows = 5,
    cols = 8,
    sections,
    blockedSeats = [],
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

    const renderSection = (sectionRows: number, sectionCols: number, prefix: string, seatColor: string) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
            {Array.from({ length: sectionRows }).map((_, r) => {
                const rowLabel = rowLabels[r];
                return (
                    <div key={r} style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'center' }}>
                        {Array.from({ length: sectionCols }).map((_, c) => {
                            const seatId = prefix ? `${prefix}-${rowLabel}${c + 1}` : `${rowLabel}${c + 1}`;
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
                                                : seatColor,
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
    );

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

            {sections && sections.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
                    {sections.map((section) => (
                        <div key={section.name}>
                            <div style={{ textAlign: 'center', marginBottom: theme.spacing.sm, fontSize: '11px', fontWeight: 600, color: section.color || theme.colors.textMuted }}>
                                {section.name}{section.price ? ` - ${section.price}` : ''}
                            </div>
                            {renderSection(section.rows, section.cols, section.name, section.color || '#4B5563')}
                        </div>
                    ))}
                </div>
            ) : (
                renderSection(rows, cols, '', '#4B5563')
            )}

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
