/**
 * Boarding Pass Service (Gap 16)
 *
 * Generates boarding pass HTML and Apple Wallet JSON structures
 * from airline ticket data. Uses rawQuery for direct DB access.
 */

import { rawQuery } from '../config/database.js';
import { randomUUID } from 'crypto';
import { NotFoundError, ValidationError } from '../middleware/errorHandler.js';
import { logger } from '../middleware/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface BoardingPassResult {
  html: string;
  metadata: {
    ticketId: string;
    passengerName: string;
    flightNumber: string;
    departureAirport: string;
    arrivalAirport: string;
    departureTime: string;
    gate: string | null;
    seat: string | null;
    ticketClass: string;
    bookingReference: string;
    eTicketNumber: string;
    qrCodeUrl: string;
    generatedAt: string;
  };
}

export interface WalletPassResult {
  formatVersion: number;
  passTypeIdentifier: string;
  serialNumber: string;
  teamIdentifier: string;
  organizationName: string;
  description: string;
  logoText: string;
  foregroundColor: string;
  backgroundColor: string;
  labelColor: string;
  barcode: {
    message: string;
    format: string;
    messageEncoding: string;
    altText: string;
  };
  boardingPass: {
    transitType: string;
    headerFields: Array<{ key: string; label: string; value: string }>;
    primaryFields: Array<{ key: string; label: string; value: string }>;
    secondaryFields: Array<{ key: string; label: string; value: string }>;
    auxiliaryFields: Array<{ key: string; label: string; value: string }>;
    backFields: Array<{ key: string; label: string; value: string }>;
  };
  relevantDate: string;
  locations?: Array<{ latitude: number; longitude: number; relevantText: string }>;
}

// ============================================================================
// Internal Helpers
// ============================================================================

interface TicketRow {
  id: string;
  org_id: string;
  flight_number: string;
  airline: string;
  departure_time: string;
  arrival_time: string;
  departure_airport: string;
  arrival_airport: string;
  gate: string | null;
  seat: string | null;
  ticket_class: string;
  passenger_id: string | null;
  passenger_wallet: string | null;
  passenger_name: string | null;
  e_ticket_number: string;
  booking_reference: string;
  status: string;
  metadata: string | Record<string, unknown>;
}

async function fetchTicket(ticketId: string, orgId: string): Promise<TicketRow> {
  const rows = await rawQuery<TicketRow>(
    `SELECT id, org_id, flight_number, airline, departure_time, arrival_time,
            departure_airport, arrival_airport, gate, seat, ticket_class,
            passenger_id, passenger_wallet, passenger_name,
            e_ticket_number, booking_reference, status, metadata
     FROM airline_tickets
     WHERE id = $1 AND org_id = $2
     LIMIT 1`,
    [ticketId, orgId],
  );

  if (!rows || rows.length === 0) {
    throw new NotFoundError('Ticket not found');
  }

  return rows[0];
}

function formatDateTime(isoString: string): { date: string; time: string } {
  const d = new Date(isoString);
  const date = d.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = d.toTimeString().slice(0, 5);   // HH:MM
  return { date, time };
}

function buildVerificationUrl(ticketId: string, orgId: string): string {
  const baseUrl = process.env.APP_BASE_URL || 'https://api.tokenisation.io';
  return `${baseUrl}/api/v1/tickets/${ticketId}/verify?org=${orgId}&nonce=${randomUUID().slice(0, 8)}`;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a boarding pass as an HTML string with metadata.
 * The HTML can be rendered client-side or converted to PDF server-side.
 */
export async function generateBoardingPass(
  ticketId: string,
  orgId: string,
): Promise<BoardingPassResult> {
  const ticket = await fetchTicket(ticketId, orgId);

  if (!['ISSUED', 'CONFIRMED', 'CHECKED_IN', 'BOARDED'].includes(ticket.status)) {
    throw new ValidationError(
      `Cannot generate boarding pass for ticket in status: ${ticket.status}`,
    );
  }

  const dep = formatDateTime(ticket.departure_time);
  const arr = formatDateTime(ticket.arrival_time);
  const passengerName = ticket.passenger_name || 'PASSENGER';
  const qrCodeUrl = buildVerificationUrl(ticketId, orgId);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Boarding Pass - ${ticket.flight_number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #f0f0f0; padding: 20px; }
    .boarding-pass { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
    .header { background: linear-gradient(135deg, #1a237e, #283593); color: #fff; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
    .header .airline-name { font-size: 20px; font-weight: 700; letter-spacing: 1px; }
    .header .flight-num { font-size: 16px; font-weight: 400; opacity: 0.9; }
    .passenger-row { padding: 16px 24px; border-bottom: 1px dashed #ccc; }
    .passenger-row .label { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
    .passenger-row .value { font-size: 18px; font-weight: 700; margin-top: 2px; }
    .route { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px dashed #ccc; }
    .route .airport-code { font-size: 36px; font-weight: 700; color: #1a237e; }
    .route .airport-label { font-size: 10px; color: #888; text-transform: uppercase; }
    .route .arrow { font-size: 24px; color: #ccc; }
    .details { display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 16px 24px; gap: 12px; border-bottom: 1px dashed #ccc; }
    .details .detail .label { font-size: 10px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
    .details .detail .value { font-size: 16px; font-weight: 600; margin-top: 2px; }
    .qr-section { display: flex; justify-content: center; align-items: center; padding: 20px; background: #fafafa; }
    .qr-section .qr-placeholder { width: 150px; height: 150px; border: 2px solid #1a237e; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #888; text-align: center; padding: 8px; word-break: break-all; }
    .footer { padding: 12px 24px; background: #f5f5f5; font-size: 10px; color: #999; text-align: center; }
    .status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: #e8f5e9; color: #2e7d32; }
  </style>
</head>
<body>
  <div class="boarding-pass">
    <div class="header">
      <div>
        <div class="airline-name">${escapeHtml(ticket.airline)}</div>
        <div class="flight-num">Flight ${escapeHtml(ticket.flight_number)}</div>
      </div>
      <div class="status-badge">${escapeHtml(ticket.status)}</div>
    </div>

    <div class="passenger-row">
      <div class="label">Passenger Name</div>
      <div class="value">${escapeHtml(passengerName)}</div>
    </div>

    <div class="route">
      <div>
        <div class="airport-code">${escapeHtml(ticket.departure_airport)}</div>
        <div class="airport-label">Departure</div>
      </div>
      <div class="arrow">&#9992;</div>
      <div>
        <div class="airport-code">${escapeHtml(ticket.arrival_airport)}</div>
        <div class="airport-label">Arrival</div>
      </div>
    </div>

    <div class="details">
      <div class="detail">
        <div class="label">Date</div>
        <div class="value">${dep.date}</div>
      </div>
      <div class="detail">
        <div class="label">Departure</div>
        <div class="value">${dep.time}</div>
      </div>
      <div class="detail">
        <div class="label">Arrival</div>
        <div class="value">${arr.time}</div>
      </div>
      <div class="detail">
        <div class="label">Gate</div>
        <div class="value">${escapeHtml(ticket.gate || '--')}</div>
      </div>
      <div class="detail">
        <div class="label">Seat</div>
        <div class="value">${escapeHtml(ticket.seat || '--')}</div>
      </div>
      <div class="detail">
        <div class="label">Class</div>
        <div class="value">${escapeHtml(ticket.ticket_class)}</div>
      </div>
      <div class="detail">
        <div class="label">Booking Ref</div>
        <div class="value">${escapeHtml(ticket.booking_reference)}</div>
      </div>
      <div class="detail">
        <div class="label">E-Ticket</div>
        <div class="value">${escapeHtml(ticket.e_ticket_number)}</div>
      </div>
    </div>

    <div class="qr-section">
      <div class="qr-placeholder">
        QR Code<br/>${escapeHtml(qrCodeUrl)}
      </div>
    </div>

    <div class="footer">
      Tokenised Boarding Pass &bull; ${new Date().toISOString().split('T')[0]}
    </div>
  </div>
</body>
</html>`;

  const result: BoardingPassResult = {
    html,
    metadata: {
      ticketId: ticket.id,
      passengerName,
      flightNumber: ticket.flight_number,
      departureAirport: ticket.departure_airport,
      arrivalAirport: ticket.arrival_airport,
      departureTime: ticket.departure_time,
      gate: ticket.gate,
      seat: ticket.seat,
      ticketClass: ticket.ticket_class,
      bookingReference: ticket.booking_reference,
      eTicketNumber: ticket.e_ticket_number,
      qrCodeUrl,
      generatedAt: new Date().toISOString(),
    },
  };

  logger.info('Boarding pass generated', { ticketId, orgId });
  return result;
}

/**
 * Generate an Apple Wallet .pkpass JSON structure.
 * In production this would be signed and packaged; here we return the JSON manifest.
 */
export async function generateWalletPass(
  ticketId: string,
  orgId: string,
): Promise<WalletPassResult> {
  const ticket = await fetchTicket(ticketId, orgId);

  if (!['ISSUED', 'CONFIRMED', 'CHECKED_IN', 'BOARDED'].includes(ticket.status)) {
    throw new ValidationError(
      `Cannot generate wallet pass for ticket in status: ${ticket.status}`,
    );
  }

  const dep = formatDateTime(ticket.departure_time);
  const arr = formatDateTime(ticket.arrival_time);
  const passengerName = ticket.passenger_name || 'PASSENGER';
  const verificationUrl = buildVerificationUrl(ticketId, orgId);

  const passTypeIdentifier =
    process.env.APPLE_PASS_TYPE_ID || 'pass.io.tokenisation.boardingpass';
  const teamIdentifier = process.env.APPLE_TEAM_ID || 'XXXXXXXXXX';

  const walletPass: WalletPassResult = {
    formatVersion: 1,
    passTypeIdentifier,
    serialNumber: ticket.id,
    teamIdentifier,
    organizationName: ticket.airline,
    description: `Boarding Pass - ${ticket.flight_number}`,
    logoText: ticket.airline,
    foregroundColor: 'rgb(255, 255, 255)',
    backgroundColor: 'rgb(26, 35, 126)',
    labelColor: 'rgb(200, 200, 255)',
    barcode: {
      message: verificationUrl,
      format: 'PKBarcodeFormatQR',
      messageEncoding: 'iso-8859-1',
      altText: ticket.booking_reference,
    },
    boardingPass: {
      transitType: 'PKTransitTypeAir',
      headerFields: [
        {
          key: 'flight',
          label: 'FLIGHT',
          value: ticket.flight_number,
        },
      ],
      primaryFields: [
        {
          key: 'origin',
          label: 'FROM',
          value: ticket.departure_airport,
        },
        {
          key: 'destination',
          label: 'TO',
          value: ticket.arrival_airport,
        },
      ],
      secondaryFields: [
        {
          key: 'passenger',
          label: 'PASSENGER',
          value: passengerName,
        },
        {
          key: 'gate',
          label: 'GATE',
          value: ticket.gate || '--',
        },
      ],
      auxiliaryFields: [
        {
          key: 'departure',
          label: 'DEPARTURE',
          value: `${dep.date} ${dep.time}`,
        },
        {
          key: 'arrival',
          label: 'ARRIVAL',
          value: `${arr.date} ${arr.time}`,
        },
        {
          key: 'seat',
          label: 'SEAT',
          value: ticket.seat || '--',
        },
        {
          key: 'class',
          label: 'CLASS',
          value: ticket.ticket_class,
        },
      ],
      backFields: [
        {
          key: 'booking',
          label: 'BOOKING REFERENCE',
          value: ticket.booking_reference,
        },
        {
          key: 'eticket',
          label: 'E-TICKET',
          value: ticket.e_ticket_number,
        },
        {
          key: 'status',
          label: 'STATUS',
          value: ticket.status,
        },
        {
          key: 'ticketId',
          label: 'TOKEN ID',
          value: ticket.id,
        },
      ],
    },
    relevantDate: ticket.departure_time,
  };

  logger.info('Wallet pass generated', { ticketId, orgId });
  return walletPass;
}

// ============================================================================
// Utility
// ============================================================================

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}
