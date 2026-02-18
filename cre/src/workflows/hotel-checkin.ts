/**
 * CRE Workflow: Hotel Check-In — PMS Inventory Reconciliation
 *
 * HTTP-triggered workflow that consumes Web2 Property Management System (PMS)
 * webhooks from Oracle OHIP or Mews and transitions the on-chain hotel
 * reservation token through its lifecycle to prevent double-booking.
 *
 * Supported PMS events:
 *   - room_checked_in  → transitions token from CONFIRMED to CHECKED_IN
 *   - room_checked_out → transitions token from CHECKED_IN to CHECKED_OUT
 *   - reservation_cancelled → transitions token to CANCELLED
 *   - no_show           → transitions token to NO_SHOW
 *
 * Each event is verified across DON nodes before the on-chain state transition
 * is executed, ensuring that a single faulty PMS webhook cannot corrupt the
 * reservation token state.
 *
 * @packageDocumentation
 */

import {
  Workflow,
  HttpTrigger,
  HttpCapability,
  EVMCapability,
  ConsensusCapability,
  type WorkflowSpec,
  type TriggerEvent,
} from '@chainlink/cre-sdk';

// ============================================================================
// Types
// ============================================================================

/**
 * PMS webhook event types
 */
type PMSEventType =
  | 'room_checked_in'
  | 'room_checked_out'
  | 'reservation_cancelled'
  | 'no_show'
  | 'room_assigned'
  | 'late_checkout';

/**
 * Normalised PMS webhook payload
 */
interface PMSWebhookPayload {
  /** PMS event type */
  eventType: PMSEventType;
  /** PMS reservation ID */
  pmsReservationId: string;
  /** Our on-chain token ID */
  tokenId: string;
  /** Token contract address */
  tokenAddress: string;
  /** Guest wallet address */
  guestAddress: string;
  /** Room number assigned */
  roomNumber?: string;
  /** Timestamp from the PMS */
  pmsTimestamp: string;
  /** PMS source identifier */
  pmsSource: 'oracle-ohip' | 'mews' | 'opera' | 'other';
  /** HMAC signature from the PMS for verification */
  pmsSignature?: string;
  /** Additional PMS metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Oracle OHIP webhook format
 */
interface OHIPWebhookEvent {
  eventId: string;
  hotelId: string;
  type: string;
  data: {
    confirmationNumber: string;
    guestProfile: {
      profileId: string;
      firstName: string;
      lastName: string;
    };
    roomNumber: string;
    arrivalDate: string;
    departureDate: string;
    status: string;
  };
  timestamp: string;
  signature: string;
}

/**
 * Mews webhook format
 */
interface MewsWebhookEvent {
  Type: string;
  Id: string;
  ReservationId: string;
  State: string;
  RoomNumber: string;
  CustomerId: string;
  StartUtc: string;
  EndUtc: string;
}

/**
 * Result of the state transition
 */
interface TransitionResult {
  success: boolean;
  tokenId: string;
  fromState: string;
  toState: string;
  txHash?: string;
  error?: string;
}

// ============================================================================
// State Transition Mapping
// ============================================================================

/**
 * Map PMS events to on-chain state transition function selectors.
 * These match the HotelReservationStateMachine state enum values.
 */
const STATE_TRANSITION_MAP: Record<PMSEventType, { toState: number; functionName: string }> = {
  room_checked_in:       { toState: 2, functionName: 'checkIn' },       // CONFIRMED(1) -> CHECKED_IN(2)
  room_checked_out:      { toState: 3, functionName: 'checkOut' },      // CHECKED_IN(2) -> CHECKED_OUT(3)
  reservation_cancelled: { toState: 5, functionName: 'cancel' },        // * -> CANCELLED(5)
  no_show:               { toState: 6, functionName: 'markNoShow' },    // CONFIRMED(1) -> NO_SHOW(6)
  room_assigned:         { toState: 1, functionName: 'confirmRoom' },   // CREATED(0) -> CONFIRMED(1)
  late_checkout:         { toState: 2, functionName: 'extendStay' },    // CHECKED_IN remains CHECKED_IN
};

// ============================================================================
// ABI
// ============================================================================

const HOTEL_TOKEN_ABI = [
  {
    name: 'getReservationState',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'state', type: 'uint8' }],
  },
  {
    name: 'checkIn',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'roomNumber', type: 'string' },
      { name: 'timestamp', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    name: 'checkOut',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    name: 'cancel',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'reason', type: 'string' },
      { name: 'timestamp', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    name: 'markNoShow',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'timestamp', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    name: 'confirmRoom',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'roomNumber', type: 'string' },
      { name: 'timestamp', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    name: 'extendStay',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'newCheckoutTime', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
] as const;

const CHAIN_ID = process.env.CRE_CHAIN_ID || '11155111';

// ============================================================================
// PMS Normalization
// ============================================================================

function normaliseOHIPEvent(raw: OHIPWebhookEvent): PMSWebhookPayload | null {
  const typeMap: Record<string, PMSEventType> = {
    CHECKIN: 'room_checked_in',
    CHECKOUT: 'room_checked_out',
    CANCELLATION: 'reservation_cancelled',
    NOSHOW: 'no_show',
    ROOM_ASSIGNMENT: 'room_assigned',
  };

  const eventType = typeMap[raw.type];
  if (!eventType) return null;

  return {
    eventType,
    pmsReservationId: raw.data.confirmationNumber,
    tokenId: '', // Resolved by server mapping
    tokenAddress: '',
    guestAddress: '',
    roomNumber: raw.data.roomNumber,
    pmsTimestamp: raw.timestamp,
    pmsSource: 'oracle-ohip',
    pmsSignature: raw.signature,
    metadata: {
      hotelId: raw.hotelId,
      guestProfile: raw.data.guestProfile,
      arrivalDate: raw.data.arrivalDate,
      departureDate: raw.data.departureDate,
    },
  };
}

function normaliseMewsEvent(raw: MewsWebhookEvent): PMSWebhookPayload | null {
  const typeMap: Record<string, PMSEventType> = {
    ReservationStarted: 'room_checked_in',
    ReservationEnded: 'room_checked_out',
    ReservationCancelled: 'reservation_cancelled',
  };

  const eventType = typeMap[raw.Type];
  if (!eventType) return null;

  return {
    eventType,
    pmsReservationId: raw.ReservationId,
    tokenId: '',
    tokenAddress: '',
    guestAddress: '',
    roomNumber: raw.RoomNumber,
    pmsTimestamp: raw.StartUtc,
    pmsSource: 'mews',
    metadata: {
      mewsId: raw.Id,
      customerId: raw.CustomerId,
      endDate: raw.EndUtc,
    },
  };
}

// ============================================================================
// Workflow Definition
// ============================================================================

const hotelCheckinWorkflow: WorkflowSpec = {
  name: 'hotel-checkin-reconciliation',
  owner: 'tokenisation-sdk',
  version: '1.0.0',

  triggers: [
    {
      type: 'http',
      id: 'http-pms-webhook',
      config: {
        method: 'POST',
        path: '/hotel-pms-event',
        authentication: 'bearer',
      },
    } as HttpTrigger,
  ],

  capabilities: {
    http: {
      type: 'http',
      config: {
        allowedDomains: ['*'],
        maxConcurrent: 4,
        timeoutMs: 10_000,
      },
    } as HttpCapability,

    consensus: {
      type: 'consensus',
      config: {
        method: 'median',
        minResponses: 3,
        maxDeviation: 0, // State transitions are exact — no deviation allowed
      },
    } as ConsensusCapability,

    evm: {
      type: 'evm',
      config: {
        chainId: CHAIN_ID,
        actions: ['read', 'write'],
      },
    } as EVMCapability,
  },

  async execute(event: TriggerEvent, capabilities) {
    const { http, consensus, evm } = capabilities;
    const body = event.body as Record<string, unknown>;

    // ---- 1. Normalize the PMS webhook ----
    let payload: PMSWebhookPayload | null = null;

    // Auto-detect PMS format
    if (body.eventId && body.hotelId) {
      // Oracle OHIP format
      payload = normaliseOHIPEvent(body as unknown as OHIPWebhookEvent);
    } else if (body.Type && body.ReservationId) {
      // Mews format
      payload = normaliseMewsEvent(body as unknown as MewsWebhookEvent);
    } else if (body.eventType && body.pmsReservationId) {
      // Pre-normalized format (from our server adapter)
      payload = body as unknown as PMSWebhookPayload;
    }

    if (!payload) {
      return { status: 'error', reason: 'Unrecognized PMS webhook format' };
    }

    // ---- 2. Resolve tokenId and tokenAddress from server if not present ----
    if (!payload.tokenId || !payload.tokenAddress) {
      try {
        const lookupUrl =
          process.env.RESERVATION_LOOKUP_URL ||
          'http://localhost:3000/api/v1/hotels/lookup-by-pms-id';

        const lookupRes = await http.fetch(lookupUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pmsReservationId: payload.pmsReservationId,
            pmsSource: payload.pmsSource,
          }),
          timeout: 5_000,
        });

        if (lookupRes.ok) {
          const lookup = (await lookupRes.json()) as {
            tokenId: string;
            tokenAddress: string;
            guestAddress: string;
          };
          payload.tokenId = lookup.tokenId;
          payload.tokenAddress = lookup.tokenAddress;
          payload.guestAddress = lookup.guestAddress;
        } else {
          return {
            status: 'error',
            reason: `Reservation lookup failed: ${payload.pmsReservationId}`,
          };
        }
      } catch (err) {
        return { status: 'error', reason: `Lookup error: ${err}` };
      }
    }

    // ---- 3. Read current on-chain state ----
    const currentStateResult = await evm.readContract({
      address: payload.tokenAddress,
      abi: HOTEL_TOKEN_ABI,
      functionName: 'getReservationState',
      args: [BigInt(payload.tokenId)],
      chainId: parseInt(CHAIN_ID, 10),
    });

    const currentState = Number(currentStateResult.value);

    // ---- 4. DON consensus on the transition ----
    const transition = STATE_TRANSITION_MAP[payload.eventType];
    if (!transition) {
      return { status: 'error', reason: `Unknown event type: ${payload.eventType}` };
    }

    const consensusInput = {
      tokenId: payload.tokenId,
      currentState,
      targetState: transition.toState,
      eventType: payload.eventType,
      pmsTimestamp: new Date(payload.pmsTimestamp).getTime(),
    };

    const agreed = await consensus.reach(consensusInput);

    if ((agreed.targetState as number) !== transition.toState) {
      return {
        status: 'error',
        reason: `DON consensus disagreed on target state: ${agreed.targetState} vs ${transition.toState}`,
      };
    }

    // ---- 5. Execute on-chain state transition ----
    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    let txHash: string | undefined;

    try {
      let txResult;

      switch (payload.eventType) {
        case 'room_checked_in':
          txResult = await evm.writeContract({
            address: payload.tokenAddress,
            abi: HOTEL_TOKEN_ABI,
            functionName: 'checkIn',
            args: [BigInt(payload.tokenId), payload.roomNumber || '', timestamp],
            chainId: parseInt(CHAIN_ID, 10),
          });
          break;

        case 'room_checked_out':
          txResult = await evm.writeContract({
            address: payload.tokenAddress,
            abi: HOTEL_TOKEN_ABI,
            functionName: 'checkOut',
            args: [BigInt(payload.tokenId), timestamp],
            chainId: parseInt(CHAIN_ID, 10),
          });
          break;

        case 'reservation_cancelled':
          txResult = await evm.writeContract({
            address: payload.tokenAddress,
            abi: HOTEL_TOKEN_ABI,
            functionName: 'cancel',
            args: [BigInt(payload.tokenId), 'PMS cancellation', timestamp],
            chainId: parseInt(CHAIN_ID, 10),
          });
          break;

        case 'no_show':
          txResult = await evm.writeContract({
            address: payload.tokenAddress,
            abi: HOTEL_TOKEN_ABI,
            functionName: 'markNoShow',
            args: [BigInt(payload.tokenId), timestamp],
            chainId: parseInt(CHAIN_ID, 10),
          });
          break;

        case 'room_assigned':
          txResult = await evm.writeContract({
            address: payload.tokenAddress,
            abi: HOTEL_TOKEN_ABI,
            functionName: 'confirmRoom',
            args: [BigInt(payload.tokenId), payload.roomNumber || '', timestamp],
            chainId: parseInt(CHAIN_ID, 10),
          });
          break;

        case 'late_checkout':
          txResult = await evm.writeContract({
            address: payload.tokenAddress,
            abi: HOTEL_TOKEN_ABI,
            functionName: 'extendStay',
            args: [BigInt(payload.tokenId), timestamp + 14400n], // +4 hours
            chainId: parseInt(CHAIN_ID, 10),
          });
          break;
      }

      txHash = txResult?.transactionHash;
    } catch (error) {
      return {
        status: 'transition_failed',
        reason: `On-chain transition failed: ${error}`,
        eventType: payload.eventType,
        tokenId: payload.tokenId,
        fromState: currentState,
        targetState: transition.toState,
      };
    }

    // ---- 6. POST result callback to server ----
    const callbackUrl =
      process.env.HOTEL_CHECKIN_CALLBACK_URL ||
      'http://localhost:3000/api/v1/hotels/pms-sync-callback';

    try {
      await http.fetch(callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'hotel_state_transition',
          pmsReservationId: payload.pmsReservationId,
          tokenId: payload.tokenId,
          eventType: payload.eventType,
          fromState: currentState,
          toState: transition.toState,
          roomNumber: payload.roomNumber,
          txHash,
          pmsSource: payload.pmsSource,
          timestamp: new Date().toISOString(),
        }),
        timeout: 5_000,
      });
    } catch {
      console.error(`Callback to ${callbackUrl} failed`);
    }

    const result: TransitionResult = {
      success: true,
      tokenId: payload.tokenId,
      fromState: String(currentState),
      toState: String(transition.toState),
      txHash,
    };

    return result;
  },
};

export default Workflow.create(hotelCheckinWorkflow);
export type { PMSWebhookPayload, PMSEventType, TransitionResult };
