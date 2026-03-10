import React, { useState } from 'react';
import { defaultTheme, createStyles, type TokenisationTheme } from '@tokenisation/core';

export interface DateRange {
    start: Date | null;
    end: Date | null;
}

export interface RentalCalendarProps {
    onSelect?: (range: DateRange) => void;
    blockedDates?: Date[];
    theme?: TokenisationTheme;
}

export function RentalCalendar({
    onSelect,
    blockedDates = [],
    theme = defaultTheme
}: RentalCalendarProps) {
    const styles = createStyles(theme);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [startDate, setStartDate] = useState<Date | null>(null);
    const [endDate, setEndDate] = useState<Date | null>(null);

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

    const handleDateClick = (day: number) => {
        const selectedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);

        // Reset if both selected or clicking before start
        if ((startDate && endDate) || (startDate && selectedDate < startDate)) {
            setStartDate(selectedDate);
            setEndDate(null);
            onSelect?.({ start: selectedDate, end: null });
        } else if (startDate && !endDate) {
            setEndDate(selectedDate);
            onSelect?.({ start: startDate, end: selectedDate });
        } else {
            setStartDate(selectedDate);
            onSelect?.({ start: selectedDate, end: null });
        }
    };

    const isSelected = (day: number) => {
        const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        if (!startDate) return false;
        if (d.getTime() === startDate.getTime()) return true;
        if (endDate && d.getTime() === endDate.getTime()) return true;
        if (startDate && endDate && d > startDate && d < endDate) return true;
        return false;
    };

    return (
        <div style={{ ...styles.card, width: '300px', padding: theme.spacing.md }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: theme.spacing.md }}>
                <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} style={{ background: 'none', border: 'none', color: theme.colors.text, cursor: 'pointer' }}>&lt;</button>
                <div style={{ fontWeight: 600 }}>
                    {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </div>
                <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} style={{ background: 'none', border: 'none', color: theme.colors.text, cursor: 'pointer' }}>&gt;</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '8px' }}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: '10px', color: theme.colors.textMuted }}>{d}</div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const selected = isSelected(day);
                    const isStartOrEnd = selected && (
                        (startDate && day === startDate.getDate()) ||
                        (endDate && day === endDate.getDate())
                    );

                    return (
                        <button
                            key={day}
                            onClick={() => handleDateClick(day)}
                            style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: isStartOrEnd ? '50%' : '0',
                                backgroundColor: selected
                                    ? (isStartOrEnd ? theme.colors.primary : `${theme.colors.primary}40`)
                                    : 'transparent',
                                border: 'none',
                                color: theme.colors.text,
                                cursor: 'pointer',
                                fontSize: '13px'
                            }}
                        >
                            {day}
                        </button>
                    );
                })}
            </div>

            {startDate && endDate && (
                <div style={{ marginTop: theme.spacing.md, padding: theme.spacing.sm, backgroundColor: `${theme.colors.success}10`, borderRadius: theme.borderRadius.sm, fontSize: '12px', color: theme.colors.success, textAlign: 'center' }}>
                    {Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))} Days Selected
                </div>
            )}
        </div>
    );
}
