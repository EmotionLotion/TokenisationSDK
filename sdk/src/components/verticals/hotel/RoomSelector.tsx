import React, { useState } from 'react';
import { defaultTheme, createStyles, type TokenisationTheme } from '../../theme.js';

export interface Room {
    id: string;
    name: string;
    type: 'standard' | 'deluxe' | 'suite';
    pricePerNight: string;
    amenities: string[];
    image?: string;
}

export interface RoomSelectorProps {
    onSelect: (room: Room) => void;
    theme?: TokenisationTheme;
}

const MOCK_ROOMS: Room[] = [
    {
        id: '1',
        name: 'Deluxe Ocean View',
        type: 'deluxe',
        pricePerNight: 'AED 1,200',
        amenities: ['King Bed', 'Ocean View', 'Balcony', 'Free WiFi']
    },
    {
        id: '2',
        name: 'Executive Suite',
        type: 'suite',
        pricePerNight: 'AED 2,500',
        amenities: ['Living Room', 'City View', 'Lounge Access', 'Breakfast']
    },
    {
        id: '3',
        name: 'Standard Twin',
        type: 'standard',
        pricePerNight: 'AED 800',
        amenities: ['Twin Beds', 'Garden View', 'Shower']
    }
];

export function RoomSelector({ onSelect, theme = defaultTheme }: RoomSelectorProps) {
    const styles = createStyles(theme);
    const [selectedId, setSelectedId] = useState<string>('');

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: theme.spacing.md }}>
            {MOCK_ROOMS.map((room) => (
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
                    {/* Mock Image Placeholder */}
                    <div style={{
                        height: '140px',
                        backgroundColor: '#CBD5E1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '32px'
                    }}>
                        {room.type === 'suite' ? '🏰' : room.type === 'deluxe' ? '🌅' : '🛏️'}
                    </div>

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
    );
}
