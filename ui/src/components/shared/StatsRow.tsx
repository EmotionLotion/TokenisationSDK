import { type LucideIcon } from 'lucide-react';

export interface StatCard {
    label: string;
    value: string;
    change?: string;
    changeColor?: string;
    icon: LucideIcon;
    iconColor: string;
}

interface StatsRowProps {
    stats: StatCard[];
}

export function StatsRow({ stats }: StatsRowProps) {
    return (
        <div className="grid grid-cols-4 gap-4">
            {stats.map((stat, index) => {
                const Icon = stat.icon;
                return (
                    <div key={index} className="glass-card p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-gray-400 text-sm">{stat.label}</span>
                            <Icon className={`w-4 h-4 ${stat.iconColor}`} />
                        </div>
                        <p className="text-2xl font-bold text-white">{stat.value}</p>
                        {stat.change && (
                            <p className={`text-xs mt-1 ${stat.changeColor || 'text-gray-500'}`}>
                                {stat.change}
                            </p>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
