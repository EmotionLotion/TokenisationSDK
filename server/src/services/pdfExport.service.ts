import { createHash } from 'crypto';
import type { EvidencePack } from './evidence.service.js';
import type { RegulatoryPack } from './regulatoryPack.service.js';

// ============================================================================
// PDF Export Service
// ============================================================================

/**
 * Generate a PDF-ready HTML document from an evidence pack.
 * This can be converted to PDF using browser print or a PDF library.
 */
export function generateEvidencePackHtml(pack: EvidencePack): string {
  const styles = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #333; padding: 40px; max-width: 800px; margin: 0 auto; }
      h1 { font-size: 24pt; margin-bottom: 10px; color: #1a1a1a; border-bottom: 2px solid #333; padding-bottom: 10px; }
      h2 { font-size: 16pt; margin-top: 30px; margin-bottom: 15px; color: #1a1a1a; }
      h3 { font-size: 12pt; margin-top: 20px; margin-bottom: 10px; color: #444; }
      .meta { background: #f5f5f5; padding: 15px; border-radius: 4px; margin-bottom: 20px; }
      .meta p { margin: 5px 0; }
      .meta strong { width: 150px; display: inline-block; }
      table { width: 100%; border-collapse: collapse; margin: 15px 0; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 10pt; }
      th { background: #f0f0f0; font-weight: bold; }
      tr:nth-child(even) { background: #fafafa; }
      .section { margin: 25px 0; page-break-inside: avoid; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 9pt; font-weight: bold; }
      .badge-success { background: #d4edda; color: #155724; }
      .badge-danger { background: #f8d7da; color: #721c24; }
      .badge-warning { background: #fff3cd; color: #856404; }
      .badge-info { background: #d1ecf1; color: #0c5460; }
      .timeline { list-style: none; padding-left: 0; }
      .timeline li { padding: 10px 0; border-bottom: 1px solid #eee; }
      .timeline li:last-child { border-bottom: none; }
      .timestamp { color: #666; font-size: 9pt; }
      .hash { font-family: monospace; font-size: 9pt; color: #666; word-break: break-all; }
      .attestation { background: #f8f9fa; border: 1px solid #dee2e6; padding: 15px; margin-top: 30px; }
      .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 9pt; color: #666; }
      @media print {
        body { padding: 20px; }
        .section { page-break-inside: avoid; }
      }
    </style>
  `;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  const escapeHtml = (str: string) => {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  const renderValue = (value: unknown): string => {
    if (value === null || value === undefined) return '<em>N/A</em>';
    if (typeof value === 'object') return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
    return escapeHtml(String(value));
  };

  const renderStatusBadge = (status: string): string => {
    const statusMap: Record<string, string> = {
      active: 'badge-success',
      approved: 'badge-success',
      completed: 'badge-success',
      confirmed: 'badge-success',
      allow: 'badge-success',
      pending: 'badge-warning',
      processing: 'badge-info',
      rejected: 'badge-danger',
      denied: 'badge-danger',
      deny: 'badge-danger',
      failed: 'badge-danger',
    };
    const badgeClass = statusMap[status.toLowerCase()] || 'badge-info';
    return `<span class="badge ${badgeClass}">${escapeHtml(status.toUpperCase())}</span>`;
  };

  // Build sections based on pack type
  let sectionsHtml = '';

  const data = pack.data as Record<string, unknown>;

  // Render data sections
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;

    sectionsHtml += `<div class="section">`;
    sectionsHtml += `<h2>${escapeHtml(key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</h2>`;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        sectionsHtml += '<p><em>No records</em></p>';
      } else if (typeof value[0] === 'object') {
        // Table of objects
        const keys = Object.keys(value[0] as object);
        sectionsHtml += '<table><thead><tr>';
        keys.forEach(k => {
          sectionsHtml += `<th>${escapeHtml(k.replace(/_/g, ' '))}</th>`;
        });
        sectionsHtml += '</tr></thead><tbody>';
        value.slice(0, 50).forEach((item: any) => {
          sectionsHtml += '<tr>';
          keys.forEach(k => {
            const cellValue = item[k];
            if (k.toLowerCase().includes('status')) {
              sectionsHtml += `<td>${renderStatusBadge(String(cellValue || ''))}</td>`;
            } else {
              sectionsHtml += `<td>${renderValue(cellValue)}</td>`;
            }
          });
          sectionsHtml += '</tr>';
        });
        sectionsHtml += '</tbody></table>';
        if (value.length > 50) {
          sectionsHtml += `<p><em>... and ${value.length - 50} more records</em></p>`;
        }
      } else {
        // Simple list
        sectionsHtml += '<ul>';
        value.forEach(item => {
          sectionsHtml += `<li>${renderValue(item)}</li>`;
        });
        sectionsHtml += '</ul>';
      }
    } else if (typeof value === 'object') {
      sectionsHtml += '<table>';
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        sectionsHtml += `<tr><th>${escapeHtml(k.replace(/_/g, ' '))}</th><td>`;
        if (k.toLowerCase().includes('status')) {
          sectionsHtml += renderStatusBadge(String(v || ''));
        } else {
          sectionsHtml += renderValue(v);
        }
        sectionsHtml += '</td></tr>';
      }
      sectionsHtml += '</table>';
    } else {
      sectionsHtml += `<p>${renderValue(value)}</p>`;
    }

    sectionsHtml += '</div>';
  }

  // Render timeline if available
  if (data.timeline && Array.isArray(data.timeline)) {
    sectionsHtml += `<div class="section">`;
    sectionsHtml += `<h2>Event Timeline</h2>`;
    sectionsHtml += '<ul class="timeline">';
    (data.timeline as Array<{ timestamp: string; event: string; details?: string }>).forEach(item => {
      sectionsHtml += '<li>';
      sectionsHtml += `<span class="timestamp">${formatDate(item.timestamp)}</span><br/>`;
      sectionsHtml += `<strong>${escapeHtml(item.event)}</strong>`;
      if (item.details) {
        sectionsHtml += `<br/><small>${escapeHtml(item.details)}</small>`;
      }
      sectionsHtml += '</li>';
    });
    sectionsHtml += '</ul></div>';
  }

  // Render audit trail
  if (pack.auditTrail && pack.auditTrail.length > 0) {
    sectionsHtml += `<div class="section">`;
    sectionsHtml += `<h2>Audit Trail</h2>`;
    sectionsHtml += '<table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Description</th></tr></thead><tbody>';
    pack.auditTrail.slice(0, 100).forEach(log => {
      sectionsHtml += '<tr>';
      sectionsHtml += `<td class="timestamp">${formatDate(String(log.createdAt))}</td>`;
      sectionsHtml += `<td>${escapeHtml(log.actorId || 'System')}</td>`;
      sectionsHtml += `<td>${escapeHtml(log.action)}</td>`;
      sectionsHtml += `<td>${escapeHtml(log.description || '')}</td>`;
      sectionsHtml += '</tr>';
    });
    sectionsHtml += '</tbody></table>';
    if (pack.auditTrail.length > 100) {
      sectionsHtml += `<p><em>... and ${pack.auditTrail.length - 100} more entries</em></p>`;
    }
    sectionsHtml += '</div>';
  }

  // Attestation
  const attestationHtml = `
    <div class="attestation">
      <h3>Cryptographic Attestation</h3>
      <table>
        <tr><th>Content Hash</th><td class="hash">${escapeHtml(pack.attestation.contentHash)}</td></tr>
        <tr><th>Algorithm</th><td>${escapeHtml(pack.attestation.algorithm)}</td></tr>
        <tr><th>Attested At</th><td>${formatDate(pack.attestation.attestedAt)}</td></tr>
        ${pack.attestation.signature ? `<tr><th>Signature</th><td class="hash">${escapeHtml(pack.attestation.signature.substring(0, 64))}...</td></tr>` : ''}
      </table>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pack.type)} - ${escapeHtml(pack.subject.name || pack.subject.id)}</title>
  ${styles}
</head>
<body>
  <h1>${escapeHtml(pack.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))}</h1>

  <div class="meta">
    <p><strong>Pack ID:</strong> ${escapeHtml(pack.id)}</p>
    <p><strong>Generated:</strong> ${formatDate(pack.generatedAt)}</p>
    <p><strong>Subject Type:</strong> ${escapeHtml(pack.subject.type)}</p>
    <p><strong>Subject ID:</strong> ${escapeHtml(pack.subject.id)}</p>
    ${pack.subject.name ? `<p><strong>Subject Name:</strong> ${escapeHtml(pack.subject.name)}</p>` : ''}
    <p><strong>Organization:</strong> ${escapeHtml(pack.organization.id)}</p>
    <p><strong>Version:</strong> ${escapeHtml(pack.version)}</p>
  </div>

  ${sectionsHtml}

  ${attestationHtml}

  <div class="footer">
    <p>This document was generated automatically by the Tokenisation Platform.</p>
    <p>Document integrity can be verified using the content hash above.</p>
    <p>Generated: ${formatDate(pack.generatedAt)}</p>
  </div>
</body>
</html>`;
}

/**
 * Generate PDF-ready HTML from a regulatory pack.
 */
export function generateRegulatoryPackHtml(pack: RegulatoryPack): string {
  // Reuse the evidence pack HTML generator with adapted structure
  const evidenceStylePack: EvidencePack = {
    id: pack.id,
    generatedAt: pack.generatedAt,
    type: pack.type as any,
    version: pack.version,
    subject: pack.subject,
    organization: pack.organization,
    data: {
      asOfDate: pack.asOfDate,
      isCurrentState: pack.isCurrentState,
      tokenDetails: pack.tokenDetails,
      assetDetails: pack.assetDetails,
      capTable: pack.capTable,
      transferHistory: pack.transferHistory,
      issuanceHistory: pack.issuanceHistory,
      redemptionHistory: pack.redemptionHistory,
      complianceSection: pack.complianceSection,
      distributionHistory: pack.distributionHistory,
    },
    auditTrail: [],
    attestation: pack.attestation,
  };

  return generateEvidencePackHtml(evidenceStylePack);
}

/**
 * Generate a simple text report from an evidence pack.
 * Useful for plaintext exports or email bodies.
 */
export function generateEvidencePackText(pack: EvidencePack): string {
  const lines: string[] = [];
  const separator = '='.repeat(60);

  lines.push(separator);
  lines.push(pack.type.replace(/_/g, ' ').toUpperCase());
  lines.push(separator);
  lines.push('');
  lines.push(`Pack ID:      ${pack.id}`);
  lines.push(`Generated:    ${pack.generatedAt}`);
  lines.push(`Subject:      ${pack.subject.type} - ${pack.subject.id}`);
  if (pack.subject.name) lines.push(`Name:         ${pack.subject.name}`);
  lines.push(`Organization: ${pack.organization.id}`);
  lines.push('');

  const data = pack.data as Record<string, unknown>;

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;

    lines.push('-'.repeat(40));
    lines.push(key.replace(/_/g, ' ').toUpperCase());
    lines.push('-'.repeat(40));

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push('  (No records)');
      } else {
        value.slice(0, 20).forEach((item, i) => {
          if (typeof item === 'object') {
            lines.push(`  [${i + 1}]`);
            for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
              lines.push(`    ${k}: ${JSON.stringify(v)}`);
            }
          } else {
            lines.push(`  - ${item}`);
          }
        });
        if (value.length > 20) {
          lines.push(`  ... and ${value.length - 20} more`);
        }
      }
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`  ${k}: ${JSON.stringify(v)}`);
      }
    } else {
      lines.push(`  ${value}`);
    }

    lines.push('');
  }

  lines.push(separator);
  lines.push('ATTESTATION');
  lines.push(separator);
  lines.push(`Content Hash: ${pack.attestation.contentHash}`);
  lines.push(`Algorithm:    ${pack.attestation.algorithm}`);
  lines.push(`Attested At:  ${pack.attestation.attestedAt}`);
  if (pack.attestation.signature) {
    lines.push(`Signature:    ${pack.attestation.signature.substring(0, 32)}...`);
  }
  lines.push('');
  lines.push(separator);

  return lines.join('\n');
}

/**
 * Export structure for file downloads.
 */
export interface ExportResult {
  filename: string;
  content: string;
  mimeType: string;
  contentHash: string;
}

/**
 * Export an evidence pack in various formats.
 */
export function exportEvidencePack(
  pack: EvidencePack,
  format: 'json' | 'html' | 'text'
): ExportResult {
  const baseFilename = `evidence_pack_${pack.subject.type}_${pack.subject.id}_${pack.generatedAt.split('T')[0]}`;

  let content: string;
  let mimeType: string;
  let extension: string;

  switch (format) {
    case 'json':
      content = JSON.stringify(pack, null, 2);
      mimeType = 'application/json';
      extension = 'json';
      break;
    case 'html':
      content = generateEvidencePackHtml(pack);
      mimeType = 'text/html';
      extension = 'html';
      break;
    case 'text':
      content = generateEvidencePackText(pack);
      mimeType = 'text/plain';
      extension = 'txt';
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }

  return {
    filename: `${baseFilename}.${extension}`,
    content,
    mimeType,
    contentHash: createHash('sha256').update(content).digest('hex'),
  };
}
