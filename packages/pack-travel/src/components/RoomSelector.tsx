import React, { useState } from 'react';
import { defaultTheme, createStyles, type TokenisationTheme } from '@tokenisation/core';

export interface Room {
    id: string;
    name: string;
    type: 'standard' | 'deluxe' | 'suite';
    pricePerNight: string;
    amenities: string[];
    image?: string;
}

export interface RoomSelectorProps {
    rooms?: Room[];
    dateRange?: { start: Date | null; end: Date | null };
    onSelect: (room: Room) => void;
    theme?: TokenisationTheme;
}

export function RoomSelector({ rooms = [], dateRange, onSelect, theme = defaultTheme }: RoomSelectorProps) {
    const styles = createStyles(theme);
    const [selectedId, setSelectedId] = useState<string>('');

    const nightCount = dateRange?.start && dateRange?.end
        ? Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24))
        : null;

    if (rooms.length === 0) {
        return (
            <div style={{ ...styles.card, textAlign: 'center', padding: theme.spacing.xl }}>
                <div style={{ fontSize: '12px', color: theme.colors.textMuted }}>No rooms available</div>
            </div>
        );
    }

    return (
        <div>
            {nightCount && (
                <div style={{ marginBottom: theme.spacing.md, fontSize: '13px', color: theme.colors.textMuted }}>
                    {dateRange!.start!.toLocaleDateString()} - {dateRange!.end!.toLocaleDateString()} ({nightCount} night{nightCount > 1 ? 's' : ''})
                </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: theme.spacing.md }}>
            {rooms.map((room) => (
                <div
                    key={room.id}
                    onClick={() => {
                        setSelectedId(room.id);
                        onSelect(room);
                    }}
                    style={{
                        ...styles.card,
                        padding: 0,
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: selectedId === room.id ? `2px solid ${theme.colors.primary}` : `1px solid ${theme.colors.border}`,
                        position: 'relative',
                        transition: 'transform 0.2s',
                        transform: selectedId === room.id ? 'scale(1.02)' : 'scale(1)'
                    }}
                >
                    {room.image ? (
                        <img src={room.image} alt={room.name} style={{ width: '100%', height: '140px', objectFit: 'cover' }} />
                    ) : (
                        <div style={{
                            height: '140px',
                            backgroundColor: '#CBD5E1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '32px'
                        }}>
                            {room.type === 'suite' ? 'Suite' : room.type === 'deluxe' ? 'Deluxe' : 'Standard'}
                        </div>
                    )}

                    <div style={{ padding: theme.spacing.md }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div style={{ fontWeight: 600, color: theme.colors.text }}>{room.name}</div>
                            <div style={{
                                backgroundColor: `${theme.colors.primary}20`,
                                color: theme.colors.primary,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600
                            }}>
                                {room.type.toUpperCase()}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
                            {room.amenities.map(a => (
                                <span key={a} style={{ fontSize: '10px', color: theme.colors.textMuted, backgroundColor: theme.colors.background, padding: '2px 4px', borderRadius: '2px' }}>
                                    {a}
                                </span>
                            ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
                            <div style={{ fontSize: '12px', color: theme.colors.textMuted }}>Per Night</div>
                            <div style={{ fontWeight: 700, color: theme.colors.text }}>{room.pricePerNight}</div>
                        </div>
                    </div>
                </div>
            ))}
            </div>
        </div>
    );
}
