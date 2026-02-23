/**
 * PSS/NDC/DCS Types
 *
 * Comprehensive type definitions for airline distribution systems:
 * - PSS (Passenger Service System) - Legacy GDS integration
 * - NDC (New Distribution Capability) - IATA modern API standard
 * - DCS (Departure Control System) - Check-in and boarding
 */

// ============================================================================
// COMMON TYPES
// ============================================================================

/**
 * Passenger information
 */
export interface Passenger {
  /** Passenger ID (within PNR) */
  passengerId: string;
  /** Passenger type */
  type: 'ADT' | 'CHD' | 'INF' | 'UNN'; // Adult, Child, Infant, Unaccompanied Minor
  /** Name prefix */
  namePrefix?: 'MR' | 'MRS' | 'MS' | 'MISS' | 'DR';
  /** Given name */
  givenName: string;
  /** Family name (surname) */
  familyName: string;
  /** Middle name */
  middleName?: string;
  /** Date of birth */
  dateOfBirth?: string;
  /** Gender */
  gender?: 'M' | 'F' | 'U';
  /** Nationality (ISO country code) */
  nationality?: string;
  /** Travel document */
  travelDocument?: {
    type: 'PASSPORT' | 'ID_CARD' | 'VISA' | 'OTHER';
    number: string;
    issuingCountry: string;
    expiryDate: string;
  };
  /** Contact information */
  contact?: {
    email?: string;
    phone?: string;
    mobilePhone?: string;
  };
  /** Frequent flyer info */
  frequentFlyer?: {
    airline: string;
    number: string;
    tier?: string;
  };
  /** Special service requests */
  ssrs?: SpecialServiceRequest[];
}

/**
 * Special Service Request
 */
export interface SpecialServiceRequest {
  code: string; // IATA SSR code (WCHR, MEAL, etc.)
  text?: string;
  quantity?: number;
  status?: 'HK' | 'RQ' | 'UC' | 'UN'; // Confirmed, Requested, Unable to Confirm, Unable
}

/**
 * Flight segment
 */
export interface FlightSegment {
  /** Segment ID */
  segmentId: string;
  /** Operating carrier */
  operatingCarrier: string;
  /** Marketing carrier */
  marketingCarrier: string;
  /** Flight number */
  flightNumber: string;
  /** Departure airport (IATA code) */
  departureAirport: string;
  /** Arrival airport (IATA code) */
  arrivalAirport: string;
  /** Departure date/time (ISO 8601) */
  departureDateTime: string;
  /** Arrival date/time (ISO 8601) */
  arrivalDateTime: string;
  /** Aircraft type */
  aircraftType?: string;
  /** Cabin class */
  cabinClass: 'F' | 'J' | 'W' | 'Y'; // First, Business, Premium Economy, Economy
  /** Booking class */
  bookingClass: string;
  /** Fare basis */
  fareBasis?: string;
  /** Status */
  status: 'HK' | 'RQ' | 'TK' | 'UC' | 'UN' | 'XX'; // Confirmed, etc.
  /** Seat assignments */
  seatAssignments?: SeatAssignment[];
}

/**
 * Seat assignment
 */
export interface SeatAssignment {
  passengerId: string;
  seatNumber: string;
  seatType?: 'WINDOW' | 'MIDDLE' | 'AISLE';
  characteristics?: string[]; // EXIT_ROW, EXTRA_LEG_ROOM, etc.
}

/**
 * Ticket information
 */
export interface Ticket {
  /** Ticket number (13 digits) */
  ticketNumber: string;
  /** Airline code (3 digits) */
  airlineCode: string;
  /** Document type */
  documentType: 'ETKT' | 'MCO' | 'EMD';
  /** Issue date */
  issueDate: string;
  /** Passenger */
  passengerId: string;
  /** Coupons */
  coupons: TicketCoupon[];
  /** Status */
  status: 'OPEN' | 'USED' | 'VOID' | 'REFUNDED' | 'EXCHANGED';
}

/**
 * Ticket coupon
 */
export interface TicketCoupon {
  couponNumber: number;
  segmentId: string;
  status: 'O' | 'F' | 'A' | 'E' | 'R' | 'V'; // Open, Flown, Airport Control, Exchanged, Refunded, Void
  notValidBefore?: string;
  notValidAfter?: string;
}

/**
 * Price breakdown
 */
export interface PriceBreakdown {
  /** Currency code */
  currency: string;
  /** Base fare */
  baseFare: number;
  /** Taxes */
  taxes: Array<{
    code: string;
    amount: number;
    description?: string;
  }>;
  /** Surcharges */
  surcharges?: Array<{
    code: string;
    amount: number;
    description?: string;
  }>;
  /** Total price */
  total: number;
}

// ============================================================================
// PNR TYPES
// ============================================================================

/**
 * Passenger Name Record
 */
export interface PNR {
  /** Record locator (6 characters) */
  recordLocator: string;
  /** Creation date */
  createdAt: string;
  /** Last modified date */
  updatedAt: string;
  /** PNR status */
  status: PNRStatus;
  /** Passengers */
  passengers: Passenger[];
  /** Flight segments */
  segments: FlightSegment[];
  /** Tickets */
  tickets?: Ticket[];
  /** Remarks */
  remarks?: PNRRemark[];
  /** Time limit for ticketing */
  ticketTimeLimit?: string;
  /** Contact information */
  contact?: {
    phone?: string;
    email?: string;
    agency?: string;
  };
  /** Payment information */
  payment?: PaymentInfo;
}

/**
 * PNR status
 */
export type PNRStatus =
  | 'CONFIRMED'
  | 'PENDING'
  | 'WAITLISTED'
  | 'TICKETED'
  | 'CANCELLED'
  | 'FLOWN'
  | 'NO_SHOW';

/**
 * PNR remark
 */
export interface PNRRemark {
  type: 'GENERAL' | 'CONFIDENTIAL' | 'INVOICE' | 'ITINERARY';
  text: string;
  createdAt?: string;
}

/**
 * Payment information
 */
export interface PaymentInfo {
  method: 'CC' | 'CA' | 'CK' | 'MS' | 'IV'; // Credit Card, Cash, Check, Misc, Invoice
  cardType?: string;
  cardNumber?: string; // Masked
  expiryDate?: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'AUTHORIZED' | 'CAPTURED' | 'REFUNDED' | 'FAILED';
}

// ============================================================================
// NDC TYPES
// ============================================================================

/**
 * NDC Offer
 */
export interface NDCOffer {
  /** Offer ID */
  offerId: string;
  /** Owner (airline) */
  owner: string;
  /** Offer expiration */
  expiresAt: string;
  /** Flight segments */
  segments: FlightSegment[];
  /** Price */
  price: PriceBreakdown;
  /** Fare type */
  fareType: 'PUBLIC' | 'PRIVATE' | 'CORPORATE';
  /** Fare rules */
  fareRules?: FareRule[];
  /** Included services */
  includedServices?: string[];
  /** Available ancillaries */
  ancillaries?: NDCAncillary[];
  /** Seat availability */
  seatAvailability?: number;
}

/**
 * Fare rule
 */
export interface FareRule {
  category: string;
  text: string;
}

/**
 * NDC Ancillary service
 */
export interface NDCAncillary {
  serviceId: string;
  type: 'BAGGAGE' | 'SEAT' | 'MEAL' | 'WIFI' | 'LOUNGE' | 'PRIORITY' | 'OTHER';
  name: string;
  description?: string;
  price: PriceBreakdown;
  quantity?: number;
  applicableSegments?: string[];
}

/**
 * NDC Order
 */
export interface NDCOrder {
  /** Order ID */
  orderId: string;
  /** Booking reference */
  bookingReference: string;
  /** Order status */
  status: NDCOrderStatus;
  /** Creation date */
  createdAt: string;
  /** Owner airline */
  owner: string;
  /** Passengers */
  passengers: Passenger[];
  /** Flight segments */
  segments: FlightSegment[];
  /** Tickets */
  tickets?: Ticket[];
  /** Price */
  totalPrice: PriceBreakdown;
  /** Payments */
  payments?: PaymentInfo[];
  /** Ancillaries purchased */
  ancillaries?: NDCAncillary[];
}

/**
 * NDC Order status
 */
export type NDCOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'TICKETED'
  | 'PARTIALLY_TICKETED'
  | 'CANCELLED'
  | 'COMPLETED';

/**
 * Seat map
 */
export interface SeatMap {
  segmentId: string;
  aircraft: string;
  cabins: SeatMapCabin[];
}

/**
 * Seat map cabin
 */
export interface SeatMapCabin {
  cabinClass: string;
  rows: SeatMapRow[];
}

/**
 * Seat map row
 */
export interface SeatMapRow {
  rowNumber: number;
  seats: SeatInfo[];
}

/**
 * Seat information
 */
export interface SeatInfo {
  column: string;
  available: boolean;
  characteristics: string[];
  price?: PriceBreakdown;
}

// ============================================================================
// DCS TYPES
// ============================================================================

/**
 * Check-in request
 */
export interface CheckInRequest {
  /** Record locator */
  recordLocator: string;
  /** Passenger IDs to check in */
  passengerIds: string[];
  /** Segment IDs to check in for */
  segmentIds: string[];
  /** Seat preferences */
  seatPreferences?: Array<{
    passengerId: string;
    preference: 'WINDOW' | 'AISLE' | 'ANY';
    row?: 'FRONT' | 'MIDDLE' | 'BACK' | 'ANY';
  }>;
  /** Baggage count */
  baggageCount?: Array<{
    passengerId: string;
    checkedBags: number;
    weight?: number;
  }>;
}

/**
 * Check-in result
 */
export interface CheckInResult {
  /** Success status */
  success: boolean;
  /** Checked-in passengers */
  checkedInPassengers: Array<{
    passengerId: string;
    seatNumber: string;
    boardingSequence: number;
    boardingGroup?: string;
  }>;
  /** Boarding passes */
  boardingPasses: BoardingPass[];
  /** Bag tags */
  bagTags?: BagTag[];
  /** Errors */
  errors?: Array<{
    passengerId: string;
    code: string;
    message: string;
  }>;
}

/**
 * Boarding pass
 */
export interface BoardingPass {
  passengerId: string;
  /** IATA BCBP format data */
  bcbpData: string;
  /** Boarding pass fields */
  passengerName: string;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureDate: string;
  departureTime: string;
  gate?: string;
  boardingTime?: string;
  seatNumber: string;
  cabinClass: string;
  boardingSequence: number;
  boardingGroup?: string;
  /** QR code data URL */
  qrCode?: string;
  /** Barcode data URL */
  barcode?: string;
}

/**
 * Bag tag
 */
export interface BagTag {
  tagNumber: string;
  passengerId: string;
  weight?: number;
  destination: string;
  /** Barcode data */
  barcodeData: string;
}

/**
 * Boarding status
 */
export interface BoardingStatus {
  segmentId: string;
  flightNumber: string;
  departureAirport: string;
  scheduledDeparture: string;
  estimatedDeparture?: string;
  actualDeparture?: string;
  gate?: string;
  status: 'SCHEDULED' | 'BOARDING' | 'FINAL_CALL' | 'GATE_CLOSED' | 'DEPARTED' | 'CANCELLED' | 'DELAYED';
  boardedCount: number;
  totalPassengers: number;
  passengers: Array<{
    passengerId: string;
    name: string;
    status: 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'BOARDED' | 'NO_SHOW';
    seatNumber?: string;
  }>;
}

// ============================================================================
// CONNECTOR INTERFACES
// ============================================================================

/**
 * PSS Connector interface
 */
export interface IPSSConnector {
  readonly providerId: string;
  readonly providerName: string;

  // PNR Operations
  createPNR(params: CreatePNRParams): Promise<PNRResult>;
  getPNR(recordLocator: string): Promise<PNRResult>;
  updatePassenger(recordLocator: string, passengerId: string, updates: Partial<Passenger>): Promise<PNRResult>;
  cancelPNR(recordLocator: string): Promise<PNRResult>;

  // Ticketing
  issueTicket(recordLocator: string, payment: PaymentInfo): Promise<TicketResult>;
  voidTicket(ticketNumber: string): Promise<TicketResult>;
  processRefund(ticketNumber: string, amount?: number): Promise<RefundResult>;
  exchangeTicket(ticketNumber: string, newSegments: FlightSegment[]): Promise<TicketResult>;

  // Health
  healthCheck(): Promise<boolean>;
}

/**
 * NDC Connector interface
 */
export interface INDCConnector {
  readonly providerId: string;
  readonly providerName: string;

  // Shopping
  searchOffers(params: OfferSearchParams): Promise<OfferSearchResult>;
  priceOffer(offerId: string): Promise<PriceResult>;
  getSeatMap(offerId: string, segmentId: string): Promise<SeatMapResult>;

  // Ordering
  createOrder(offerId: string, passengers: Passenger[], payment: PaymentInfo): Promise<OrderResult>;
  getOrder(orderId: string): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<OrderResult>;
  changeOrder(orderId: string, changes: OrderChangeRequest): Promise<OrderResult>;

  // Servicing
  addService(orderId: string, ancillary: NDCAncillary): Promise<OrderResult>;
  getRefundQuote(orderId: string): Promise<RefundQuoteResult>;

  // Health
  healthCheck(): Promise<boolean>;
}

/**
 * DCS Connector interface
 */
export interface IDCSConnector {
  readonly providerId: string;
  readonly providerName: string;

  // Check-in
  checkIn(request: CheckInRequest): Promise<CheckInResult>;
  getBoardingPass(recordLocator: string, passengerId: string): Promise<BoardingPassResult>;

  // Boarding
  board(recordLocator: string, passengerId: string): Promise<BoardResult>;
  getBoardingStatus(flightNumber: string, departureDate: string): Promise<BoardingStatusResult>;
  markNoShow(recordLocator: string, passengerId: string): Promise<Result>;

  // Health
  healthCheck(): Promise<boolean>;
}

// ============================================================================
// OPERATION PARAMETERS & RESULTS
// ============================================================================

export interface CreatePNRParams {
  passengers: Passenger[];
  segments: FlightSegment[];
  contact?: { phone?: string; email?: string };
  remarks?: string[];
}

export interface PNRResult {
  success: boolean;
  pnr?: PNR;
  error?: string;
}

export interface TicketResult {
  success: boolean;
  tickets?: Ticket[];
  error?: string;
}

export interface RefundResult {
  success: boolean;
  refundAmount?: number;
  currency?: string;
  error?: string;
}

export interface OfferSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  passengers: { adults: number; children?: number; infants?: number };
  cabinClass?: 'F' | 'J' | 'W' | 'Y';
  directOnly?: boolean;
  maxConnections?: number;
}

export interface OfferSearchResult {
  success: boolean;
  offers?: NDCOffer[];
  error?: string;
}

export interface PriceResult {
  success: boolean;
  price?: PriceBreakdown;
  error?: string;
}

export interface SeatMapResult {
  success: boolean;
  seatMap?: SeatMap;
  error?: string;
}

export interface OrderResult {
  success: boolean;
  order?: NDCOrder;
  error?: string;
}

export interface OrderChangeRequest {
  type: 'ADD_PASSENGER' | 'REMOVE_PASSENGER' | 'CHANGE_SEGMENT' | 'ADD_ANCILLARY';
  data: unknown;
}

export interface RefundQuoteResult {
  success: boolean;
  quote?: {
    refundableAmount: number;
    penalty: number;
    currency: string;
  };
  error?: string;
}

export interface BoardingPassResult {
  success: boolean;
  boardingPass?: BoardingPass;
  error?: string;
}

export interface BoardResult {
  success: boolean;
  boarded?: boolean;
  error?: string;
}

export interface BoardingStatusResult {
  success: boolean;
  status?: BoardingStatus;
  error?: string;
}

export interface Result {
  success: boolean;
  error?: string;
}
