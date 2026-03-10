import React, { useEffect, useRef, useState } from 'react';
import { defaultTheme, type TokenisationTheme } from '@tokenisation/core';

export interface PropertyMapProps {
    address: string;
    latitude?: number;
    longitude?: number;
    theme?: TokenisationTheme;
    height?: string;
    zoom?: number;
}

export function PropertyMap({
    address,
    latitude = 25.0763, // Default to Dubai Marina
    longitude = 55.1435,
    theme = defaultTheme,
    height = '300px',
    zoom: initialZoom = 15
}: PropertyMapProps) {
    const mapRef = useRef<HTMLDivElement>(null);
    const [currentZoom, setCurrentZoom] = useState(initialZoom);
    const [leafletLoaded, setLeafletLoaded] = useState(false);
    const mapInstanceRef = useRef<any>(null);

    // Load Leaflet dynamically from CDN
    useEffect(() => {
        if (typeof window === 'undefined') return;

        // Check if Leaflet is already loaded
        if ((window as any).L) {
            setLeafletLoaded(true);
            return;
        }

        // Load CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        // Load JS
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => setLeafletLoaded(true);
        document.head.appendChild(script);

        return () => {
            // Cleanup is optional since Leaflet may be used by other components
        };
    }, []);

    // Initialize map when Leaflet is loaded
    useEffect(() => {
        if (!leafletLoaded || !mapRef.current) return;

        const L = (window as any).L;
        if (!L) return;

        // Destroy previous map instance if it exists
        if (mapInstanceRef.current) {
            mapInstanceRef.current.remove();
        }

        const map = L.map(mapRef.current).setView([latitude, longitude], currentZoom);
        mapInstanceRef.current = map;

        // OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19,
        }).addTo(map);

        // Add marker
        const marker = L.marker([latitude, longitude]).addTo(map);
        marker.bindPopup(`<b>${address}</b>`).openPopup();

        // Sync zoom state
        map.on('zoomend', () => {
            setCurrentZoom(map.getZoom());
        });

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, [leafletLoaded, latitude, longitude, address]);

    // Fallback when Leaflet hasn't loaded yet
    if (!leafletLoaded) {
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
            }}>
                <div style={{
                    textAlign: 'center',
                    padding: theme.spacing.md,
                    backgroundColor: 'rgba(255,255,255,0.9)',
                    borderRadius: theme.borderRadius.md,
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>Loading map...</div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>
                        {address}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={mapRef}
            style={{
                width: '100%',
                height,
                borderRadius: theme.borderRadius.lg,
                border: `1px solid ${theme.colors.border}`,
                overflow: 'hidden',
            }}
        />
    );
}
