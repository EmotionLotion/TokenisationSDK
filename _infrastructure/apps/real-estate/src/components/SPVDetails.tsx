import { useCallback } from 'react';
import { Building2, Scale, Globe, Shield } from 'lucide-react';
import { useAsset } from '@tokenisation/sdk-react';
import { useSDKWithFallback } from '../hooks/useSDKWithFallback';

interface SPVDetailsProps {
  propertyName: string;
  propertyId?: string;
}

interface SPVData {
  entityName: string;
  jurisdiction: string;
  jurisdictionFull: string;
  registrationNo: string;
  registeredAgent: string;
  incorporationDate: string;
  regulatoryStatus: 'active' | 'pending' | 'suspended';
  shareholders: {
    name: string;
    percentage: number;
    role: string;
  }[];
  directors: {
    name: string;
    title: string;
  }[];
  registeredAddress: string;
  authorizedCapital: string;
  paidUpCapital: string;
}

function generateSPVData(propertyName: string): SPVData {
  const sanitizedName = propertyName.replace(/\s+/g, ' ').split(' ').slice(0, 3).join(' ');

  return {
    entityName: `${sanitizedName} Holdings SPV Ltd`,
    jurisdiction: 'ADGM',
    jurisdictionFull: 'Abu Dhabi Global Market',
    registrationNo: 'ADGM-SPV-2024-00' + Math.floor(Math.random() * 900 + 100),
    registeredAgent: 'Al Tamimi & Company',
    incorporationDate: '2024-01-05',
    regulatoryStatus: 'active',
    shareholders: [
      { name: 'AHOY Capital PJSC', percentage: 51, role: 'Managing Shareholder' },
      { name: 'Token Holders (Beneficial)', percentage: 49, role: 'Beneficial Owners via Tokens' },
    ],
    directors: [
      { name: 'Ahmed Al Maktoum', title: 'Chairman' },
      { name: 'Sarah Chen', title: 'Managing Director' },
      { name: 'James Henderson', title: 'Independent Director' },
    ],
    registeredAddress: 'Al Maryah Island, Abu Dhabi Global Market Square, Abu Dhabi, UAE',
    authorizedCapital: 'USD 150,000,000',
    paidUpCapital: 'USD 100,000',
  };
}

/** Map an SDK regulatory status string to our local type */
function mapRegulatoryStatus(status?: string): SPVData['regulatoryStatus'] {
  if (!status) return 'active';
  const lower = status.toLowerCase();
  if (lower === 'active' || lower === 'registered') return 'active';
  if (lower === 'pending' || lower === 'draft') return 'pending';
  if (lower === 'suspended' || lower === 'dissolved') return 'suspended';
  return 'active';
}

function getStatusBadge(status: SPVData['regulatoryStatus']) {
  switch (status) {
    case 'active':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs border border-green-500/20">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Active
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 text-xs border border-yellow-500/20">
          Pending
        </span>
      );
    case 'suspended':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-xs border border-red-500/20">
          Suspended
        </span>
      );
  }
}

export function SPVDetails({ propertyName, propertyId }: SPVDetailsProps) {
  const asset = useAsset();

  const sdkCall = useCallback(async () => {
    if (!propertyId) return null;
    const assetData = await asset.getAsset(propertyId);
    if (!assetData) return null;

    // Extract SPV-related info from asset metadata
    const metadata = (assetData.metadata ?? assetData) as Record<string, unknown>;
    const spvInfo = (metadata.spv ?? metadata.spvDetails ?? metadata) as Record<string, unknown>;

    const entityName = (spvInfo.entityName as string)
      ?? (spvInfo.spvName as string)
      ?? (spvInfo.name as string)
      ?? null;

    // If no recognizable SPV data found in the asset, return null to trigger fallback
    if (!entityName) return null;

    const shareholders = Array.isArray(spvInfo.shareholders)
      ? (spvInfo.shareholders as Array<Record<string, unknown>>).map((sh) => ({
          name: (sh.name as string) ?? 'Unknown',
          percentage: (sh.percentage as number) ?? 0,
          role: (sh.role as string) ?? '',
        }))
      : [
          { name: 'AHOY Capital PJSC', percentage: 51, role: 'Managing Shareholder' },
          { name: 'Token Holders (Beneficial)', percentage: 49, role: 'Beneficial Owners via Tokens' },
        ];

    const directors = Array.isArray(spvInfo.directors)
      ? (spvInfo.directors as Array<Record<string, unknown>>).map((d) => ({
          name: (d.name as string) ?? 'Unknown',
          title: (d.title as string) ?? '',
        }))
      : [
          { name: 'Ahmed Al Maktoum', title: 'Chairman' },
          { name: 'Sarah Chen', title: 'Managing Director' },
          { name: 'James Henderson', title: 'Independent Director' },
        ];

    return {
      entityName,
      jurisdiction: (spvInfo.jurisdiction as string) ?? 'ADGM',
      jurisdictionFull: (spvInfo.jurisdictionFull as string) ?? 'Abu Dhabi Global Market',
      registrationNo: (spvInfo.registrationNo as string) ?? (spvInfo.registrationNumber as string) ?? 'N/A',
      registeredAgent: (spvInfo.registeredAgent as string) ?? 'Al Tamimi & Company',
      incorporationDate: (spvInfo.incorporationDate as string) ?? '2024-01-05',
      regulatoryStatus: mapRegulatoryStatus((spvInfo.regulatoryStatus as string | undefined) ?? (spvInfo.status as string | undefined)),
      shareholders,
      directors,
      registeredAddress: (spvInfo.registeredAddress as string) ?? 'Al Maryah Island, Abu Dhabi Global Market Square, Abu Dhabi, UAE',
      authorizedCapital: (spvInfo.authorizedCapital as string) ?? 'USD 150,000,000',
      paidUpCapital: (spvInfo.paidUpCapital as string) ?? 'USD 100,000',
    } satisfies SPVData;
  }, [asset, propertyId]);

  const fallbackData = generateSPVData(propertyName);

  const { data: spv } = useSDKWithFallback<SPVData>(
    sdkCall,
    fallbackData,
    [sdkCall],
  );

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#F8B032]/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-[#F8B032]" />
            </div>
            <div>
              <h3 className="text-white font-semibold">SPV Structure</h3>
              <p className="text-gray-400 text-xs">Special Purpose Vehicle &middot; {spv.jurisdiction}</p>
            </div>
          </div>
          {getStatusBadge(spv.regulatoryStatus)}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* SPV Entity Card */}
        <div className="rounded-lg border border-[#F8B032]/20 bg-[#F8B032]/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4 text-[#F8B032]" />
            <h4 className="text-[#F8B032] font-semibold text-sm">SPV Entity</h4>
          </div>
          <p className="text-white font-bold text-lg mb-3">{spv.entityName}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-gray-400 text-xs">Registration No.</span>
              <p className="text-white text-sm font-mono">{spv.registrationNo}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">Incorporation Date</span>
              <p className="text-white text-sm">{spv.incorporationDate}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">Authorized Capital</span>
              <p className="text-white text-sm">{spv.authorizedCapital}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">Paid-up Capital</span>
              <p className="text-white text-sm">{spv.paidUpCapital}</p>
            </div>
          </div>
        </div>

        {/* Jurisdiction & Registered Agent */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-blue-400" />
              <h4 className="text-white font-medium text-sm">Jurisdiction</h4>
            </div>
            <p className="text-white text-lg font-bold mb-1">{spv.jurisdiction}</p>
            <p className="text-gray-400 text-xs mb-2">{spv.jurisdictionFull}</p>
            <p className="text-gray-500 text-xs leading-relaxed">{spv.registeredAddress}</p>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Scale className="w-4 h-4 text-purple-400" />
              <h4 className="text-white font-medium text-sm">Registered Agent</h4>
            </div>
            <p className="text-white text-lg font-bold mb-1">{spv.registeredAgent}</p>
            <p className="text-gray-400 text-xs mb-2">Legal Counsel & Corporate Services</p>
            <p className="text-gray-500 text-xs leading-relaxed">
              Handles all regulatory filings, corporate governance, and compliance reporting for the SPV entity.
            </p>
          </div>
        </div>

        {/* Ownership Structure Tree */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-green-400" />
            <h4 className="text-white font-medium text-sm">Ownership Structure</h4>
          </div>

          {/* Visual Tree */}
          <div className="flex flex-col items-center">
            {/* Property Asset */}
            <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-center mb-2">
              <p className="text-gray-400 text-[10px] uppercase tracking-wider">Underlying Asset</p>
              <p className="text-white text-sm font-medium">{propertyName}</p>
            </div>

            <div className="w-[2px] h-6 bg-white/20" />

            {/* SPV */}
            <div className="px-4 py-2 rounded-lg bg-[#F8B032]/10 border border-[#F8B032]/20 text-center mb-2">
              <p className="text-[#F8B032] text-[10px] uppercase tracking-wider">SPV</p>
              <p className="text-white text-sm font-medium">{spv.entityName}</p>
            </div>

            <div className="w-[2px] h-4 bg-white/20" />

            {/* Branch */}
            <div className="relative w-full max-w-md">
              <div className="absolute top-0 left-1/4 right-1/4 h-[2px] bg-white/20" />
              <div className="absolute top-0 left-1/4 w-[2px] h-4 bg-white/20" />
              <div className="absolute top-0 right-1/4 w-[2px] h-4 bg-white/20" />

              <div className="grid grid-cols-2 gap-4 pt-4">
                {spv.shareholders.map((sh, i) => (
                  <div
                    key={i}
                    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-center"
                  >
                    <p className="text-white text-sm font-medium">{sh.name}</p>
                    <p className="text-[#F8B032] text-lg font-bold">{sh.percentage}%</p>
                    <p className="text-gray-500 text-[10px]">{sh.role}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Board of Directors */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <h4 className="text-white font-medium text-sm mb-3">Board of Directors</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {spv.directors.map((director, i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5"
              >
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xs font-bold">
                  {director.name.split(' ').map((n) => n[0]).join('')}
                </div>
                <div>
                  <p className="text-white text-sm">{director.name}</p>
                  <p className="text-gray-500 text-xs">{director.title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-white/10 bg-white/[0.02]">
        <p className="text-gray-500 text-xs text-center">
          SPV structured under ADGM regulations. Annual filings and audited financials maintained by registered agent.
        </p>
      </div>
    </div>
  );
}
