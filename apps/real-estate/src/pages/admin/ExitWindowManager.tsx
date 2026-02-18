import { useState, useCallback } from 'react';
import { Clock, Calendar, Plus, AlertCircle } from 'lucide-react';
import { useSDKWithFallback } from '../../hooks/useSDKWithFallback';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ExitSchedule {
  id: string;
  assetId: string;
  frequency: string;
  windowDurationDays: number;
  maxRedemptionPercent: number;
  noticePeriodDays: number;
  nextWindowOpens: string;
  active: boolean;
}

interface ExitWindow {
  id: string;
  assetId: string;
  opensAt: string;
  closesAt: string;
  status: string;
  maxRedemptionPercent: number;
  totalRedeemed: number;
  totalRequested: number;
}

interface RedemptionRequest {
  id: string;
  windowId: string;
  investorId: string;
  amount: number;
  status: string;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/*  Mock data for fallback                                             */
/* ------------------------------------------------------------------ */

const MOCK_SCHEDULES: ExitSchedule[] = [
  {
    id: 'sched-marina-gate',
    assetId: 'marina-gate-tower',
    frequency: 'quarterly',
    windowDurationDays: 14,
    maxRedemptionPercent: 10,
    noticePeriodDays: 30,
    nextWindowOpens: '2026-04-01T00:00:00Z',
    active: true,
  },
  {
    id: 'sched-downtown-res',
    assetId: 'downtown-residences',
    frequency: 'monthly',
    windowDurationDays: 7,
    maxRedemptionPercent: 5,
    noticePeriodDays: 14,
    nextWindowOpens: '2026-03-01T00:00:00Z',
    active: true,
  },
];

const MOCK_WINDOWS: ExitWindow[] = [
  {
    id: 'win-001',
    assetId: 'marina-gate-tower',
    opensAt: '2026-04-01T00:00:00Z',
    closesAt: '2026-04-15T00:00:00Z',
    status: 'scheduled',
    maxRedemptionPercent: 10,
    totalRedeemed: 0,
    totalRequested: 0,
  },
  {
    id: 'win-002',
    assetId: 'marina-gate-tower',
    opensAt: '2026-07-01T00:00:00Z',
    closesAt: '2026-07-15T00:00:00Z',
    status: 'scheduled',
    maxRedemptionPercent: 10,
    totalRedeemed: 0,
    totalRequested: 0,
  },
  {
    id: 'win-003',
    assetId: 'downtown-residences',
    opensAt: '2026-03-01T00:00:00Z',
    closesAt: '2026-03-08T00:00:00Z',
    status: 'scheduled',
    maxRedemptionPercent: 5,
    totalRedeemed: 0,
    totalRequested: 0,
  },
];

const MOCK_REDEMPTIONS: RedemptionRequest[] = [
  {
    id: 'rdm-001',
    windowId: 'win-prev',
    investorId: 'inv-101',
    amount: 25000,
    status: 'pending',
    createdAt: '2026-01-15T10:30:00Z',
  },
  {
    id: 'rdm-002',
    windowId: 'win-prev',
    investorId: 'inv-204',
    amount: 50000,
    status: 'approved',
    createdAt: '2026-01-14T09:00:00Z',
  },
];

/* ------------------------------------------------------------------ */
/*  Schedule Card                                                      */
/* ------------------------------------------------------------------ */

function ScheduleCard({ schedule }: { schedule: ExitSchedule }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-medium text-sm">{schedule.assetId}</h3>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
          schedule.active
            ? 'text-green-400 bg-green-500/10 border-green-500/20'
            : 'text-gray-400 bg-gray-500/10 border-gray-500/20'
        }`}>
          {schedule.active ? 'Active' : 'Inactive'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-gray-500">Frequency</span>
          <p className="text-white capitalize">{schedule.frequency}</p>
        </div>
        <div>
          <span className="text-gray-500">Window Duration</span>
          <p className="text-white">{schedule.windowDurationDays} days</p>
        </div>
        <div>
          <span className="text-gray-500">Max Redemption</span>
          <p className="text-white">{schedule.maxRedemptionPercent}%</p>
        </div>
        <div>
          <span className="text-gray-500">Notice Period</span>
          <p className="text-white">{schedule.noticePeriodDays} days</p>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-white/5 text-xs">
        <span className="text-gray-500">Next Window Opens: </span>
        <span className="text-primary font-medium">
          {new Date(schedule.nextWindowOpens).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function ExitWindowManager() {
  const { data: schedules, isLive } = useSDKWithFallback<ExitSchedule[]>(
    async () => null,
    MOCK_SCHEDULES,
  );

  const { data: windows } = useSDKWithFallback<ExitWindow[]>(
    async () => null,
    MOCK_WINDOWS,
  );

  const { data: redemptions } = useSDKWithFallback<RedemptionRequest[]>(
    async () => null,
    MOCK_REDEMPTIONS,
  );

  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">Exit Windows</h1>
              {isLive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-[10px] font-medium text-green-400">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
                  </span>
                  LIVE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/10 border border-gray-500/20 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                  DEMO
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400">Manage redemption schedules and windows</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/20 rounded-lg text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Schedule
        </button>
      </div>

      {/* Create Schedule Form */}
      {showForm && (
        <div className="rounded-xl border border-primary/20 bg-white/5 backdrop-blur-sm p-6">
          <h3 className="text-white font-medium mb-4">New Exit Schedule</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Asset ID</label>
              <input type="text" placeholder="e.g. marina-gate-tower" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/40" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Frequency</label>
              <select className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/40">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semi-annually">Semi-Annually</option>
                <option value="annually">Annually</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Window Duration (days)</label>
              <input type="number" placeholder="14" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/40" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Max Redemption %</label>
              <input type="number" placeholder="10" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/40" />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="px-4 py-2 bg-primary text-black rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              Save Schedule
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Schedules */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Active Schedules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {schedules.map((s) => (
            <ScheduleCard key={s.id} schedule={s} />
          ))}
        </div>
      </div>

      {/* Upcoming Windows Timeline */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Upcoming Windows</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Asset</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Opens</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Closes</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Status</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">Max Redemption</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {windows.map((w) => (
                <tr key={w.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-white font-medium">{w.assetId}</td>
                  <td className="px-6 py-4 text-gray-400">{new Date(w.opensAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-gray-400">{new Date(w.closesAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      w.status === 'open'
                        ? 'text-green-400 bg-green-500/10 border-green-500/20'
                        : w.status === 'scheduled'
                          ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                          : 'text-gray-400 bg-gray-500/10 border-gray-500/20'
                    }`}>
                      {w.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-white">{w.maxRedemptionPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Redemption Requests */}
      <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Recent Redemption Requests</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Request ID</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Investor</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium text-right">Amount (AED)</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Status</th>
                <th className="px-6 py-3 text-[11px] uppercase tracking-wider text-gray-500 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {redemptions.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-white font-mono text-xs">{r.id}</td>
                  <td className="px-6 py-4 text-gray-400">{r.investorId}</td>
                  <td className="px-6 py-4 text-right text-white font-mono">{r.amount.toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                      r.status === 'approved'
                        ? 'text-green-400 bg-green-500/10 border-green-500/20'
                        : r.status === 'pending'
                          ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                          : 'text-gray-400 bg-gray-500/10 border-gray-500/20'
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
