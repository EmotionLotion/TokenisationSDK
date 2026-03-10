import type { PackManifest } from '@tokenisation/core';

export const manifest: PackManifest = {
  id: 'travel',
  version: '1.0.0',
  name: 'Travel & Hospitality',
  description: 'Airline tickets, hotel reservations, car rentals, concert tickets with PSS connectors and flight oracle',

  assetTypes: [
    'AIRLINE_TICKET',
    'HOTEL_RESERVATION',
    'CAR_RENTAL',
    'CONCERT_TICKET',
  ],

  rightTypes: ['ACCESS'],

  chains: [8453, 137, 1], // Base, Polygon, Ethereum

  requires: [],

  extensions: {
    packs: [
      'AirlineTicketEngine',
      'HotelReservationEngine',
      'CarRentalEngine',
      'ConcertTicketEngine',
    ],
    policies: [],
    workflows: [
      'tokenize-airline-ticket',
      'tokenize-hotel-reservation',
      'tokenize-car-rental',
      'tokenize-concert-ticket',
    ],
    serverPlugins: [],
    contracts: [
      'AirlineTicketNFT.sol',
      'HotelReservationNFT.sol',
      'CarRentalNFT.sol',
      'ConcertTicketNFT.sol',
    ],
    adapters: [],
    uiComponents: [],
  },

  tags: ['travel', 'hospitality', 'airline', 'hotel', 'car-rental', 'concert', 'tickets'],
};
