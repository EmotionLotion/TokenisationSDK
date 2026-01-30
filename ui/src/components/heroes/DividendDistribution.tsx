import { Banknote, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

interface Payee {
  name: string;
  amount: number;
  settled: boolean;
}

interface DividendDistributionProps {
  assetName: string;
  totalDividend: number;
  payees: Payee[];
  currency: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20', label: 'Pending' },
  in_progress: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'In Progress' },
  completed: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', label: 'Completed' },
  failed: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Failed' },
};

export function DividendDistribution({
  assetName,
  totalDividend,
  payees,
  currency,
  status,
}: DividendDistributionProps) {
  const cfg = STATUS_CONFIG[status];
  const StatusIcon = cfg.icon;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Dividend Distribution</h3>
          <p className="text-sm text-gray-500">{assetName}</p>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.color} ${cfg.bg} ${cfg.border}`}>
          <StatusIcon className="w-3 h-3" />
          {cfg.label}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Banknote className="w-5 h-5 text-amber-400" />
        <span className="text-2xl font-bold text-white">
          {currency} {totalDividend.toLocaleString()}
        </span>
      </div>

      <div className="space-y-2">
        {payees.map((p, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/5 bg-white/5">
            <span className="text-sm text-gray-300">{p.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">
                {currency} {p.amount.toLocaleString()}
              </span>
              {p.settled ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Clock className="w-3.5 h-3.5 text-gray-500" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
