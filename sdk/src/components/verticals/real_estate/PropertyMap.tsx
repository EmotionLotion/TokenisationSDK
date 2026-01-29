import React from 'react';
import { defaultTheme, type TokenisationTheme } from '../../theme.js';

export interface PropertyMapProps {
    address: string;
    latitude?: number;
    longitude?: number;
    theme?: TokenisationTheme;
    height?: string;
}

export function PropertyMap({
    address,
    latitude = 25.0763, // Default to Dubai Marina
    longitude = 55.1435,
    theme = defaultTheme,
    height = '300px'
}: PropertyMapProps) {
    // Visual placeholder for a map interaction
    return (
        <div style={{
            width: '100%',
            height,
            backgroundColor: '#E5E7EB',
            borderRadius: theme.borderRadius.lg,
            border: `1px solid ${theme.colors.border}`,
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundImage: 'repeating-linear-gradient(45deg, #F3F4F6 25%, transparent 25%, transparent 75%, #F3F4F6 75%, #F3F4F6), repeating-linear-gradient(45deg, #F3F4F6 25%, #E5E7EB 25%, #E5E7EB 75%, #F3F4F6 75%, #F3F4F6)',
            backgroundPosition: '0 0, 10px 10px',
            backgroundSize: '20px 20px'
        }}>
            <div style={{
                position: 'absolute',
                textAlign: 'center',
                padding: theme.spacing.md,
                backgroundColor: 'rgba(255,255,255,0.9)',
                borderRadius: theme.borderRadius.md,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                maxWidth: '80%'
            }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>📍</div>
                <div style={{ fontWeight: 600, color: '#111827', marginBottom: '4px' }}>Map View</div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                    {address}
                    <br />
                    Lat: {latitude}, Lng: {longitude}
                </div>
            </div>

            {/* Mock Map Controls */}
            <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button style={{ width: 30, height: 30, cursor: 'pointer', border: '1px solid #ccc', background: 'white' }}>+</button>
                <button style={{ width: 30, height: 30, cursor: 'pointer', border: '1px solid #ccc', background: 'white' }}>-</button>
            </div>
        </div>
    );
}
