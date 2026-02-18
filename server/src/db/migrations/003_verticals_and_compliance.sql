-- Migration 003: Verticals (Hotel, Car Rental, Concert) + Compliance Columns
-- Run after 002_airline_tickets.sql

-- ============================================================================
-- Sanctions columns on investors
-- ============================================================================

ALTER TABLE investors ADD COLUMN IF NOT EXISTS sanctions_status VARCHAR(32) DEFAULT 'not_screened';
ALTER TABLE investors ADD COLUMN IF NOT EXISTS sanctions_screened_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_investors_sanctions_status ON investors(sanctions_status);

-- ============================================================================
-- Hotel Reservations
-- ============================================================================

CREATE TABLE IF NOT EXISTS hotel_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  token_id UUID REFERENCES tokens(id) ON DELETE SET NULL,
  chain_token_id VARCHAR(78),
  contract_address VARCHAR(42),
  chain_id INTEGER,
  hotel_code VARCHAR(16) NOT NULL,
  hotel_name VARCHAR(256) NOT NULL,
  guest_name VARCHAR(256),
  guest_email VARCHAR(256),
  room_type VARCHAR(32) NOT NULL DEFAULT 'STANDARD',
  room_number VARCHAR(16),
  check_in_date TIMESTAMPTZ NOT NULL,
  check_out_date TIMESTAMPTZ NOT NULL,
  night_count INTEGER,
  rate NUMERIC(18,8),
  currency VARCHAR(8) DEFAULT 'USD',
  guest_id UUID REFERENCES investors(id) ON DELETE SET NULL,
  guest_wallet VARCHAR(42),
  confirmation_number VARCHAR(32) NOT NULL,
  booking_reference VARCHAR(16),
  status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
  confirmed_at TIMESTAMPTZ,
  checked_in_at TIMESTAMPTZ,
  checked_out_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  transferable BOOLEAN DEFAULT TRUE,
  max_transfers INTEGER DEFAULT 2,
  transfer_count INTEGER DEFAULT 0,
  price_paid NUMERIC(18,8) DEFAULT 0,
  metadata_version INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotel_reservations_org ON hotel_reservations(org_id);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_hotel_checkin ON hotel_reservations(hotel_code, check_in_date);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_status ON hotel_reservations(status);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_guest ON hotel_reservations(guest_id);
CREATE INDEX IF NOT EXISTS idx_hotel_reservations_wallet ON hotel_reservations(guest_wallet);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_reservations_confirmation ON hotel_reservations(org_id, confirmation_number);

CREATE TABLE IF NOT EXISTS hotel_reservation_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES hotel_reservations(id) ON DELETE CASCADE,
  from_wallet VARCHAR(42) NOT NULL,
  to_wallet VARCHAR(42) NOT NULL,
  from_guest_id UUID REFERENCES investors(id) ON DELETE SET NULL,
  to_guest_id UUID REFERENCES investors(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  kyc_required BOOLEAN DEFAULT FALSE,
  kyc_completed BOOLEAN DEFAULT FALSE,
  kyc_completed_at TIMESTAMPTZ,
  resale_fee NUMERIC(18,8),
  resale_fee_currency VARCHAR(8),
  resale_fee_paid BOOLEAN DEFAULT FALSE,
  idempotency_key VARCHAR(128),
  tx_hash VARCHAR(66),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotel_reservation_transfers_org ON hotel_reservation_transfers(org_id);
CREATE INDEX IF NOT EXISTS idx_hotel_reservation_transfers_reservation ON hotel_reservation_transfers(reservation_id);
CREATE INDEX IF NOT EXISTS idx_hotel_reservation_transfers_status ON hotel_reservation_transfers(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hotel_reservation_transfers_idempotency ON hotel_reservation_transfers(org_id, idempotency_key);

CREATE TABLE IF NOT EXISTS hotel_reservation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  reservation_id UUID NOT NULL REFERENCES hotel_reservations(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  actor VARCHAR(256),
  actor_role VARCHAR(32),
  previous_state VARCHAR(32),
  new_state VARCHAR(32),
  details JSONB DEFAULT '{}',
  correlation_id VARCHAR(64),
  tx_hash VARCHAR(66),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hotel_reservation_events_org ON hotel_reservation_events(org_id);
CREATE INDEX IF NOT EXISTS idx_hotel_reservation_events_reservation ON hotel_reservation_events(reservation_id);
CREATE INDEX IF NOT EXISTS idx_hotel_reservation_events_type ON hotel_reservation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_hotel_reservation_events_correlation ON hotel_reservation_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_hotel_reservation_events_created ON hotel_reservation_events(created_at);

-- ============================================================================
-- Car Rentals
-- ============================================================================

CREATE TABLE IF NOT EXISTS car_rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  token_id UUID REFERENCES tokens(id) ON DELETE SET NULL,
  chain_token_id VARCHAR(78),
  contract_address VARCHAR(42),
  chain_id INTEGER,
  rental_company_code VARCHAR(16) NOT NULL,
  rental_company_name VARCHAR(256) NOT NULL,
  driver_name VARCHAR(256) NOT NULL,
  vehicle_category VARCHAR(32) DEFAULT 'MIDSIZE',
  vehicle_make VARCHAR(64),
  vehicle_model VARCHAR(64),
  vehicle_plate VARCHAR(20),
  pickup_date TIMESTAMPTZ NOT NULL,
  return_date TIMESTAMPTZ NOT NULL,
  pickup_location VARCHAR(256),
  return_location VARCHAR(256),
  daily_rate NUMERIC(18,8),
  currency VARCHAR(8) DEFAULT 'USD',
  deposit_amount NUMERIC(18,8),
  deposit_resolution VARCHAR(32),
  charge_amount NUMERIC(18,8),
  insurance_type VARCHAR(32),
  insurance_provider VARCHAR(128),
  driver_id UUID REFERENCES investors(id) ON DELETE SET NULL,
  driver_wallet VARCHAR(42),
  confirmation_number VARCHAR(32) NOT NULL,
  booking_reference VARCHAR(16),
  status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
  confirmed_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  inspected_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  pickup_mileage INTEGER,
  pickup_fuel_level VARCHAR(16),
  return_mileage INTEGER,
  return_fuel_level VARCHAR(16),
  damage_report JSONB DEFAULT '{}',
  vehicle_condition JSONB DEFAULT '{}',
  transferable BOOLEAN DEFAULT TRUE,
  max_transfers INTEGER DEFAULT 2,
  transfer_count INTEGER DEFAULT 0,
  metadata_version INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_car_rentals_org ON car_rentals(org_id);
CREATE INDEX IF NOT EXISTS idx_car_rentals_company_pickup ON car_rentals(rental_company_code, pickup_date);
CREATE INDEX IF NOT EXISTS idx_car_rentals_status ON car_rentals(status);
CREATE INDEX IF NOT EXISTS idx_car_rentals_driver ON car_rentals(driver_id);
CREATE INDEX IF NOT EXISTS idx_car_rentals_wallet ON car_rentals(driver_wallet);
CREATE UNIQUE INDEX IF NOT EXISTS idx_car_rentals_confirmation ON car_rentals(org_id, confirmation_number);

CREATE TABLE IF NOT EXISTS car_rental_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  rental_id UUID NOT NULL REFERENCES car_rentals(id) ON DELETE CASCADE,
  from_wallet VARCHAR(42) NOT NULL,
  to_wallet VARCHAR(42) NOT NULL,
  from_driver_id UUID REFERENCES investors(id) ON DELETE SET NULL,
  to_driver_id UUID REFERENCES investors(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  kyc_required BOOLEAN DEFAULT FALSE,
  kyc_completed BOOLEAN DEFAULT FALSE,
  kyc_completed_at TIMESTAMPTZ,
  resale_fee NUMERIC(18,8),
  resale_fee_currency VARCHAR(8),
  resale_fee_paid BOOLEAN DEFAULT FALSE,
  idempotency_key VARCHAR(128),
  tx_hash VARCHAR(66),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_car_rental_transfers_org ON car_rental_transfers(org_id);
CREATE INDEX IF NOT EXISTS idx_car_rental_transfers_rental ON car_rental_transfers(rental_id);
CREATE INDEX IF NOT EXISTS idx_car_rental_transfers_status ON car_rental_transfers(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_car_rental_transfers_idempotency ON car_rental_transfers(org_id, idempotency_key);

CREATE TABLE IF NOT EXISTS car_rental_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  rental_id UUID NOT NULL REFERENCES car_rentals(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  actor VARCHAR(256),
  actor_role VARCHAR(32),
  previous_state VARCHAR(32),
  new_state VARCHAR(32),
  details JSONB DEFAULT '{}',
  correlation_id VARCHAR(64),
  tx_hash VARCHAR(66),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_car_rental_events_org ON car_rental_events(org_id);
CREATE INDEX IF NOT EXISTS idx_car_rental_events_rental ON car_rental_events(rental_id);
CREATE INDEX IF NOT EXISTS idx_car_rental_events_type ON car_rental_events(event_type);
CREATE INDEX IF NOT EXISTS idx_car_rental_events_correlation ON car_rental_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_car_rental_events_created ON car_rental_events(created_at);

-- ============================================================================
-- Concert Tickets
-- ============================================================================

CREATE TABLE IF NOT EXISTS concert_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  token_id UUID REFERENCES tokens(id) ON DELETE SET NULL,
  chain_token_id VARCHAR(78),
  contract_address VARCHAR(42),
  chain_id INTEGER,
  venue_code VARCHAR(16) NOT NULL,
  venue_name VARCHAR(256) NOT NULL,
  event_name VARCHAR(256) NOT NULL,
  artist VARCHAR(256) NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  doors_open TIMESTAMPTZ,
  section VARCHAR(32),
  row VARCHAR(16),
  seat_number VARCHAR(16),
  seating_tier VARCHAR(32) NOT NULL DEFAULT 'GA',
  face_value NUMERIC(18,8) NOT NULL,
  resale_price_cap NUMERIC(18,8),
  currency VARCHAR(8) DEFAULT 'USD',
  fan_name VARCHAR(256),
  fan_id UUID REFERENCES investors(id) ON DELETE SET NULL,
  fan_wallet VARCHAR(42),
  age_verified BOOLEAN DEFAULT FALSE,
  admitted_at TIMESTAMPTZ,
  confirmation_code VARCHAR(32) NOT NULL,
  booking_reference VARCHAR(16),
  status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
  issued_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  transferable BOOLEAN DEFAULT TRUE,
  max_transfers INTEGER DEFAULT 3,
  transfer_count INTEGER DEFAULT 0,
  metadata_version INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concert_tickets_org ON concert_tickets(org_id);
CREATE INDEX IF NOT EXISTS idx_concert_tickets_venue_event ON concert_tickets(venue_code, event_date);
CREATE INDEX IF NOT EXISTS idx_concert_tickets_status ON concert_tickets(status);
CREATE INDEX IF NOT EXISTS idx_concert_tickets_fan ON concert_tickets(fan_id);
CREATE INDEX IF NOT EXISTS idx_concert_tickets_wallet ON concert_tickets(fan_wallet);
CREATE UNIQUE INDEX IF NOT EXISTS idx_concert_tickets_confirmation ON concert_tickets(org_id, confirmation_code);

CREATE TABLE IF NOT EXISTS concert_ticket_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  concert_ticket_id UUID NOT NULL REFERENCES concert_tickets(id) ON DELETE CASCADE,
  from_wallet VARCHAR(42) NOT NULL,
  to_wallet VARCHAR(42) NOT NULL,
  from_fan_id UUID REFERENCES investors(id) ON DELETE SET NULL,
  to_fan_id UUID REFERENCES investors(id) ON DELETE SET NULL,
  resale_price NUMERIC(18,8),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  kyc_required BOOLEAN DEFAULT FALSE,
  kyc_completed BOOLEAN DEFAULT FALSE,
  kyc_completed_at TIMESTAMPTZ,
  resale_fee NUMERIC(18,8),
  resale_fee_currency VARCHAR(8),
  resale_fee_paid BOOLEAN DEFAULT FALSE,
  idempotency_key VARCHAR(128),
  tx_hash VARCHAR(66),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concert_ticket_transfers_org ON concert_ticket_transfers(org_id);
CREATE INDEX IF NOT EXISTS idx_concert_ticket_transfers_ticket ON concert_ticket_transfers(concert_ticket_id);
CREATE INDEX IF NOT EXISTS idx_concert_ticket_transfers_status ON concert_ticket_transfers(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_concert_ticket_transfers_idempotency ON concert_ticket_transfers(org_id, idempotency_key);

CREATE TABLE IF NOT EXISTS concert_ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  concert_ticket_id UUID NOT NULL REFERENCES concert_tickets(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  actor VARCHAR(256),
  actor_role VARCHAR(32),
  previous_state VARCHAR(32),
  new_state VARCHAR(32),
  details JSONB DEFAULT '{}',
  correlation_id VARCHAR(64),
  tx_hash VARCHAR(66),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concert_ticket_events_org ON concert_ticket_events(org_id);
CREATE INDEX IF NOT EXISTS idx_concert_ticket_events_ticket ON concert_ticket_events(concert_ticket_id);
CREATE INDEX IF NOT EXISTS idx_concert_ticket_events_type ON concert_ticket_events(event_type);
CREATE INDEX IF NOT EXISTS idx_concert_ticket_events_correlation ON concert_ticket_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_concert_ticket_events_created ON concert_ticket_events(created_at);

-- ============================================================================
-- Dashboard Metrics
-- ============================================================================

CREATE TABLE IF NOT EXISTS dashboard_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  metric_name VARCHAR(64) NOT NULL,
  metric_value NUMERIC(18,8) NOT NULL,
  metric_date VARCHAR(10) NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_metrics_org_metric_date ON dashboard_metrics(org_id, metric_name, metric_date);
