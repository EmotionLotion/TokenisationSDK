/**
 * Accessibility Utilities — WCAG 2.1 AA Compliance Helpers
 *
 * Provides focus management, keyboard navigation, screen reader utilities,
 * and responsive breakpoint helpers for all ui-kit components.
 */

import type React from 'react';

// ============================================================================
// Focus Management
// ============================================================================

/** Trap focus within a container (for modals/dialogs) */
export function trapFocus(container: HTMLElement): () => void {
  const focusable = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusable[0] as HTMLElement;
  const last = focusable[focusable.length - 1] as HTMLElement;

  const handler = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  };
  container.addEventListener('keydown', handler);
  first?.focus();
  return () => container.removeEventListener('keydown', handler);
}

/** Move focus to an element and announce it to screen readers */
export function focusAndAnnounce(element: HTMLElement, message?: string): void {
  element.focus();
  if (message) announce(message);
}

// ============================================================================
// Screen Reader Announcements
// ============================================================================

let liveRegion: HTMLElement | null = null;

function getOrCreateLiveRegion(): HTMLElement {
  if (liveRegion && document.body.contains(liveRegion)) return liveRegion;
  liveRegion = document.createElement('div');
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.className = 'sr-only';
  Object.assign(liveRegion.style, {
    position: 'absolute', width: '1px', height: '1px',
    padding: '0', margin: '-1px', overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: '0',
  });
  document.body.appendChild(liveRegion);
  return liveRegion;
}

/** Announce a message to screen readers */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const region = getOrCreateLiveRegion();
  region.setAttribute('aria-live', priority);
  region.textContent = '';
  // Use setTimeout to ensure the DOM change is noticed
  setTimeout(() => { region.textContent = message; }, 50);
}

// ============================================================================
// Keyboard Navigation Helpers
// ============================================================================

/** Check if an event is an activation key (Enter or Space) */
export function isActivationKey(event: React.KeyboardEvent | KeyboardEvent): boolean {
  return event.key === 'Enter' || event.key === ' ';
}

/** Create keyboard handler for list items (arrow key navigation) */
export function createListKeyHandler(
  items: HTMLElement[],
  options?: { orientation?: 'vertical' | 'horizontal'; wrap?: boolean }
): (event: KeyboardEvent) => void {
  const { orientation = 'vertical', wrap = true } = options || {};
  const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';

  return (event: KeyboardEvent) => {
    const currentIndex = items.indexOf(event.target as HTMLElement);
    if (currentIndex === -1) return;

    let nextIndex: number;
    if (event.key === nextKey) {
      nextIndex = currentIndex + 1;
      if (nextIndex >= items.length) nextIndex = wrap ? 0 : items.length - 1;
      event.preventDefault();
      items[nextIndex]?.focus();
    } else if (event.key === prevKey) {
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) nextIndex = wrap ? items.length - 1 : 0;
      event.preventDefault();
      items[nextIndex]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };
}

/** Generate unique IDs for aria-labelledby / aria-describedby */
let idCounter = 0;
export function generateId(prefix: string = 'tk'): string {
  return `${prefix}-${++idCounter}`;
}

// ============================================================================
// Contrast & Color Utilities
// ============================================================================

/** Calculate relative luminance of a hex color (WCAG 2.1) */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Calculate contrast ratio between two hex colors */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Check if color pair meets WCAG AA for normal text (4.5:1) */
export function meetsContrastAA(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 4.5;
}

/** Check if color pair meets WCAG AA for large text (3:1) */
export function meetsContrastAALarge(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= 3;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

// ============================================================================
// Responsive Breakpoints
// ============================================================================

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

/** Check if current viewport matches a breakpoint */
export function matchesBreakpoint(breakpoint: keyof typeof BREAKPOINTS): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= BREAKPOINTS[breakpoint];
}

/** Create a media query string for a breakpoint */
export function mediaQuery(breakpoint: keyof typeof BREAKPOINTS): string {
  return `(min-width: ${BREAKPOINTS[breakpoint]}px)`;
}

// ============================================================================
// Reduced Motion
// ============================================================================

/** Check if user prefers reduced motion */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ============================================================================
// ARIA Props Helpers
// ============================================================================

/** Standard ARIA props for a status badge */
export function statusBadgeAria(status: string): Record<string, string> {
  return { role: 'status', 'aria-label': `Status: ${status}` };
}

/** Standard ARIA props for a progress indicator */
export function progressAria(current: number, total: number, label?: string): Record<string, string | number> {
  return {
    role: 'progressbar',
    'aria-valuenow': current,
    'aria-valuemin': 0,
    'aria-valuemax': total,
    'aria-label': label || `Progress: ${current} of ${total}`,
  };
}

/** Standard ARIA props for a list */
export function listAria(label: string): Record<string, string> {
  return { role: 'list', 'aria-label': label };
}

/** Standard ARIA props for an alert */
export function alertAria(severity: 'error' | 'warning' | 'info' = 'info'): Record<string, string> {
  return { role: severity === 'error' ? 'alert' : 'status', 'aria-live': severity === 'error' ? 'assertive' : 'polite' };
}
