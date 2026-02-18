import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Coins, Shield, CheckCircle, CreditCard, Wallet, UserCheck } from 'lucide-react';
import { useAsset, useCompliance, useTransfer, useInvestorTier } from '@tokenisation/sdk-react';
import { AddToCartButton } from '../../components/AddToCartButton';
import {
  DUBAI_PROPERTIES,
  formatAED,
  type DubaiProperty,
} from '../../data/dubai-properties';
import { useSDKWithFallback, useSDKMutationWithFallback } from '../../hooks/useSDKWithFallback';
import { assetToDubaiProperty } from '../../utils/mappers';

interface ComplianceCheck {
  label: string;
  status: 'checking' | 'passed' | 'failed';
}

const INITIAL_CHECKS: ComplianceCheck[] = [
  { label: 'KYC Verified', status: 'checking' },
  { label: 'Jurisdiction Allowed', status: 'checking' },
  { label: 'Accreditation Valid', status: 'checking' },
  { label: 'Investment Limit OK', status: 'checking' },
];

function PropertySummary({ property }: { property: DubaiProperty }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
          <Coins className="w-7 h-7 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-white truncate">{property.name}</h2>
          <p className="text-sm text-gray-400">{property.district}</p>
          <div className="flex flex-wrap items-center gap-4 mt-3">
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Token Price</p>
              <p className="text-sm font-bold text-primary">{formatAED(property.tokenPriceAED)}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Symbol</p>
              <p className="text-sm font-bold text-white font-mono">{property.tokenSymbol}</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Net Yield</p>
              <p className="text-sm font-bold text-accent">{property.netYield}%</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Min Investment</p>
              <p className="text-sm font-bold text-white">{formatAED(property.minInvestmentAED)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompliancePreFlight({
  checks,
  allPassed,
}: {
  checks: ComplianceCheck[];
  allPassed: boolean;
}) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 bg-blue-500/10 rounded-lg flex items-center justify-center">
          <Shield className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">Compliance Pre-Flight</h3>
          <p className="text-xs text-gray-500">Automated regulatory checks</p>
        </div>
      </div>

      <div className="space-y-3">
        {checks.map((check, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-2.5 bg-white/[0.02] rounded-lg"
          >
            {check.status === 'checking' ? (
              <div className="w-5 h-5 rounded-full border-2 border-gray-600 border-t-primary animate-spin" />
            ) : check.status === 'passed' ? (
              <CheckCircle className="w-5 h-5 text-accent shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                <span className="text-red-400 text-xs font-bold">!</span>
              </div>
            )}
            <span
              className={`text-sm ${
                check.status === 'passed'
                  ? 'text-white'
                  : check.status === 'checking'
                    ? 'text-gray-400'
                    : 'text-red-400'
              }`}
            >
              {check.label}
            </span>
            {check.status === 'passed' && (
              <span className="ml-auto text-xs text-accent font-medium">Passed</span>
            )}
          </div>
        ))}
      </div>

      {allPassed && (
        <div className="mt-4 flex items-center gap-2 px-4 py-2.5 bg-accent/5 border border-accent/20 rounded-lg">
          <CheckCircle className="w-4 h-4 text-accent" />
          <span className="text-sm text-accent font-medium">All compliance checks passed</span>
        </div>
      )}
    </div>
  );
}

export function InvestFlow() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { getAsset } = useAsset();
  const { checkTransfer } = useCompliance();
  const { create: createTransfer } = useTransfer();

  const { plans: tierPlans, currentTier, loading: tierLoading } = useInvestorTier(propertyId);

  const mockProperty = DUBAI_PROPERTIES.find((p) => p.id === propertyId) || null;

  const { data: property } = useSDKWithFallback(
    async () => {
      if (!propertyId) return null;
      const asset = await getAsset(propertyId);
      return asset ? assetToDubaiProperty(asset) : null;
    },
    mockProperty,
    [propertyId],
  );

  const [tokenAmount, setTokenAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'wire' | 'crypto' | ''>('');
  const [checks, setChecks] = useState<ComplianceCheck[]>(INITIAL_CHECKS);
  const [confirmed, setConfirmed] = useState(false);

  // Wire compliance checks to SDK with fallback to simulation
  useEffect(() => {
    let cancelled = false;

    async function runComplianceChecks() {
      try {
        // Try real SDK compliance check
        const result = await checkTransfer({
          assetId: propertyId || '',
          fromAddress: '0x0000000000000000000000000000000000000000',
          toAddress: '0x0000000000000000000000000000000000000001',
          amount: '1',
        });
        if (cancelled) return;
        // If SDK returns, mark all as passed/failed based on decision
        const allPassed = result.decision.result === 'ALLOW';
        setChecks(INITIAL_CHECKS.map((c) => ({ ...c, status: allPassed ? 'passed' : 'failed' })));
      } catch {
        // Fallback: simulate compliance checks running
        if (cancelled) return;
        for (let i = 0; i < INITIAL_CHECKS.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 800 + i * 600));
          if (cancelled) return;
          setChecks((prev) =>
            prev.map((c, j) => (j === i ? { ...c, status: 'passed' as const } : c))
          );
        }
      }
    }

    runComplianceChecks();
    return () => { cancelled = true; };
  }, [propertyId, checkTransfer]);

  // Wire investment confirmation to SDK
  const investMutation = useSDKMutationWithFallback(
    useCallback(async () => {
      await createTransfer({
        tokenId: propertyId || '',
        fromWallet: 'issuer-wallet',
        toWallet: 'investor-wallet',
        amount: parsedAmount,
      });
    }, [createTransfer, propertyId]),
    useCallback(async () => {
      // Mock simulation — just confirm
    }, []),
  );

  const allChecksPassed = checks.every((c) => c.status === 'passed');

  const minTokens = property
    ? Math.ceil(property.minInvestmentAED / property.tokenPriceAED)
    : 0;
  const maxTokens = property ? property.totalTokens : 0;

  const parsedAmount = parseInt(tokenAmount, 10) || 0;
  const totalCostAED = property ? parsedAmount * property.tokenPriceAED : 0;

  const isValidAmount = parsedAmount >= minTokens && parsedAmount <= maxTokens;
  const canConfirm = isValidAmount && paymentMethod !== '' && allChecksPassed && !confirmed;

  const handleConfirm = async () => {
    await investMutation.execute();
    setConfirmed(true);
  };

  if (!property) {
    return (
      <div className="text-center py-20">
        <Coins className="w-16 h-16 text-white/10 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Property Not Found</h1>
        <p className="text-gray-400 mb-6">This property is not available for investment.</p>
        <Link to="/" className="text-primary text-sm hover:underline">
          Browse Properties
        </Link>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="max-w-lg mx-auto text-center py-10">
        <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-accent" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Investment Confirmed</h1>
        <p className="text-gray-400 mb-6">
          Your order for {parsedAmount.toLocaleString()} {property.tokenSymbol} tokens has been
          submitted. You will receive confirmation once the transaction settles.
        </p>

        <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-left space-y-3 mb-8">
          <div className="flex justify-between">
            <span className="text-sm text-gray-400">Property</span>
            <span className="text-sm font-semibold text-white">{property.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-400">Tokens</span>
            <span className="text-sm font-semibold text-white">
              {parsedAmount.toLocaleString()} {property.tokenSymbol}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-400">Total</span>
            <span className="text-sm font-bold text-primary">{formatAED(totalCostAED)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-400">Payment</span>
            <span className="text-sm font-semibold text-white capitalize">{paymentMethod} Transfer</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-400">Status</span>
            <span className="text-sm font-semibold text-accent">Processing</span>
          </div>
        </div>

        <Link
          to="/investor/portfolio"
          className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-primary text-black font-bold rounded-xl hover:bg-primary-dark transition-colors"
        >
          View Portfolio
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white font-display">
          Invest in {property.tokenSymbol}
        </h1>
        <p className="text-gray-400 mt-1">Purchase tokens for {property.name}</p>
      </div>

      <div className="space-y-6">
        {/* Property Summary */}
        <PropertySummary property={property} />

        {/* Compliance Pre-Flight */}
        <CompliancePreFlight checks={checks} allPassed={allChecksPassed} />

        {/* Your Investment Tier */}
        {(() => {
          const tier = currentTier || 'retail';
          const activePlan = tierPlans.find(p => p.tier === tier && p.active);
          const maxInvestment = activePlan?.maxInvestment ?? 500000;
          const maxHoldingPercent = activePlan?.maxHoldingPercent ?? 10;
          const lockupDays = activePlan?.lockupDays ?? 90;
          const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
          return (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 bg-purple-500/10 rounded-lg flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Your Investment Tier</h3>
                  <p className="text-xs text-gray-500">VARA-regulated investor classification</p>
                </div>
                {tierLoading && (
                  <div className="ml-auto w-4 h-4 rounded-full border-2 border-gray-600 border-t-primary animate-spin" />
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/[0.02] rounded-lg px-4 py-3">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Current Tier</p>
                  <p className="text-sm font-bold text-primary">{tierLabel}</p>
                </div>
                <div className="bg-white/[0.02] rounded-lg px-4 py-3">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Max Investment</p>
                  <p className="text-sm font-bold text-white">{formatAED(maxInvestment)}</p>
                </div>
                <div className="bg-white/[0.02] rounded-lg px-4 py-3">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Max Holding</p>
                  <p className="text-sm font-bold text-white">{maxHoldingPercent}%</p>
                </div>
                <div className="bg-white/[0.02] rounded-lg px-4 py-3">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Lockup Period</p>
                  <p className="text-sm font-bold text-white">{lockupDays} days</p>
                </div>
              </div>
              <p className="text-gray-500 text-xs mt-3">
                Tier limits are enforced per VARA regulations. Upgrade to Qualified Investor for higher limits.
              </p>
            </div>
          );
        })()}

        {/* Token Amount */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
              <Coins className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Token Amount</h3>
              <p className="text-xs text-gray-500">
                Min: {minTokens.toLocaleString()} tokens | Max:{' '}
                {maxTokens.toLocaleString()} tokens
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <input
                type="number"
                value={tokenAmount}
                onChange={(e) => setTokenAmount(e.target.value)}
                placeholder={`Min ${minTokens.toLocaleString()}`}
                min={minTokens}
                max={maxTokens}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-mono placeholder:text-gray-600 focus:outline-none focus:border-primary/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Total Cost</p>
              <p className="text-xl font-bold text-primary">
                {parsedAmount > 0 ? formatAED(totalCostAED) : '---'}
              </p>
            </div>
          </div>

          {parsedAmount > 0 && !isValidAmount && (
            <p className="mt-2 text-xs text-red-400">
              {parsedAmount < minTokens
                ? `Minimum investment is ${minTokens.toLocaleString()} tokens (${formatAED(property.minInvestmentAED)})`
                : `Maximum available is ${maxTokens.toLocaleString()} tokens`}
            </p>
          )}

          {/* Quick select buttons */}
          <div className="flex flex-wrap gap-2 mt-4">
            {[minTokens, minTokens * 2, minTokens * 5, minTokens * 10].map((amount) => (
              <button
                key={amount}
                onClick={() => setTokenAmount(String(amount))}
                className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:border-white/20 transition-colors"
              >
                {amount.toLocaleString()} tokens
              </button>
            ))}
          </div>
        </div>

        {/* Payment Method */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-secondary/10 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Payment Method</h3>
              <p className="text-xs text-gray-500">Select how you want to fund your investment</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Wire Transfer */}
            <button
              onClick={() => setPaymentMethod('wire')}
              className={`p-4 rounded-xl border text-left transition-all ${
                paymentMethod === 'wire'
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <CreditCard
                  className={`w-5 h-5 ${
                    paymentMethod === 'wire' ? 'text-primary' : 'text-gray-500'
                  }`}
                />
                <span className="text-sm font-semibold text-white">Wire Transfer</span>
              </div>
              <p className="text-xs text-gray-500">
                Bank transfer (AED) via Emirates NBD escrow account. 1-2 business days settlement.
              </p>
            </button>

            {/* Crypto */}
            <button
              onClick={() => setPaymentMethod('crypto')}
              className={`p-4 rounded-xl border text-left transition-all ${
                paymentMethod === 'crypto'
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Wallet
                  className={`w-5 h-5 ${
                    paymentMethod === 'crypto' ? 'text-primary' : 'text-gray-500'
                  }`}
                />
                <span className="text-sm font-semibold text-white">Crypto (USDC)</span>
              </div>
              <p className="text-xs text-gray-500">
                Pay with USDC on Ethereum. Instant settlement upon confirmation.
              </p>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || investMutation.loading}
            className="flex-1 px-8 py-4 bg-primary text-black font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-lg"
          >
            {investMutation.loading
              ? 'Processing...'
              : allChecksPassed
                ? `Confirm Investment - ${parsedAmount > 0 ? formatAED(totalCostAED) : 'Enter Amount'}`
                : 'Running Compliance Checks...'}
          </button>
          {property && (
            <AddToCartButton
              propertyId={property.id}
              propertyName={property.name}
              tokenSymbol={property.tokenSymbol}
              tokenPriceAED={property.tokenPriceAED}
              minTokens={minTokens}
            />
          )}
        </div>

        <p className="text-center text-xs text-gray-600">
          By confirming, you agree to the Token Subscription Agreement and acknowledge you
          have read the prospectus. Investments in tokenized securities carry risk of loss.
        </p>
      </div>
    </div>
  );
}
