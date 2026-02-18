import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface BuiltWithService {
    icon: LucideIcon;
    name: string;
    description: string;
    docPath: string;
}

interface BuiltWithPanelProps {
    appName: string;
    services: BuiltWithService[];
    accentColor?: string;
}

export function BuiltWithPanel({ appName, services, accentColor = '#F8B032' }: BuiltWithPanelProps) {
    return (
        <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-white/5" />
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium whitespace-nowrap">
                    Built with TokenisationSDK
                </p>
                <div className="h-px flex-1 bg-white/5" />
            </div>
            <p className="text-sm text-gray-400 mb-4 text-center">
                <span className="font-medium text-white">{appName}</span> is powered by these SDK services
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {services.map((service) => {
                    const Icon = service.icon;
                    return (
                        <Link
                            key={service.name}
                            to={service.docPath}
                            className="group relative rounded-xl border border-white/5 bg-white/[0.02] p-4 hover:bg-white/5 hover:border-white/10 transition-all duration-300"
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: `${accentColor}15` }}
                                >
                                    <Icon className="w-4.5 h-4.5" style={{ color: accentColor }} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-white truncate group-hover:text-white/90">
                                        {service.name}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                                        {service.description}
                                    </p>
                                </div>
                            </div>
                            <ExternalLink className="absolute top-3 right-3 w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
