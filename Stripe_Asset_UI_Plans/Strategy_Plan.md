# Strategy Plan: Stripe-like Asset UI Kit

## 1. Vision
The goal is to create a **"Stripe Elements for Assets"** library. Just as Stripe Elements abstracts away the complexity of credit card processing (validation, formatting, PCI compliance), this UI Kit abstracts away the complexity of **tokenized asset interactions** (KYC, wallet signatures, compliance checks, data visualization).

The UI should not "look like crypto" or be specific to one vertical (like Real Estate). It must be **generic** enough to handle:
- Real Estate (Fractional Ownership)
- Carbon Credits (Retirement/Offset)
- Event Tickets (Access Control)
- Company Equity (Cap Table)
- Loyalty Points (Redemption)

## 2. Core Concepts (from StripeSDKPlan)

### A. Asset = Template + Instance
The UI must dynamicall adapt based on the **Asset Template**.
- A "Carbon Credit" template might show a "Retire" button.
- A "Real Estate" template might show a "Distribute Rent" button.
- A "Ticket" template might show a "Show QR Code" button.

**Key Insight:** The UI components should read the `asset.template` standard and render the appropriate "Actions" and "Metadata" fields automatically, rather than being hardcoded for every new asset type.

### B. The "Elements" Philosophy
Components should be:
1.  **Drop-in:** `<AssetCard assetId="123" />` works instantly.
2.  **Themable:** Support CSS variables / Tailwind config to match client branding.
3.  **Secure:** Handle wallet connections and signing internally or via a provider context.
4.  **Backend-agnostic (mostly):** Rely on the standard SDK interfaces (`Assets`, `Parties`, `Transactions`).

## 3. Component Library Architecture

### A. The "Smart" Components (Connected)
These components connect directly to the `TokenisationSDK` or API.

1.  **`AssetCard` / `AssetRow`**: Displays asset metadata, current price, and status.
2.  **`InvestmentFlow`**: A multi-step modal/wizard for purchasing an asset.
    *   Step 1: Quantity Selection
    *   Step 2: KYC Check (if policy requires)
    *   Step 3: Accreditation Check (if policy requires)
    *   Step 4: Payment / Wallet Signature
    *   Step 5: Settlement Receipt
3.  **`KYCModal`**: (Already partially exists) Handles identity verification.
4.  **`PortfolioView`**: Shows all assets held by the connected user.
5.  **`ActionStation`**: A generic component that renders available actions for an asset (Mint, Transfer, Retire, Redeem) based on the user's role and asset capabilities.

### B. The "Dumb" Components (UI only)
High-polish, glassmorphism/modern styled atoms.
- `StatusBadge` (Active, Pending, Frozen)
- `TokenAmount` (Formats decimals, adds symbol)
- `AddressAvatar` (Blockies/Jdenticon with copy-to-clipboard)

## 4. The "Action Station" Pattern
To achieve the "Generic" goal, we will implement an **Action Registry**.
Instead of coding a specific button for "Pay Dividend", we code a generic `PayoutAction`.
The Asset Template defines which actions are available.

Example Template Config (JSON):
```json
{
  "actions": ["transfer", "retire", "download_certificate"]
}
```

The UI sees this list and renders the corresponding "Elements" from the registry.

## 5. Developer Experience (DX)
The user (developer) should be able to build a marketplace in 10 lines of code:

```tsx
import { TokenisationProvider, AssetGrid } from '@tokenisation/ui-kit';

export default function Marketplace() {
  return (
    <TokenisationProvider apiKey="...">
      <h1>Featured Assets</h1>
      <AssetGrid filter={{ type: 'real_estate' }} />
    </TokenisationProvider>
  );
}
```

## 6. Next Steps
The Implementation Plan will detail the specific coding tasks to restructure the current `ui-kit` into this new architecture, effectively "refactoring" the specific demos into generic implementations.
