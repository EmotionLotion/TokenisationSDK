# Frontend SDK Guide: Building Tokenization UIs

**Modelled after:** Coinbase CDP Frontend SDK / Stripe Elements
**Goal:** Empower developers to build compliance-ready asset dashboards in minutes, not months.

---

## 🚀 Quick Start

The Tokenisation SDK includes a library of **pre-built React components** (Stripe-like Elements) that handle the complexity of asset creation, compliance checks, and wallet interactions.

### 1. Install

```bash
npm install @tokenisation/sdk react react-dom
```

### 2. Configure

Import the SDK and setup your provider. For frontend apps, we recommend proxying requests through your backend or using the `ApiClient` pattern.

```tsx
import { TokenisationSDK } from '@tokenisation/sdk';

// Initialize SDK (or use ApiClient for public apps)
const sdk = new TokenisationSDK({
  apiKey: process.env.NEXT_PUBLIC_API_KEY, // Use restricted public keys
  environment: 'testnet'
});
```

---

## 🧩 Components

Move faster by dropping in ready-made UI blocks. All components are fully themed and accessible.

### `<AssetWizard />`
The functionality of a full "Create Asset" page in a single component. Handles:
*   ✅ Asset Type Selection (Real Estate, Access, etc.)
*   ✅ Jurisdiction Gating (UAE, US, UK)
*   ✅ Metadata Validation
*   ✅ Smart Contract Deployment

```tsx
import { useState } from 'react';
import { AssetWizard, Asset } from '@tokenisation/sdk/components';

export function CreateAssetPage() {
  const [showWizard, setShowWizard] = useState(false);

  return (
    <div>
      <button onClick={() => setShowWizard(true)}>
        New Asset
      </button>

      {showWizard && (
        <AssetWizard
          sdk={sdk}
          issuerId="org_123"
          onSuccess={(asset: Asset) => {
            console.log('Asset deployed:', asset.id);
            setShowWizard(false);
          }}
          onClose={() => setShowWizard(false)}
        />
      )}
    </div>
  );
}
```

### `<TokenizeButton />`
A "Stripe Pay" style button that triggers the tokenization flow for an existing off-chain item.

```tsx
import { TokenizeButton } from '@tokenisation/sdk/components';

export function PropertyCard({ property }) {
  return (
    <div className="card">
      <h3>{property.address}</h3>
      <TokenizeButton
        sdk={sdk}
        issuerId="org_123"
        onSuccess={(asset) => alert(`Tokenized! ID: ${asset.id}`)}
      />
    </div>
  );
}
```

### `<TransferForm />`
A compliance-aware transfer CLI/UI. It checks:
1.  Sender Balance
2.  Recipient KYC Status
3.  Jurisdiction Rules
4.  Gas Estimation

```tsx
import { TransferForm } from '@tokenisation/sdk/components';

<TransferForm
  sdk={sdk}
  assetId={asset.id}
  senderId={user.id}
  onTransfer={(tx) => console.log('Tx Hash:', tx.hash)}
/>
```

---

## 🧪 Use Case Patterns

Here is how you combine these components to build specific vertical apps.

### 1. Real Estate (Chainlink NAV)
Use the generic `<AssetWizard />` to create the asset, then wire the price feed in your `onSuccess` handler.

```tsx
<AssetWizard
  defaultRightType="OWNERSHIP"
  onSuccess={async (asset) => {
    // 1. Asset created via UI
    console.log('Property created:', asset.name);

    // 2. Wire Chainlink Feed (Backend API call)
    await fetch('/api/wire-feed', {
      method: 'POST',
      body: JSON.stringify({
        assetId: asset.id,
        feed: 'ETH/USD' // Mapped from UI selection
      })
    });
  }}
/>
```

### 2. Concert Tickets (Proof of Reserve)
Use `<TokenizeButton />` to trigger ticket issuance, but gate availability with a custom PoR check.

```tsx
// Custom Component: VenueCapacity
import { usePoR } from '@tokenisation/sdk/react';

function BuyTicketButton({ eventId }) {
  const { isFull, capacity } = usePoR(eventId);

  if (isFull) return <button disabled>Sold Out (Verified on-chain)</button>;

  return (
    <TokenizeButton
       buttonText="Mint Ticket"
       onSuccess={() => alert("Ticket Minted!")}
    />
  );
}
```

---

## 🎨 Customization

Match your brand perfectly with the `theme` prop.

```tsx
const myTheme = {
  colors: {
    primary: '#0052FF', // Coinbase Blue
    background: '#FFFFFF',
    text: '#0A0B0D',
  },
  borderRadius: {
    md: '12px',
  }
};

<AssetWizard theme={myTheme} ... />
```

---

## 🏗 Architecture Note

For production apps, we recommend the **Backend-for-Frontend (BFF)** pattern:
1.  **Frontend:** Uses these components.
2.  **SDK Instance:** Point to your own API (`https://api.your-platform.com`).
3.  **Backend:** Runs the heavy `TokenisationSDK` with private keys and signs transactions securely.


---

## 🏢 Vertical-Specific Components

We have included specialized UI components for common tokenization verticals.

### Real Estate
Visualize property location and performance.

```tsx
import { PropertyMap, NavHistoryChart } from '@tokenisation/sdk/components';

function PropertyDashboard({ asset }) {
  return (
    <div className="grid">
      <PropertyMap 
        address="Dubai Marina Tower, Unit 1501" 
        latitude={25.0763} 
        longitude={55.1435} 
      />
      <NavHistoryChart 
        data={[
            { date: 'Jan', value: 2450000 },
            { date: 'Feb', value: 2480000 },
            { date: 'Mar', value: 2500000 }
        ]} 
      />
    </div>
  );
}
```

### Concert Tickets
Allow users to pick seats from a visual map.

```tsx
import { SeatSelectionMap } from '@tokenisation/sdk/components';

// In your purchase flow
<SeatSelectionMap 
  rows={5} 
  cols={8} 
  blockedSeats={['A3', 'A4']} 
  onSelect={(seatId) => console.log('Selected:', seatId)} 
/>
```

### Airline Travel
Flight selection and digital boarding passes.

```tsx
import { FlightSelector, BoardingPass } from '@tokenisation/sdk/components';

// Booking Flow
<FlightSelector onSelect={(flight) => setBooking(flight)} />

// Wallet View
<BoardingPass 
  flight={myFlight} 
  passengerName="Ahmed Al Maktoum" 
  seat="12A" 
/>
```

### Car Rental
Date selection for booking duration.

```tsx
import { RentalCalendar } from '@tokenisation/sdk/components';

<RentalCalendar 
  onSelect={({ start, end }) => calculatePrice(start, end)} 
/>
```

### Hotel Reservation
Visual selection of room types and amenities.

```tsx
import { RoomSelector } from '@tokenisation/sdk/components';

<RoomSelector 
  onSelect={(room) => console.log('Booked:', room.name)} 
/>
```
