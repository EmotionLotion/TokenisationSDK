import { CheckCircle, XCircle, Search, Shield } from 'lucide-react';
import { CCIDVertical, type VerticalClearance, type CCIDEligibilityResult } from '../../core/store';
import { useState } from 'react';

interface VerticalClearanceMatrixProps {
  wallet: string;
  clearances: VerticalClearance[];
  onCheckEligibility: (vertical: CCIDVertical) => void;
  onClearVertical: (vertical: CCIDVertical) => void;
  eligibilityResults?: Map<CCIDVertical, CCIDEligibilityResult>;
}

const VERTICAL_LABELS: Record<CCIDVertical, { label: string; color: string; bgColor: string }> = {
  [CCIDVertical.REAL_ESTATE]: { label: 'Real Estate', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  [CCIDVertical.AIRLINE]: { label: 'Airline', color: 'text-sky-400', bgColor: 'bg-sky-500/10' },
  [CCIDVertical.CAR_RENTAL]: { label: 'Car Rental', color: 'text-orange-400', bgColor: 'bg-orange-500/10' },
  [CCIDVertical.HOTEL]: { label: 'Hotel', color: 'text-violet-400', bgColor: 'bg-violet-500/10' },
  [CCIDVertical.CONCERT]: { label: 'Concert', color: 'text-pink-400', bgColor: 'bg-pink-500/10' },
};

export function VerticalClearanceMatrix({
  wallet,
  clearances,
  onCheckEligibility,
  onClearVertical,
  eligibilityResults,
}: VerticalClearanceMatrixProps) {
  const [checking, setChecking] = useState<CCIDVertical | null>(null);

  const handleCheck = (vertical: CCIDVertical) => {
    setChecking(vertical);
    onCheckEligibility(vertical);
    setTimeout(() => setChecking(null), 500);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-[#F8B032]" />
        <span className="text-sm font-medium text-white">Cross-Vertical Clearance Matrix</span>
        <span className="text-xs text-gray-500 font-mono ml-auto">{wallet.slice(0, 10)}...</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {Object.values(CCIDVertical).map(vertical => {
          const clearance = clearances.find(c => c.vertical === vertical);
          const meta = VERTICAL_LABELS[vertical];
          const result = eligibilityResults?.get(vertical);
          const isCleared = clearance?.cleared;

          return (
            <div
              key={vertical}
              className={`rounded-xl border p-4 transition-all ${
                isCleared
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs font-bold ${meta.color}`}>{meta.label}</span>
                {isCleared ? (
                  <CheckCircle className="w-4 h-4 text-green-400 ml-auto" />
                ) : (
                  <XCircle className="w-4 h-4 text-gray-600 ml-auto" />
                )}
              </div>

              {isCleared ? (
                <div className="space-y-1">
                  <span className="inline-block px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px] font-medium">
                    CLEARED
                  </span>
                  {clearance?.clearedAt && (
                    <p className="text-[10px] text-gray-500">
                      {new Date(clearance.clearedAt).toLocaleDateString()}
                    </p>
                  )}
                  {clearance?.sourceVertical && (
                    <p className="text-[10px] text-gray-500">
                      via {VERTICAL_LABELS[clearance.sourceVertical]?.label}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {result && (
                    <div className="space-y-1">
                      {result.missing.map(req => (
                        <div key={req} className="flex items-center gap-1">
                          <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                          <span className="text-[10px] text-red-400 truncate">{req.replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                      {result.satisfied.map(req => (
                        <div key={req} className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />
                          <span className="text-[10px] text-green-400 truncate">{req.replace(/_/g, ' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleCheck(vertical)}
                      className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                        checking === vertical
                          ? 'bg-[#F8B032]/20 text-[#F8B032]'
                          : 'bg-white/5 text-gray-400 hover:bg-white/10'
                      }`}
                    >
                      <Search className="w-3 h-3" />
                      Check
                    </button>
                    {result?.eligible && (
                      <button
                        onClick={() => onClearVertical(vertical)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded-lg text-[10px] font-medium transition-colors"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
