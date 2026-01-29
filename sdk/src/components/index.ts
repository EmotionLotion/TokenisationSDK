/**
 * Tokenisation SDK - Pre-built UI Components
 *
 * Drop-in React components for tokenization apps.
 * Similar to Stripe Elements - just import and use.
 *
 * @example
 * ```tsx
 * import { TokenizeButton, AssetCard, BalanceDisplay } from '@tokenisation/sdk/components';
 *
 * function App() {
 *   return (
 *     <div>
 *       <TokenizeButton onSuccess={(asset) => console.log(asset)} />
 *       <AssetCard asset={myAsset} />
 *       <BalanceDisplay assetId={assetId} partyId={partyId} />
 *     </div>
 *   );
 * }
 * ```
 */

export { TokenizeButton } from './TokenizeButton.js';
export { AssetCard } from './AssetCard.js';
export { PartyBadge } from './PartyBadge.js';
export { BalanceDisplay } from './BalanceDisplay.js';
export { TransferForm } from './TransferForm.js';
export { LifecycleStatus } from './LifecycleStatus.js';
export { KYCBadge } from './KYCBadge.js';
export { AssetWizard } from './AssetWizard.js';

// Vertical-Specific Components
// Real Estate
export { PropertyMap } from './verticals/real_estate/PropertyMap.js';
export { NavHistoryChart } from './verticals/real_estate/NavHistoryChart.js';

// Airline
export { FlightSelector } from './verticals/airline/FlightSelector.js';
export { BoardingPass } from './verticals/airline/BoardingPass.js';

// Concert
export { SeatSelectionMap } from './verticals/concert/SeatSelectionMap.js';

// Car Rental
export { RentalCalendar } from './verticals/car_rental/RentalCalendar.js';

// Hotel
export { RoomSelector } from './verticals/hotel/RoomSelector.js';

// Theme configuration
export { defaultTheme, type TokenisationTheme } from './theme.js';
