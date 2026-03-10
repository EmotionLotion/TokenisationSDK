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
        'api/SDK_REFERENCE',
        'api/REST_API',
        'api/AUTHENTICATION',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/OVERVIEW',
      ],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/BUILDING_REAL_ESTATE_APP',
        'guides/REAL_ESTATE',
        'guides/REACT_INTEGRATION',
        'guides/COMPLIANCE',
        'guides/WEBHOOKS',
      ],
    },
    {
      type: 'category',
      label: 'Recipes',
      items: [
        'recipes/AIRLINE_TICKETS',
        'recipes/CAR_RENTALS',
        'recipes/CONCERT_TICKETS',
        'recipes/HOTEL_RESERVATIONS',
      ],
    },
    {
      type: 'category',
      label: 'Deployment',
      items: [
        'deployment/DOCKER',
        'deployment/KUBERNETES',
      ],
    },
    {
      type: 'category',
      label: 'Security',
      items: [
        'security/SECURITY_MODEL',
      ],
    },
    'FAQ',
  ],
};

export default sidebars;
