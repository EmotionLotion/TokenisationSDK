import { useState, type ReactNode } from 'react';
import { type LucideIcon, Coins } from 'lucide-react';
import { AhoyBalanceWidget } from '../AhoyBalanceWidget';
import { StatsRow, type StatCard } from './StatsRow';

export interface TabDef {
    id: string;
    label: string;
    icon: LucideIcon;
    content: ReactNode;
    accentColor?: string;
}

export interface VerticalDemoShellProps {
    title: string;
    subtitle: string;
    icon: LucideIcon;
    gradientFrom: string;
    gradientTo: string;
    accentColor: string;
    ahoyVertical: 'COMET' | 'FLYPLUS' | 'H2O' | 'IITS' | 'GTS' | 'AMS' | 'TROUVE' | 'CONNECT';
    stats?: StatCard[];
    tabs: TabDef[];
    headerExtra?: ReactNode;
}

export function VerticalDemoShell({
    title,
    subtitle,
    icon: Icon,
    gradientFrom,
    gradientTo,
    accentColor,
    ahoyVertical,
    stats,
    tabs,
    headerExtra,
}: VerticalDemoShellProps) {
    const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? '');

    const activeTabContent = tabs.find(t => t.id === activeTab)?.content;

    return (
        <div className="max-w-6xl mx-auto pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Branded Gradient Header */}
            <div className="flex items-start justify-between mb-6 gap-6">
                <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 bg-gradient-to-br ${gradientFrom} ${gradientTo} rounded-2xl flex items-center justify-center shadow-lg`}>
                        <Icon className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white">{title}</h1>
                        <p className={`text-sm ${accentColor} font-medium`}>{subtitle}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {headerExtra}
                    <div className="w-72">
                        <AhoyBalanceWidget vertical={ahoyVertical} />
                    </div>
                </div>
            </div>

            {/* Stats Row */}
            {stats && stats.length > 0 && (
                <div className="mb-6">
                    <StatsRow stats={stats} />
                </div>
            )}

            {/* Tab Navigation */}
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/10 mb-6 overflow-x-auto">
                {tabs.map(tab => {
                    const TabIcon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 min-w-0 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                                isActive
                                    ? `bg-gradient-to-r ${gradientFrom} ${gradientTo} text-white shadow-lg`
                                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            <TabIcon className="w-4 h-4 shrink-0" />
                            <span className="truncate">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Active Tab Content */}
            <div className="animate-in fade-in duration-300">
                {activeTabContent}
            </div>
        </div>
    );
}
