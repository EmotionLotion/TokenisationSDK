import { CheckCircle } from 'lucide-react';

interface ConfigureComplianceProps {
  kycProvider: string;
  amlRules: string[];
  accreditation: string;
  holdingPeriod: number;
  maxInvestors: number;
  jurisdictions: string[];
}

export function ConfigureCompliance({
  kycProvider,
  amlRules,
  accreditation,
  holdingPeriod,
  maxInvestors,
  jurisdictions,
}: ConfigureComplianceProps) {
  const items = [
    { label: 'KYC Provider', value: kycProvider },
    { label: 'AML Rules', value: amlRules.join(', ') },
    { label: 'Accreditation', value: accreditation },
    { label: 'Holding Period', value: `${holdingPeriod} days` },
    { label: 'Max Investors', value: maxInvestors.toLocaleString() },
    { label: 'Jurisdictions', value: jurisdictions.join(', ') },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Compliance Configuration</h3>
      <div className="space-y-3">
        {items.map(({ label, value }) => (
          <div key={label} className="flex items-start gap-3">
            <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-300">{label}</p>
              <p className="text-sm text-amber-400/80">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
