import { Shield } from 'lucide-react';
import { Breadcrumb } from '../../components/shared/Breadcrumb';
import { PartnerApprovalDemo } from '../../components/blueprints/PartnerApprovalDemo';

export function PartnerAdminPage() {
    return (
        <div className="space-y-6 animate-fadeIn">
            <Breadcrumb items={[
                { label: 'Integrate', path: '/integrate' },
                { label: 'Partner Admin' }
            ]} />

            <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                    <div className="p-2 bg-emerald-400/10 rounded-lg">
                        <Shield className="w-6 h-6 text-emerald-400" />
                    </div>
                    Partner Admin
                </h1>
                <p className="text-gray-400 mt-1">Manage partner approvals, KYC verifications, and integration requests.</p>
            </div>

            <PartnerApprovalDemo />
        </div>
    );
}
