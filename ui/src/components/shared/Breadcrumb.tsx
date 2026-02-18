import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
    label: string;
    path?: string;
}

interface BreadcrumbProps {
    items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
    return (
        <nav className="flex items-center gap-1 text-sm text-gray-400 mb-4">
            {items.map((item, index) => (
                <span key={index} className="flex items-center gap-1">
                    {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
                    {item.path ? (
                        <Link
                            to={item.path}
                            className="hover:text-white transition-colors"
                        >
                            {item.label}
                        </Link>
                    ) : (
                        <span className="text-gray-300">{item.label}</span>
                    )}
                </span>
            ))}
        </nav>
    );
}
