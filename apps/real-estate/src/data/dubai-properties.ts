/**
 * Dubai Real Estate Portfolio - Institutional Reference Data
 *
 * This represents a realistic tokenization portfolio for institutional demonstration.
 * Properties are based on actual Dubai market segments with realistic valuations.
 */

export interface DubaiProperty {
  id: string;
  name: string;
  location: string;
  district: string;
  developer: string;
  propertyType: 'residential' | 'commercial' | 'mixed-use' | 'hospitality';

  // Physical Details
  totalArea: number; // sqft
  units?: number;
  floors?: number;
  yearBuilt: number;

  // Regulatory
  reraPermitNo: string;
  titleDeedNo: string;
  makaniNo: string; // Dubai's unique building identifier

  // Valuation
  valuationAED: number;
  valuationUSD: number;
  valuationDate: string;
  valuedBy: string;

  // Financials
  annualRentalIncomeAED: number;
  grossYield: number; // percentage
  netYield: number;
  occupancyRate: number;

  // Tokenization
  tokenSymbol: string;
  totalTokens: number;
  tokenPriceAED: number;
  tokenPriceUSD: number;
  minInvestmentAED: number;

  // Status
  status: 'sourcing' | 'due-diligence' | 'legal-structuring' | 'regulatory-approval' | 'token-issuance' | 'live' | 'distributing';

  // Images (placeholder URLs)
  imageUrl: string;

  // Description
  description: string;
  highlights: string[];
}

export interface InstitutionalParty {
  id: string;
  name: string;
  role: 'issuer' | 'custodian' | 'legal' | 'auditor' | 'transfer-agent' | 'regulator' | 'bank' | 'investor';
  logo?: string;
  jurisdiction: string;
  licenseNo?: string;
  description: string;
}

export interface ComplianceCheckpoint {
  id: string;
  name: string;
  authority: string;
  status: 'pending' | 'in-progress' | 'approved' | 'conditional';
  requiredDocuments: string[];
  completedDate?: string;
  expiryDate?: string;
}

// ============================================================================
// DUBAI PROPERTY PORTFOLIO
// ============================================================================

export const DUBAI_PROPERTIES: DubaiProperty[] = [
  {
    id: 'prop-001',
    name: 'Marina Gate Tower 1',
    location: 'Dubai Marina, Plot 234',
    district: 'Dubai Marina',
    developer: 'Select Group',
    propertyType: 'residential',

    totalArea: 245000,
    units: 182,
    floors: 52,
    yearBuilt: 2018,

    reraPermitNo: 'RERA-2023-045678',
    titleDeedNo: 'TD-DM-2018-00234',
    makaniNo: '25897 63214',

    valuationAED: 385000000,
    valuationUSD: 104800000,
    valuationDate: '2024-01-15',
    valuedBy: 'CBRE Middle East',

    annualRentalIncomeAED: 27000000,
    grossYield: 7.01,
    netYield: 5.85,
    occupancyRate: 94.5,

    tokenSymbol: 'MGATE1',
    totalTokens: 10000000,
    tokenPriceAED: 38.50,
    tokenPriceUSD: 10.48,
    minInvestmentAED: 50000,

    status: 'live',
    imageUrl: '/assets/marina-gate.jpg',

    description: 'Premium residential tower in Dubai Marina with stunning waterfront views. Fully occupied with long-term tenants including corporate housing contracts.',
    highlights: [
      '94.5% occupancy with 3-year average tenant retention',
      'Premium waterfront location with marina views',
      'Smart building technology with IoT integration',
      'Walking distance to Dubai Marina Mall and Metro',
    ],
  },
  {
    id: 'prop-002',
    name: 'Downtown Views Tower A',
    location: 'Downtown Dubai, Plot 567',
    district: 'Downtown Dubai',
    developer: 'Emaar Properties',
    propertyType: 'mixed-use',

    totalArea: 312000,
    units: 245,
    floors: 48,
    yearBuilt: 2020,

    reraPermitNo: 'RERA-2023-089012',
    titleDeedNo: 'TD-DD-2020-00567',
    makaniNo: '31456 78923',

    valuationAED: 520000000,
    valuationUSD: 141600000,
    valuationDate: '2024-01-20',
    valuedBy: 'JLL MENA',

    annualRentalIncomeAED: 39000000,
    grossYield: 7.50,
    netYield: 6.25,
    occupancyRate: 97.2,

    tokenSymbol: 'DVIEW',
    totalTokens: 15000000,
    tokenPriceAED: 34.67,
    tokenPriceUSD: 9.44,
    minInvestmentAED: 50000,

    status: 'distributing',
    imageUrl: '/assets/downtown-views.jpg',

    description: 'Iconic mixed-use development with Burj Khalifa views. Retail podium with premium F&B tenants. Residential units attract high-net-worth individuals.',
    highlights: [
      'Direct Burj Khalifa and Dubai Fountain views',
      'Premium retail tenants including global brands',
      'Recently distributed Q4 2023 dividends (6.1% annualized)',
      'Walking distance to Dubai Mall',
    ],
  },
  {
    id: 'prop-003',
    name: 'Palm Jumeirah Signature Villa Portfolio',
    location: 'Palm Jumeirah, Fronds K-N',
    district: 'Palm Jumeirah',
    developer: 'Nakheel',
    propertyType: 'residential',

    totalArea: 85000,
    units: 12,
    floors: 3,
    yearBuilt: 2008,

    reraPermitNo: 'RERA-2023-034521',
    titleDeedNo: 'TD-PJ-2008-K0012',
    makaniNo: '45678 12345',

    valuationAED: 280000000,
    valuationUSD: 76200000,
    valuationDate: '2024-02-01',
    valuedBy: 'Knight Frank',

    annualRentalIncomeAED: 22400000,
    grossYield: 8.00,
    netYield: 6.80,
    occupancyRate: 100,

    tokenSymbol: 'PALMV',
    totalTokens: 8000000,
    tokenPriceAED: 35.00,
    tokenPriceUSD: 9.53,
    minInvestmentAED: 100000,

    status: 'live',
    imageUrl: '/assets/palm-villas.jpg',

    description: 'Portfolio of 12 signature villas on Palm Jumeirah with private beaches. Fully leased to UHNW tenants on long-term contracts with annual escalations.',
    highlights: [
      '100% occupancy with 5-year lease terms',
      'Private beach access for each villa',
      'Average villa size: 7,000+ sqft',
      '5% annual rent escalation clauses',
    ],
  },
  {
    id: 'prop-004',
    name: 'Business Bay Executive Towers',
    location: 'Business Bay, Plot 890',
    district: 'Business Bay',
    developer: 'Damac Properties',
    propertyType: 'commercial',

    totalArea: 420000,
    units: 380,
    floors: 35,
    yearBuilt: 2015,

    reraPermitNo: 'RERA-2023-067890',
    titleDeedNo: 'TD-BB-2015-00890',
    makaniNo: '56789 45678',

    valuationAED: 445000000,
    valuationUSD: 121200000,
    valuationDate: '2024-01-25',
    valuedBy: 'Cushman & Wakefield',

    annualRentalIncomeAED: 35600000,
    grossYield: 8.00,
    netYield: 6.65,
    occupancyRate: 89.3,

    tokenSymbol: 'BBTOW',
    totalTokens: 12000000,
    tokenPriceAED: 37.08,
    tokenPriceUSD: 10.10,
    minInvestmentAED: 50000,

    status: 'token-issuance',
    imageUrl: '/assets/business-bay.jpg',

    description: 'Grade A commercial office complex in Business Bay. Tenants include multinational corporations, banks, and professional services firms.',
    highlights: [
      'Grade A office specifications',
      'Major tenants: 3 Fortune 500 companies',
      'Metro-adjacent location',
      'LEED Gold certified building',
    ],
  },
  {
    id: 'prop-005',
    name: 'JBR Beachfront Hotel',
    location: 'Jumeirah Beach Residence, Plot 123',
    district: 'JBR',
    developer: 'Dubai Properties',
    propertyType: 'hospitality',

    totalArea: 180000,
    units: 285,
    floors: 28,
    yearBuilt: 2016,

    reraPermitNo: 'RERA-2023-012345',
    titleDeedNo: 'TD-JBR-2016-00123',
    makaniNo: '67890 56789',

    valuationAED: 620000000,
    valuationUSD: 168800000,
    valuationDate: '2024-02-10',
    valuedBy: 'HVS Dubai',

    annualRentalIncomeAED: 52700000,
    grossYield: 8.50,
    netYield: 7.10,
    occupancyRate: 82.5,

    tokenSymbol: 'JBRHT',
    totalTokens: 20000000,
    tokenPriceAED: 31.00,
    tokenPriceUSD: 8.44,
    minInvestmentAED: 100000,

    status: 'regulatory-approval',
    imageUrl: '/assets/jbr-hotel.jpg',

    description: '5-star beachfront hotel with 285 keys. Operated by international hotel brand under 15-year management agreement. Strong RevPAR performance.',
    highlights: [
      '5-star beachfront property',
      'International hotel operator (15-year contract)',
      '82.5% average occupancy',
      'RevPAR: AED 485 (above market average)',
    ],
  },
];

// ============================================================================
// INSTITUTIONAL STAKEHOLDERS
// ============================================================================

export const INSTITUTIONAL_PARTIES: InstitutionalParty[] = [
  {
    id: 'party-issuer',
    name: 'AHOY Capital PJSC',
    role: 'issuer',
    jurisdiction: 'UAE - DIFC',
    licenseNo: 'DFSA-CL-2023-0456',
    description: 'Licensed fund manager and tokenization issuer regulated by DFSA. Manages AED 2.5B in real estate assets.',
  },
  {
    id: 'party-custodian',
    name: 'Emirates NBD Asset Custody',
    role: 'custodian',
    jurisdiction: 'UAE',
    licenseNo: 'CBUAE-CUS-2019-0089',
    description: 'Leading regional bank providing custody services for tokenized assets. Holds title deeds and manages escrow accounts.',
  },
  {
    id: 'party-legal',
    name: 'Al Tamimi & Company',
    role: 'legal',
    jurisdiction: 'UAE',
    description: 'Largest law firm in the Middle East. Handles SPV structuring, regulatory filings, and investor documentation.',
  },
  {
    id: 'party-auditor',
    name: 'KPMG Lower Gulf',
    role: 'auditor',
    jurisdiction: 'UAE',
    licenseNo: 'MOE-AUD-1985-0012',
    description: 'Big Four auditor providing annual audits, NAV calculations, and regulatory reporting.',
  },
  {
    id: 'party-transfer-agent',
    name: 'AHOY Tokenisation Platform',
    role: 'transfer-agent',
    jurisdiction: 'UAE - ADGM',
    licenseNo: 'FSRA-2024-0234',
    description: 'Technology platform for token issuance, transfers, and cap table management. FSRA regulated.',
  },
  {
    id: 'party-sca',
    name: 'Securities & Commodities Authority',
    role: 'regulator',
    jurisdiction: 'UAE',
    description: 'Federal regulator overseeing securities offerings in the UAE mainland.',
  },
  {
    id: 'party-vara',
    name: 'Virtual Assets Regulatory Authority',
    role: 'regulator',
    jurisdiction: 'UAE - Dubai',
    description: 'Dubai regulator for virtual assets and tokenized securities.',
  },
  {
    id: 'party-dfsa',
    name: 'Dubai Financial Services Authority',
    role: 'regulator',
    jurisdiction: 'UAE - DIFC',
    description: 'DIFC regulator for financial services including security token offerings.',
  },
];

// ============================================================================
// COMPLIANCE CHECKPOINTS
// ============================================================================

export const COMPLIANCE_CHECKPOINTS: ComplianceCheckpoint[] = [
  {
    id: 'comp-001',
    name: 'SCA Security Token Approval',
    authority: 'Securities & Commodities Authority',
    status: 'approved',
    requiredDocuments: [
      'Prospectus (Arabic & English)',
      'Valuation Report',
      'Legal Opinion',
      'Board Resolutions',
      'AML/CFT Policy',
    ],
    completedDate: '2024-01-15',
    expiryDate: '2025-01-15',
  },
  {
    id: 'comp-002',
    name: 'VARA Virtual Asset License',
    authority: 'Virtual Assets Regulatory Authority',
    status: 'approved',
    requiredDocuments: [
      'VASP Application',
      'Technology Audit Report',
      'Cybersecurity Assessment',
      'Custody Arrangements',
      'Business Continuity Plan',
    ],
    completedDate: '2024-02-01',
    expiryDate: '2025-02-01',
  },
  {
    id: 'comp-003',
    name: 'Emirates NBD Custody Agreement',
    authority: 'UAE Central Bank',
    status: 'approved',
    requiredDocuments: [
      'Custody Service Agreement',
      'Escrow Account Setup',
      'Title Deed Safekeeping',
      'Reporting SLA',
    ],
    completedDate: '2024-01-20',
  },
  {
    id: 'comp-004',
    name: 'KYC/AML Framework Certification',
    authority: 'UAE Central Bank / FATF',
    status: 'approved',
    requiredDocuments: [
      'AML Policy Document',
      'KYC Procedures',
      'PEP Screening Process',
      'Sanctions Screening Integration',
      'STR Filing Procedures',
    ],
    completedDate: '2024-01-10',
    expiryDate: '2024-12-31',
  },
  {
    id: 'comp-005',
    name: 'RERA Property Registration',
    authority: 'Real Estate Regulatory Agency',
    status: 'approved',
    requiredDocuments: [
      'Title Deeds',
      'NOC from Developer',
      'Property Valuation',
      'Tenant Schedules',
    ],
    completedDate: '2023-12-15',
  },
];

// ============================================================================
// LIFECYCLE STAGES
// ============================================================================

export interface LifecycleStage {
  id: string;
  name: string;
  description: string;
  duration: string;
  status: 'completed' | 'current' | 'upcoming';
  tasks: string[];
  documents?: string[];
}

export const TOKENIZATION_LIFECYCLE: LifecycleStage[] = [
  {
    id: 'stage-1',
    name: 'Property Sourcing',
    description: 'Identify and evaluate potential properties for tokenization',
    duration: '2-4 weeks',
    status: 'completed',
    tasks: [
      'Market analysis and property identification',
      'Initial feasibility assessment',
      'Preliminary valuation',
      'Seller negotiations and LOI',
    ],
  },
  {
    id: 'stage-2',
    name: 'Due Diligence',
    description: 'Comprehensive property and legal due diligence',
    duration: '4-6 weeks',
    status: 'completed',
    tasks: [
      'Independent property valuation (RICS certified)',
      'Legal title review and encumbrance check',
      'Technical building inspection',
      'Tenant due diligence and lease review',
      'Environmental assessment',
    ],
    documents: [
      'Valuation Report',
      'Title Search Certificate',
      'Technical Inspection Report',
      'Rent Roll',
    ],
  },
  {
    id: 'stage-3',
    name: 'Legal Structuring',
    description: 'SPV creation and legal documentation',
    duration: '3-4 weeks',
    status: 'completed',
    tasks: [
      'SPV incorporation (ADGM or DIFC)',
      'Property transfer to SPV',
      'Shareholder agreements',
      'Token terms and conditions',
      'Subscription agreements',
    ],
    documents: [
      'SPV Memorandum & Articles',
      'Property Transfer Deed',
      'Token T&Cs',
      'Subscription Agreement Template',
    ],
  },
  {
    id: 'stage-4',
    name: 'Regulatory Approval',
    description: 'Obtain necessary regulatory approvals and licenses',
    duration: '6-12 weeks',
    status: 'completed',
    tasks: [
      'SCA prospectus approval',
      'VARA virtual asset license',
      'Central Bank custody approval',
      'RERA tokenization registration',
    ],
    documents: [
      'SCA Approval Letter',
      'VARA License',
      'Custody Agreement',
      'RERA Registration',
    ],
  },
  {
    id: 'stage-5',
    name: 'Token Issuance',
    description: 'Smart contract deployment and token minting',
    duration: '1-2 weeks',
    status: 'current',
    tasks: [
      'Smart contract audit (CertiK/Trail of Bits)',
      'Contract deployment to mainnet',
      'Token minting and allocation',
      'Cap table initialization',
      'Investor whitelisting',
    ],
    documents: [
      'Smart Contract Audit Report',
      'Deployment Transaction Receipts',
      'Initial Cap Table',
    ],
  },
  {
    id: 'stage-6',
    name: 'Primary Distribution',
    description: 'Token sale to qualified investors',
    duration: '4-8 weeks',
    status: 'upcoming',
    tasks: [
      'Investor KYC/AML onboarding',
      'Subscription processing',
      'Token distribution',
      'Funds collection and escrow release',
    ],
  },
  {
    id: 'stage-7',
    name: 'Secondary Trading',
    description: 'Enable peer-to-peer token transfers',
    duration: 'Ongoing',
    status: 'upcoming',
    tasks: [
      'Secondary market activation',
      'Transfer compliance checks',
      'Price discovery',
      'Liquidity management',
    ],
  },
  {
    id: 'stage-8',
    name: 'Income Distribution',
    description: 'Quarterly rental income distribution to token holders',
    duration: 'Quarterly',
    status: 'upcoming',
    tasks: [
      'Rent collection and reconciliation',
      'Expense deduction and NAV calculation',
      'Dividend calculation per token',
      'Distribution execution',
      'Tax reporting (IRS/local)',
    ],
    documents: [
      'Quarterly Financial Report',
      'Distribution Statement',
      'Tax Certificate',
    ],
  },
];

// ============================================================================
// FINANCIAL PROJECTIONS
// ============================================================================

export interface FinancialProjection {
  year: number;
  grossRentalIncome: number;
  operatingExpenses: number;
  netOperatingIncome: number;
  distributionPerToken: number;
  propertyAppreciation: number;
  totalReturn: number;
}

export const PORTFOLIO_PROJECTIONS: FinancialProjection[] = [
  {
    year: 2024,
    grossRentalIncome: 176700000,
    operatingExpenses: 28272000,
    netOperatingIncome: 148428000,
    distributionPerToken: 2.28,
    propertyAppreciation: 5.2,
    totalReturn: 11.8,
  },
  {
    year: 2025,
    grossRentalIncome: 185535000,
    operatingExpenses: 29685600,
    netOperatingIncome: 155849400,
    distributionPerToken: 2.40,
    propertyAppreciation: 4.8,
    totalReturn: 11.4,
  },
  {
    year: 2026,
    grossRentalIncome: 194811750,
    operatingExpenses: 31169880,
    netOperatingIncome: 163641870,
    distributionPerToken: 2.52,
    propertyAppreciation: 4.5,
    totalReturn: 11.0,
  },
  {
    year: 2027,
    grossRentalIncome: 204552338,
    operatingExpenses: 32728374,
    netOperatingIncome: 171823964,
    distributionPerToken: 2.64,
    propertyAppreciation: 4.2,
    totalReturn: 10.7,
  },
  {
    year: 2028,
    grossRentalIncome: 214779954,
    operatingExpenses: 34364793,
    netOperatingIncome: 180415162,
    distributionPerToken: 2.77,
    propertyAppreciation: 4.0,
    totalReturn: 10.5,
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function formatAED(amount: number): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getPropertyStatusColor(status: DubaiProperty['status']): string {
  const colors: Record<DubaiProperty['status'], string> = {
    'sourcing': 'gray',
    'due-diligence': 'yellow',
    'legal-structuring': 'orange',
    'regulatory-approval': 'blue',
    'token-issuance': 'purple',
    'live': 'green',
    'distributing': 'emerald',
  };
  return colors[status];
}

export function getPortfolioTotals() {
  const totals = DUBAI_PROPERTIES.reduce(
    (acc, prop) => ({
      valuationAED: acc.valuationAED + prop.valuationAED,
      valuationUSD: acc.valuationUSD + prop.valuationUSD,
      annualIncomeAED: acc.annualIncomeAED + prop.annualRentalIncomeAED,
      totalTokens: acc.totalTokens + prop.totalTokens,
      totalArea: acc.totalArea + prop.totalArea,
    }),
    { valuationAED: 0, valuationUSD: 0, annualIncomeAED: 0, totalTokens: 0, totalArea: 0 }
  );

  return {
    ...totals,
    avgYield: (totals.annualIncomeAED / totals.valuationAED) * 100,
    propertyCount: DUBAI_PROPERTIES.length,
  };
}
