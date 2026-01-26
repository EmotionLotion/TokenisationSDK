# Implementation Plan: Generic "Stripe-like" UI Kit

## Phase 1: Foundation Refactoring ✅ COMPLETED
Goal: Decouple the `ui-kit` from specific demos (Fly+, Comet) and establish the Generic Asset context.

- [x] **Create `AssetContext`**
    - [x] Create `AssetProvider` that fetches asset metadata by ID.
    - [x] Define `AssetObject` interface fitting the "Template + Instance" model.
    - [x] Implementation: `ui-kit/src/generic/context/AssetContext.tsx`
- [x] **Define Template Schemas**
    - [x] Create `src/generic/templates/registry.ts`.
    - [x] Define schemas for: `RealEstate`, `CarbonCredit`, `Ticket`, `Loyalty`, `Royalty`, `Commodity`, `Equity`.
    - [x] Define strictly typed `ActionType` (mint, transfer, retire, etc.).
    - [x] Implementation: `ui-kit/src/generic/types.ts` and `ui-kit/src/generic/templates/registry.ts`

## Phase 2: Core "Smart" Components ✅ COMPLETED
Goal: Build the "Stripe Elements" that developers will drop into their apps.

- [x] **`GenericAssetCard`**
    - [x] Props: `assetId` (string), `variant` (compact | detailed | mini).
    - [x] Functionality: Auto-fetch metadata. Render Image, Title, Tags based on schema.
    - [x] Status Badge integration.
    - [x] Template-aware rendering (different fields for different asset types).
    - [x] Implementation: `ui-kit/src/generic/components/AssetCard.tsx`
- [x] **`AssetGrid`**
    - [x] Accepts a list of IDs or a filter query.
    - [x] Renders a responsive grid of `AssetCard`s.
    - [x] Built-in search and filtering controls.
    - [x] View toggle (grid/list).
    - [x] Implementation: `ui-kit/src/generic/components/AssetGrid.tsx`
- [x] **`ActionStation` (The heart of interaction)**
    - [x] A dynamic button group or dropdown.
    - [x] Logic: Check `user.permissions` + `asset.policy` -> Render enabled buttons.
    - [x] Three variants: buttons, dropdown, full panel.
    - [x] Implementation: `ui-kit/src/generic/components/ActionStation.tsx`

## Phase 3: The "Checkout" Experience (InvestmentFlow) ✅ COMPLETED
Goal: A production-grade wizard for acquiring assets.

- [x] **`InvestmentFlow` Modal**
    - [x] **Step 1: Quantity**. Input with max validation (based on supply/balance).
    - [x] **Step 2: Compliance**. Embed `KYCModal` here if user status is !verified.
    - [x] **Step 3: Payment**. Payment method selection (crypto/card).
    - [x] **Step 4: Signing**. Wallet signature confirmation.
    - [x] **Step 5: Success**. Confirmation + "View Asset" link.
    - [x] Implementation: `ui-kit/src/generic/components/InvestmentFlow.tsx`

## Phase 4: Atom Components ✅ COMPLETED
Goal: High-polish, reusable UI primitives.

- [x] **`StatusBadge`**
    - [x] Visual indicator for asset/identity status.
    - [x] Auto-variant detection from status string.
    - [x] ComplianceBadge variant.
    - [x] Implementation: `ui-kit/src/generic/atoms/StatusBadge.tsx`
- [x] **`TokenAmount`**
    - [x] Formatted display of token amounts.
    - [x] PriceDisplay variant with change indicator.
    - [x] BalanceDisplay variant with label.
    - [x] Implementation: `ui-kit/src/generic/atoms/TokenAmount.tsx`
- [x] **`AddressAvatar`**
    - [x] Visual address representation with generated colors.
    - [x] Copy to clipboard functionality.
    - [x] Explorer link support.
    - [x] ContractAddress variant.
    - [x] Implementation: `ui-kit/src/generic/atoms/AddressAvatar.tsx`

## Phase 5: Developer Documentation (The "Stripe Docs") ✅ COMPLETED
Goal: Make it usable.

- [x] **Showcase Component**
    - [x] Create a `Showcase.tsx` that lists all components.
    - [x] Show "Real Estate" vs "Carbon" using the *same* component code, just different data.
    - [x] Code examples for each component.
    - [x] Implementation: `ui-kit/src/generic/components/Showcase.tsx`

## Files Created

### Types & Templates
- `ui-kit/src/generic/types.ts` - Core type definitions
- `ui-kit/src/generic/templates/registry.ts` - Template registry with 7 asset types

### Context
- `ui-kit/src/generic/context/AssetContext.tsx` - Asset state management

### Atoms
- `ui-kit/src/generic/atoms/StatusBadge.tsx` - Status indicators
- `ui-kit/src/generic/atoms/TokenAmount.tsx` - Amount formatting
- `ui-kit/src/generic/atoms/AddressAvatar.tsx` - Address display

### Components
- `ui-kit/src/generic/components/AssetCard.tsx` - Generic asset card
- `ui-kit/src/generic/components/AssetGrid.tsx` - Asset grid with filtering
- `ui-kit/src/generic/components/ActionStation.tsx` - Dynamic action buttons
- `ui-kit/src/generic/components/InvestmentFlow.tsx` - Investment wizard
- `ui-kit/src/generic/components/Showcase.tsx` - Component documentation

### Exports
- `ui-kit/src/generic/index.ts` - Module exports
- `ui-kit/src/index.ts` - Updated main exports

## Usage Example

```tsx
import {
  TokenisationProvider,
  AssetProvider,
  AssetGrid,
  InvestmentFlow,
} from '@tokenisation/ui-kit';

export default function Marketplace() {
  const [selectedAsset, setSelectedAsset] = useState(null);

  return (
    <TokenisationProvider client={client}>
      <AssetProvider autoFetch>
        <h1>Featured Assets</h1>
        <AssetGrid
          filter={{ type: 'real_estate' }}
          onAssetAction={setSelectedAsset}
        />
        {selectedAsset && (
          <InvestmentFlow
            assetId={selectedAsset.id}
            isOpen={!!selectedAsset}
            onClose={() => setSelectedAsset(null)}
          />
        )}
      </AssetProvider>
    </TokenisationProvider>
  );
}
```

## Reference Material & Design Inspiration
*Added based on industry best practices research.*

### UI/UX Patterns Implemented
1. **Stripe Elements "Iframe-like" Security**: Used `AssetContext` to isolate sensitive actions.
2. **"One-Click" Investor Onboarding**: Unified KYC + Wallet flow in InvestmentFlow.
3. **Dynamic "Action Station"**: Dashboard lists *Capabilities* not just assets.
4. **"Glass" Transparency**: Contract addresses visible with explorer links.

### Specific "Stripe-like" Component Specs Implemented
- **`<GenericAssetCard />`**: Feels like Stripe's Card Element - auto-adapts to data.
- **`<InvestmentFlow />`**: Like Stripe Checkout - multi-step wizard.
- **`<ActionStation />`**: Dynamic actions based on template.
- **`<ComplianceBadge />`**: Green check for compliant, red for action required.
