import React from 'react';
import { defaultTheme, type TokenisationTheme } from '../../theme.js';
import type { Flight } from './FlightSelector.js';

export interface BoardingPassProps {
    flight: Flight;
    passengerName: string;
    seat: string;
    theme?: TokenisationTheme;
}

export function BoardingPass({ flight, passengerName, seat, theme = defaultTheme }: BoardingPassProps) {
    return (
        <div style={{
            maxWidth: '350px',
            backgroundColor: '#FFFFFF',
            color: '#000000',
            borderRadius: theme.borderRadius.lg,
            overflow: 'hidden',
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
            fontFamily: theme.fonts.family
        }}>
            {/* Header */}
            <div style={{ backgroundColor: theme.colors.primary, padding: theme.spacing.md, color: '#000' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, opacity: 0.8 }}>BOARDING PASS</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '24px', fontWeight: 700 }}>{flight.origin}</span>
                    <span>✈️</span>
                    <span style={{ fontSize: '24px', fontWeight: 700 }}>{flight.destination}</span>
                </div>
            </div>

            {/* Body */}
            <div style={{ padding: theme.spacing.md }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                        <div style={{ fontSize: '10px', color: '#666' }}>PASSENGER</div>
                        <div style={{ fontWeight: 600 }}>{passengerName}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '10px', color: '#666' }}>FLIGHT</div>
                        <div style={{ fontWeight: 600 }}>{flight.flightNumber}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '10px', color: '#666' }}>DATE</div>
                        <div style={{ fontWeight: 600 }}>{new Date().toLocaleDateString()}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '10px', color: '#666' }}>TIME</div>
                        <div style={{ fontWeight: 600 }}>{flight.time}</div>
                    </div>
                </div>

                <div style={{
                    borderTop: '2px dashed #E5E7EB',
                    margin: '10px 0',
                    paddingTop: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div>
                        <div style={{ fontSize: '10px', color: '#666' }}>GATE</div>
                        <div style={{ fontWeight: 600, fontSize: '18px' }}>A12</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', color: '#666' }}>SEAT</div>
                        <div style={{ fontWeight: 600, fontSize: '18px', color: theme.colors.primaryHover }}>{seat}</div>
                    </div>
                </div>
            </div>

            {/* Barcode Strip */}
            <div style={{
                backgroundColor: '#F3F4F6',
                padding: '12px',
                textAlign: 'center',
                fontSize: '10px',
                color: '#666',
                letterSpacing: '4px'
            }}>
                ||| || ||| || ||| ||| || |||
            </div>
        </div>
    );
}
