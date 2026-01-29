/**
 * Chainlink Starter Kit — Main Runner
 *
 * Runs all 5 use-case demos in sequence:
 *   1. Real Estate    — Chainlink price feeds for property NAV
 *   2. Airline Tickets — Chainlink Automation for flight-event upkeeps
 *   3. Car Rental      — CCIP cross-chain deposit settlement
 *   4. Hotel Tickets   — Compliance-gated mint with oracle price checks
 *   5. Concert Tickets — Proof of Reserve for mint gating
 *
 * Run with: npm start
 */

import { realEstateDemo } from './real-estate.js';
import { airlineTicketsDemo } from './airline-tickets.js';
import { carRentalDemo } from './car-rental.js';
import { hotelTicketsDemo } from './hotel-tickets.js';
import { concertTicketsDemo } from './concert-tickets.js';

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║                    🔗 CHAINLINK STARTER KIT                                  ║
║                                                                              ║
║    5 use-case demos powered by Chainlink + Tokenisation SDK                 ║
║                                                                              ║
║    1. Real Estate    — Price Feeds → NAV                                    ║
║    2. Airline Tickets — Automation / Keepers                                ║
║    3. Car Rental      — CCIP Cross-Chain Settlement                         ║
║    4. Hotel Tickets   — Compliance-Gated Mint                               ║
║    5. Concert Tickets — Proof of Reserve                                    ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);

  await realEstateDemo();
  await airlineTicketsDemo();
  await carRentalDemo();
  await hotelTicketsDemo();
  await concertTicketsDemo();

  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║                    ✅ ALL 5 DEMOS COMPLETED                                  ║
║                                                                              ║
║    Next: See docs/recipes/ for detailed guides on each use case             ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
  `);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
