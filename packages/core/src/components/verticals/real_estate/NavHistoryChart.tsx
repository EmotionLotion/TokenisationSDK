import React from 'react';
import { defaultTheme, type TokenisationTheme } from '../../theme.js';

export interface NavDataPoint {
    date: string;
    value: number;
}

export interface NavHistoryChartProps {
    data: NavDataPoint[];
    currency?: string;
    theme?: TokenisationTheme;
    height?: string;
}

export function NavHistoryChart({
    data,
    currency = 'USD',
    theme = defaultTheme,
    height = '200px'
}: NavHistoryChartProps) {
    if (!data || data.length === 0) return null;

    const maxVal = Math.max(...data.map(d => d.value));
    const minVal = Math.min(...data.map(d => d.value));
    const range = maxVal - minVal;

    return (
        <div style={{
            padding: theme.spacing.md,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.borderRadius.lg,
            border: `1px solid ${theme.colors.border}`,
            color: theme.colors.text
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: theme.spacing.md }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>NAV History</div>
                <div style={{ fontSize: '12px', color: theme.colors.success }}>
                    LIVE FEED ●
                </div>
            </div>

            <div style={{ height, width: '100%', display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
                {data.map((point, i) => {
                    const heightPct = ((point.value - minVal) / range) * 80 + 10; // scale 10-90%
                    return (
                        <div
                            key={i}
                            title={`${point.date}: ${currency} ${point.value.toLocaleString()}`}
                            style={{
                                flex: 1,
                                backgroundColor: i === data.length - 1 ? theme.colors.primary : `${theme.colors.primary}40`,
                                height: `${heightPct}%`,
                                borderTopLeftRadius: '2px',
                                borderTopRightRadius: '2px',
                                transition: 'height 0.3s ease',
                                position: 'relative',
                                minWidth: '4px'
                            }}
                        />
                    );
                })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: theme.spacing.sm }}>
                <span style={{ fontSize: '10px', color: theme.colors.textMuted }}>{data[0].date}</span>
                <span style={{ fontSize: '10px', color: theme.colors.textMuted }}>{data[data.length - 1].date}</span>
            </div>
        </div>
    );
}
