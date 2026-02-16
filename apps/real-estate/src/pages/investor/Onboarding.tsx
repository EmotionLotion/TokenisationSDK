import { useState, useCallback } from 'react';
import { UserCheck, Upload, Shield, CheckCircle } from 'lucide-react';
import { useKYC, useInvestor } from '@tokenisation/sdk-react';
import { ComplianceStepper } from '@tokenisation/ui-kit';
import { useSDKMutationWithFallback } from '../../hooks/useSDKWithFallback';

type Step = 1 | 2 | 3 | 4;

const JURISDICTIONS = [
  'United Arab Emirates',
  'Saudi Arabia',
  'Bahrain',
  'Qatar',
  'Kuwait',
  'Oman',
  'United Kingdom',
  'Singapore',
  'Hong Kong',
  'Switzerland',
  'United States (Accredited Only)',
  'Other',
];

const ACCREDITATION_TYPES = [
  {
    value: 'qualified',
    label: 'Qualified Investor',
    description: 'Net assets of AED 4M+ or annual income of AED 1M+ (SCA definition)',
  },
  {
    value: 'professional',
    label: 'Professional Investor',
    description: 'Licensed financial institution, government body, or sovereign wealth fund',
  },
  {
    value: 'institutional',
    label: 'Institutional Investor',
    description: 'Pension fund, endowment, family office with AED 50M+ AUM',
  },
];

const NET_WORTH_RANGES = [
  'AED 1M - AED 5M',
  'AED 5M - AED 10M',
  'AED 10M - AED 25M',
  'AED 25M - AED 50M',
  'AED 50M - AED 100M',
  'AED 100M+',
];

function getStepperSteps(currentStep: Step) {
  const labels = ['Personal Info', 'Identity Verification', 'Accreditation'];
  return labels.map((label, i) => ({
    label,
    status: currentStep > i + 1 || currentStep === 4
      ? 'complete' as const
      : currentStep === i + 1
        ? 'active' as const
        : 'pending' as const,
  }));
}

function PersonalInfoStep({
  onNext,
}: {
  onNext: (data: { name: string; email: string; jurisdiction: string }) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [jurisdiction, setJurisdiction] = useState('');

  const isValid = name.trim().length > 0 && email.includes('@') && jurisdiction !== '';

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
          <UserCheck className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Personal Information</h2>
          <p className="text-sm text-gray-400">Basic details for your investor profile</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Full Name */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Full Legal Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your full name"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="investor@example.com"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>

        {/* Jurisdiction */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Jurisdiction</label>
          <select
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors appearance-none cursor-pointer"
          >
            <option value="" className="bg-background text-gray-400">
              Select your jurisdiction
            </option>
            {JURISDICTIONS.map((j) => (
              <option key={j} value={j} className="bg-background text-white">
                {j}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={() => onNext({ name, email, jurisdiction })}
        disabled={!isValid}
        className="mt-8 w-full px-6 py-3 bg-primary text-black font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Continue to Verification
      </button>
    </div>
  );
}

function IdentityVerificationStep({
  onNext,
  onInitiateKYC,
  kycLoading,
}: {
  onNext: () => void;
  onInitiateKYC: () => void;
  kycLoading: boolean;
}) {
  const [idUploaded, setIdUploaded] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);

  const handleIdUpload = () => {
    setIdUploaded(true);
    onInitiateKYC();
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
          <Upload className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Identity Verification</h2>
          <p className="text-sm text-gray-400">KYC/AML compliance documentation</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* ID Upload */}
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
            idUploaded
              ? 'border-accent/40 bg-accent/5'
              : 'border-white/10 hover:border-primary/30 bg-white/[0.02]'
          }`}
          onClick={handleIdUpload}
        >
          {idUploaded ? (
            <div className="flex items-center justify-center gap-2">
              <CheckCircle className="w-5 h-5 text-accent" />
              <span className="text-accent font-medium">passport_scan.pdf uploaded</span>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-sm text-gray-400 mb-1">
                Upload Government-Issued ID
              </p>
              <p className="text-xs text-gray-600">
                Passport, Emirates ID, or National ID (click to simulate)
              </p>
            </>
          )}
        </div>

        {/* Face Verification */}
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
            faceVerified
              ? 'border-accent/40 bg-accent/5'
              : 'border-white/10 hover:border-primary/30 bg-white/[0.02]'
          }`}
          onClick={() => setFaceVerified(true)}
        >
          {faceVerified ? (
            <div className="flex items-center justify-center gap-2">
              <CheckCircle className="w-5 h-5 text-accent" />
              <span className="text-accent font-medium">Face verification complete</span>
            </div>
          ) : (
            <>
              <UserCheck className="w-8 h-8 text-gray-500 mx-auto mb-2" />
              <p className="text-sm text-gray-400 mb-1">
                Face Verification
              </p>
              <p className="text-xs text-gray-600">
                Liveness check with biometric matching (click to simulate)
              </p>
            </>
          )}
        </div>
      </div>

      {/* AML Note */}
      <div className="mt-5 flex items-start gap-2 px-4 py-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
        <Shield className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-300 leading-relaxed">
          Your identity is verified through our AML/CFT screening partner. PEP and sanctions
          screening is performed automatically against FATF and UAE Central Bank watchlists.
        </p>
      </div>

      <button
        onClick={onNext}
        disabled={!idUploaded || !faceVerified || kycLoading}
        className="mt-8 w-full px-6 py-3 bg-primary text-black font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {kycLoading ? 'Verifying...' : 'Continue to Accreditation'}
      </button>
    </div>
  );
}

function AccreditationStep({ onNext }: { onNext: () => void }) {
  const [accreditationType, setAccreditationType] = useState('');
  const [netWorth, setNetWorth] = useState('');

  const isValid = accreditationType !== '' && netWorth !== '';

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Investor Accreditation</h2>
          <p className="text-sm text-gray-400">Verify your qualified investor status</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Accreditation Type */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-3">
            Accreditation Type
          </label>
          <div className="space-y-3">
            {ACCREDITATION_TYPES.map((type) => (
              <div
                key={type.value}
                onClick={() => setAccreditationType(type.value)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  accreditationType === type.value
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      accreditationType === type.value
                        ? 'border-primary'
                        : 'border-gray-600'
                    }`}
                  >
                    {accreditationType === type.value && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="text-sm font-semibold text-white">{type.label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1.5 ml-7">{type.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Net Worth */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">
            Net Worth Range
          </label>
          <select
            value={netWorth}
            onChange={(e) => setNetWorth(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors appearance-none cursor-pointer"
          >
            <option value="" className="bg-background text-gray-400">
              Select net worth range
            </option>
            {NET_WORTH_RANGES.map((r) => (
              <option key={r} value={r} className="bg-background text-white">
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        onClick={onNext}
        disabled={!isValid}
        className="mt-8 w-full px-6 py-3 bg-primary text-black font-bold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Complete Verification
      </button>
    </div>
  );
}

function ApprovalScreen() {
  return (
    <div className="bg-white/5 border border-accent/20 rounded-2xl p-10 max-w-lg mx-auto text-center">
      <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="w-10 h-10 text-accent" />
      </div>

      <h2 className="text-2xl font-bold text-white mb-2">KYC Approved</h2>
      <p className="text-gray-400 mb-8 max-w-sm mx-auto">
        Your identity has been verified and your accreditation status has been confirmed.
        You are now eligible to invest in tokenized real estate offerings.
      </p>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-8 text-left space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">KYC Status</span>
          <span className="text-sm font-semibold text-accent">Approved</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">AML Screening</span>
          <span className="text-sm font-semibold text-accent">Clear</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Accreditation</span>
          <span className="text-sm font-semibold text-accent">Verified</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Investor Tier</span>
          <span className="text-sm font-semibold text-white">Qualified Investor</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">Valid Until</span>
          <span className="text-sm font-semibold text-white">2026-02-16</span>
        </div>
      </div>

      <a
        href="/"
        className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-primary text-black font-bold rounded-xl hover:bg-primary-dark transition-colors"
      >
        Browse Properties
      </a>
    </div>
  );
}

export function Onboarding() {
  const [step, setStep] = useState<Step>(1);
  const { initiateKYC } = useKYC();
  const { create: createInvestor } = useInvestor();

  // Wire investor creation to SDK with fallback
  const createInvestorMutation = useSDKMutationWithFallback(
    useCallback(
      async (data: { name: string; email: string; jurisdiction: string }) => {
        await createInvestor({
          email: data.email,
          name: data.name,
          jurisdiction: data.jurisdiction,
          type: 'individual',
        });
      },
      [createInvestor],
    ),
    useCallback(async () => {
      // Mock simulation — just proceed
    }, []),
  );

  // Wire KYC initiation to SDK with fallback
  const kycMutation = useSDKMutationWithFallback(
    useCallback(async () => {
      await initiateKYC('standard');
    }, [initiateKYC]),
    useCallback(async () => {
      // Mock simulation — just proceed
    }, []),
  );

  const handlePersonalInfoNext = async (data: { name: string; email: string; jurisdiction: string }) => {
    await createInvestorMutation.execute(data);
    setStep(2);
  };

  const handleInitiateKYC = () => {
    kycMutation.execute();
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-white font-display">
          Investor Onboarding
        </h1>
        <p className="text-gray-400 mt-2">
          Complete KYC/AML verification to start investing
        </p>
      </div>

      <div className="mb-10">
        <ComplianceStepper
          steps={getStepperSteps(step)}
          activeStep={step - 1}
        />
      </div>

      {step === 1 && <PersonalInfoStep onNext={handlePersonalInfoNext} />}
      {step === 2 && (
        <IdentityVerificationStep
          onNext={() => setStep(3)}
          onInitiateKYC={handleInitiateKYC}
          kycLoading={kycMutation.loading}
        />
      )}
      {step === 3 && <AccreditationStep onNext={() => setStep(4)} />}
      {step === 4 && <ApprovalScreen />}
    </div>
  );
}
