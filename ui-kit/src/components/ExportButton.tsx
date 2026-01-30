/**
 * ExportButton - Download / export button component (Gap 11).
 *
 * Fetches data from an API endpoint and triggers a browser download in the
 * requested format (CSV, PDF, or JSON).
 *
 * @example
 * ```tsx
 * <ExportButton
 *   endpoint="https://api.example.com/api/v1/export/cap-table/tok_1"
 *   format="csv"
 *   filename="cap-table"
 *   apiKey="sk_live_xxx"
 *   label="Export CSV"
 * />
 * ```
 */

import React, { useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'csv' | 'pdf' | 'json';

export interface ExportButtonProps {
  /** Full URL of the export API endpoint */
  endpoint: string;
  /** Desired export format */
  format: ExportFormat;
  /** Base filename (without extension) for the download */
  filename?: string;
  /** API key sent as X-API-Key header */
  apiKey: string;
  /** Button label text */
  label?: string;
  /** Optional children – rendered instead of label when provided */
  children?: React.ReactNode;
}

// ============================================================================
// Helpers
// ============================================================================

const MIME_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv',
  pdf: 'application/pdf',
  json: 'application/json',
};

const EXTENSIONS: Record<ExportFormat, string> = {
  csv: '.csv',
  pdf: '.pdf',
  json: '.json',
};

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}

// ============================================================================
// Component
// ============================================================================

export function ExportButton({
  endpoint,
  format,
  filename,
  apiKey,
  label,
  children,
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleExport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const separator = endpoint.includes('?') ? '&' : '?';
      const url = `${endpoint}${separator}format=${format}`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
          Accept: MIME_TYPES[format],
        },
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new Error(errBody || `Export failed: ${response.status}`);
      }

      const blob = await response.blob();
      const resolvedFilename =
        filename
          ? `${filename}${EXTENSIONS[format]}`
          : `export-${Date.now()}${EXTENSIONS[format]}`;

      triggerDownload(blob, resolvedFilename);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [endpoint, format, filename, apiKey]);

  const handleRetry = useCallback(() => {
    handleExport();
  }, [handleExport]);

  return (
    <span className="tk-export-btn">
      <button
        type="button"
        className="tk-export-btn__trigger"
        onClick={error ? handleRetry : handleExport}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? (
          <span className="tk-export-btn__spinner" aria-label="Loading">
            {/* Simple CSS spinner via border-animation */}
            <span className="tk-export-btn__spinner-icon" />
          </span>
        ) : error ? (
          <span className="tk-export-btn__error">
            {children || label || 'Export'} — Retry
          </span>
        ) : (
          children || label || 'Export'
        )}
      </button>

      {error && (
        <span className="tk-export-btn__error-message" role="alert">
          {error.message}
        </span>
      )}
    </span>
  );
}

export default ExportButton;
