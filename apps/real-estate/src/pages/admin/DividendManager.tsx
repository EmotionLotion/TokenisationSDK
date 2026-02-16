import { useState, useCallback } from 'react';
import {
  DollarSign,
  Calendar,
  TrendingUp,
  Play,
  Pause,
  CheckCircle,
} from 'lucide-react';
import { useCashFlow } from '@tokenisation/sdk-react';
import { StatusBadge } from '@tokenisation/ui-kit';
import { useSDKWithFallback, useSDKMutationWithFallback } from '../../hooks/useSDKWithFallback';
import { toStatusBadgeVariant } from '../../utils/mappers';
import { formatAED } from '../../data/dubai-properties';

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

interface DistributionRecord {
  id: string;
  propertyName: string;
  tokenSymbol: string;
  date: string;
  totalAmount: number;
  perToken: number;
  status: 'completed' | 'processing' | 'scheduled';
}

interface Schedule {
  id: string;
  propertyName: string;
  tokenSymbol: string;
  frequency: 'quarterly' | 'monthly';
  nextDate: string;
  estimatedAmount: number;
  active: boolean;
}

const MOCK_DISTRIBUTION_HISTORY: DistributionRecord[] = [
  { id: 'dist-1', propertyName: 'Marina Gate Tower 1', tokenSymbol: 'MGATE1', date: '2024-01-15', totalAmount: 6750000, perToken: 0.675, status: 'completed' },
  { id: 'dist-2', propertyName: 'Downtown Views Tower A', tokenSymbol: 'DVIEW', date: '2024-01-15', totalAmount: 9750000, perToken: 0.65, status: 'completed' },
  { id: 'dist-3', propertyName: 'Palm Jumeirah Signature Villa Portfolio', tokenSymbol: 'PALMV', date: '2024-01-15', totalAmount: 5600000, perToken: 0.70, status: 'completed' },
  { id: 'dist-4', propertyName: 'Marina Gate Tower 1', tokenSymbol: 'MGATE1', date: '2023-10-15', totalAmount: 6500000, perToken: 0.65, status: 'completed' },
  { id: 'dist-5', propertyName: 'Downtown Views Tower A', tokenSymbol: 'DVIEW', date: '2023-10-15', totalAmount: 9500000, perToken: 0.633, status: 'completed' },
];

const MOCK_SCHEDULES: Schedule[] = [
  { id: 'sched-1', propertyName: 'Marina Gate Tower 1', tokenSymbol: 'MGATE1', frequency: 'quarterly', nextDate: '2024-04-15', estimatedAmount: 6900000, active: true },
  { id: 'sched-2', propertyName: 'Downtown Views Tower A', tokenSymbol: 'DVIEW', frequency: 'quarterly', nextDate: '2024-04-15', estimatedAmount: 9900000, active: true },
  { id: 'sched-3', propertyName: 'Palm Jumeirah Signature Villa Portfolio', tokenSymbol: 'PALMV', frequency: 'quarterly', nextDate: '2024-04-15', estimatedAmount: 5800000, active: true },
  { id: 'sched-4', propertyName: 'Business Bay Executive Towers', tokenSymbol: 'BBTOW', frequency: 'quarterly', nextDate: '2024-07-15', estimatedAmount: 8900000, active: false },
];

/* ------------------------------------------------------------------ */
/*  Status badge variant mapping for distribution statuses              */
/* ------------------------------------------------------------------ */

function distributionStatusVariant(status: DistributionRecord['status']): 'success' | 'warning' | 'info' | 'error' | 'neutral' {
  const mapping: Record<DistributionRecord['status'], 'success' | 'warning' | 'info' | 'error' | 'neutral'> = {
    completed: 'success',
    processing: 'info',
    scheduled: 'warning',
  };
  return mapping[status] || 'neutral';
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-gray-400 font-medium">{label}</span>
        <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  DividendManager                                                    */
/* ------------------------------------------------------------------ */

export function DividendManager() {
  // SDK hooks
  const cashFlow = useCashFlow();

  // Fetch distribution history from SDK, fall back to mock
  const { data: distributionHistory } = useSDKWithFallback<DistributionRecord[]>(
    async () => {
      const distributions = await cashFlow.listDistributions();
      return distributions.map((d) => ({
        id: d.id,
        propertyName: (d as any).propertyName || d.tokenId,
        tokenSymbol: (d as any).tokenSymbol || d.tokenId,
        date: d.executedAt || d.scheduledAt || '',
        totalAmount: parseFloat(d.amount) || 0,
        perToken: (d as any).perToken || 0,
        status: (d.status === 'completed' ? 'completed' : d.status === 'processing' ? 'processing' : 'scheduled') as DistributionRecord['status'],
      }));
    },
    MOCK_DISTRIBUTION_HISTORY,
    [],
  );

  // Fetch schedules from SDK, fall back to mock
  const { data: initialSchedules } = useSDKWithFallback<Schedule[]>(
    async () => {
      const distributions = await cashFlow.listDistributions({ status: 'scheduled' });
      return distributions.map((d) => ({
        id: d.id,
        propertyName: (d as any).propertyName || d.tokenId,
        tokenSymbol: (d as any).tokenSymbol || d.tokenId,
        frequency: ((d as any).frequency || 'quarterly') as Schedule['frequency'],
        nextDate: d.scheduledAt || '',
        estimatedAmount: parseFloat(d.amount) || 0,
        active: (d as any).active ?? true,
      }));
    },
    MOCK_SCHEDULES,
    [],
  );

  const [schedules, setSchedules] = useState<Schedule[]>(initialSchedules);
  // Keep schedules in sync when SDK data loads
  const [lastInitial, setLastInitial] = useState(initialSchedules);
  if (initialSchedules !== lastInitial) {
    setSchedules(initialSchedules);
    setLastInitial(initialSchedules);
  }

  const [selectedSchedule, setSelectedSchedule] = useState(schedules[0]?.id || '');
  const [distributeAmount, setDistributeAmount] = useState('');

  const toggleSchedule = (id: string) => {
    setSchedules((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s)),
    );
  };

  // Wire Distribute button to SDK mutation with fallback
  const distributeMutation = useSDKMutationWithFallback(
    useCallback(
      async (params: { tokenId: string; amount: string }) => {
        return await cashFlow.createDistribution({
          tokenId: params.tokenId,
          amount: params.amount,
          type: 'dividend',
        });
      },
      [cashFlow],
    ),
    useCallback(
      async (params: { tokenId: string; amount: string }) => {
        // Simulate distribution with a small delay
        await new Promise((resolve) => setTimeout(resolve, 800));
        return {
          id: `dist-sim-${Date.now()}`,
          tokenId: params.tokenId,
          type: 'dividend',
          amount: params.amount,
          status: 'processing',
        } as any;
      },
      [],
    ),
  );

  const handleDistribute = async () => {
    const schedule = schedules.find((s) => s.id === selectedSchedule);
    if (!schedule || !distributeAmount) return;
    const rawAmount = distributeAmount.replace(/,/g, '');
    await distributeMutation.execute({
      tokenId: schedule.tokenSymbol,
      amount: rawAmount,
    });
    setDistributeAmount('');
  };

  const totalDistributed = distributionHistory.reduce((sum, d) => sum + d.totalAmount, 0);
  const activeScheduleCount = schedules.filter((s) => s.active).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <DollarSign className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Dividend Manager</h1>
          <p className="text-sm text-gray-400">Distribution scheduling and execution</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Total Distributed"
          value={formatAED(totalDistributed)}
          sub="All-time distributions"
        />
        <StatCard
          icon={Calendar}
          label="Next Distribution"
          value="Apr 15, 2024"
          sub="Q1 2024 cycle"
        />
        <StatCard
          icon={TrendingUp}
          label="Current Yield"
          value="6.53%"
          sub="Weighted portfolio average"
        />
        <StatCard
          icon={CheckCircle}
          label="Active Schedules"
          value={String(activeScheduleCount)}
          sub={`of ${schedules.length} total`}
        />
      </div>

      {/* Distribution History */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Distribution History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Property</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Date</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">Total Amount</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">Per Token</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {distributionHistory.map((d) => (
                <tr key={d.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-white font-medium">{d.propertyName}</p>
                    <p className="text-[10px] text-gray-500 font-mono mt-0.5">{d.tokenSymbol}</p>
                  </td>
                  <td className="px-6 py-4 text-gray-400 font-mono text-xs">{d.date}</td>
                  <td className="px-6 py-4 text-right text-white font-mono">{formatAED(d.totalAmount)}</td>
                  <td className="px-6 py-4 text-right text-primary font-mono">AED {d.perToken.toFixed(3)}</td>
                  <td className="px-6 py-4">
                    <StatusBadge
                      status={d.status}
                      variant={distributionStatusVariant(d.status)}
                      size="sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upcoming Schedules */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Upcoming Schedules</h2>
        </div>
        <div className="divide-y divide-white/5">
          {schedules.map((s) => (
            <div
              key={s.id}
              className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium">{s.propertyName}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-gray-500 font-mono">{s.tokenSymbol}</span>
                  <span className="text-[10px] text-gray-600">&middot;</span>
                  <span className="text-[10px] text-gray-500 capitalize">{s.frequency}</span>
                  <span className="text-[10px] text-gray-600">&middot;</span>
                  <span className="text-[10px] text-gray-500">Next: {s.nextDate}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <span className="text-sm text-white font-mono">{formatAED(s.estimatedAmount)}</span>
                <button
                  onClick={() => toggleSchedule(s.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    s.active
                      ? 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20'
                      : 'bg-white/5 text-gray-500 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {s.active ? (
                    <>
                      <Pause className="w-3 h-3" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-3 h-3" /> Resume
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Distribute Action Form */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
        <div className="flex items-center gap-2 mb-5">
          <DollarSign className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Execute Distribution</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Schedule selector */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2 font-medium">
              Schedule
            </label>
            <select
              value={selectedSchedule}
              onChange={(e) => setSelectedSchedule(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 text-white text-sm px-3 py-2.5 focus:outline-none focus:border-primary/40 transition-colors"
            >
              {schedules
                .filter((s) => s.active)
                .map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#0B0E14] text-white">
                    {s.propertyName} ({s.tokenSymbol})
                  </option>
                ))}
            </select>
          </div>

          {/* Amount input */}
          <div>
            <label className="block text-xs text-gray-400 uppercase tracking-wider mb-2 font-medium">
              Amount (AED)
            </label>
            <input
              type="text"
              value={distributeAmount}
              onChange={(e) => setDistributeAmount(e.target.value)}
              placeholder="e.g. 6,900,000"
              className="w-full rounded-lg border border-white/10 bg-white/5 text-white text-sm px-3 py-2.5 placeholder:text-gray-600 focus:outline-none focus:border-primary/40 transition-colors"
            />
          </div>

          {/* Submit */}
          <div className="flex items-end">
            <button
              onClick={handleDistribute}
              disabled={distributeMutation.loading || !distributeAmount}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              {distributeMutation.loading ? 'Distributing...' : 'Distribute'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
