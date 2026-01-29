import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    {
      type: 'category',
      label: 'Getting Started',
      items: [
        'getting-started/INSTALLATION',
        'getting-started/QUICKSTART',
        'getting-started/FIRST_PROJECT',
      ],
    },
    {
      type: 'category',
      label: 'Core Concepts',
      items: [
        'CONCEPTS',
        'GLOSSARY',
        'ARCHITECTURE',
      ],
    },
    {
      type: 'category',
      label: 'API Reference',
      items: [
        'API_REFERENCE',
        'ONE_PAGE_SDK_REFERENCE',
        'AUTHENTICATION',
        'ERROR_REFERENCE',
        'api/SDK_API',
        'api/REST_API',
        'api/CONTRACTS',
        'api/MAINNET_COSTS',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/OVERVIEW',
        'architecture/LIFECYCLE',
        'architecture/SECURITY',
        'architecture/PLUGINS',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/SDK_USAGE',
        'guides/SERVER_SETUP',
        'guides/COMPLIANCE_SETUP',
        'guides/CHAINLINK_INTEGRATION',
        'guides/UI_KIT',
      ],
    },
    {
      type: 'category',
      label: 'Recipes',
      items: [
        'recipes/01-real-estate',
        'recipes/02-airline-tickets',
        'recipes/03-car-rental',
        'recipes/04-hotel-tickets',
        'recipes/05-concert-tickets',
      ],
    },
    {
      type: 'category',
      label: 'Deployment',
      items: [
        'deployment/DEPLOYMENT_RUNBOOK',
        'deployment/OPERATIONS_MANUAL',
        'deployment/TROUBLESHOOTING',
        'deployment/DEPLOYMENT_ADDRESSES',
      ],
    },
    {
      type: 'category',
      label: 'Security & Compliance',
      items: [
        'security/SMART_CONTRACT_AUDIT',
        'security/AUDIT_CHECKLIST',
        'security/DEPLOYMENT_SECURITY',
        'compliance/STANDARDS_MAPPING',
        'compliance/AUDIT_READINESS',
      ],
    },
    'FAQ',
  ],
};

export default sidebars;
