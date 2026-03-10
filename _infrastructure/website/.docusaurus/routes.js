import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/TokenisationSDK/docs',
    component: ComponentCreator('/TokenisationSDK/docs', '5ab'),
    routes: [
      {
        path: '/TokenisationSDK/docs',
        component: ComponentCreator('/TokenisationSDK/docs', 'd0d'),
        routes: [
          {
            path: '/TokenisationSDK/docs',
            component: ComponentCreator('/TokenisationSDK/docs', '201'),
            routes: [
              {
                path: '/TokenisationSDK/docs/api/AUTHENTICATION',
                component: ComponentCreator('/TokenisationSDK/docs/api/AUTHENTICATION', 'e64'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/api/REST_API',
                component: ComponentCreator('/TokenisationSDK/docs/api/REST_API', '572'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/api/SDK_REFERENCE',
                component: ComponentCreator('/TokenisationSDK/docs/api/SDK_REFERENCE', 'a02'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/ARCHITECTURE',
                component: ComponentCreator('/TokenisationSDK/docs/ARCHITECTURE', 'dc8'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/architecture/OVERVIEW',
                component: ComponentCreator('/TokenisationSDK/docs/architecture/OVERVIEW', '88f'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/CONCEPTS',
                component: ComponentCreator('/TokenisationSDK/docs/CONCEPTS', '2bf'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/deployment/DOCKER',
                component: ComponentCreator('/TokenisationSDK/docs/deployment/DOCKER', '720'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/deployment/KUBERNETES',
                component: ComponentCreator('/TokenisationSDK/docs/deployment/KUBERNETES', 'd44'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/FAQ',
                component: ComponentCreator('/TokenisationSDK/docs/FAQ', '0c1'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/getting-started/FIRST_PROJECT',
                component: ComponentCreator('/TokenisationSDK/docs/getting-started/FIRST_PROJECT', '37a'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/getting-started/INSTALLATION',
                component: ComponentCreator('/TokenisationSDK/docs/getting-started/INSTALLATION', '1f3'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/getting-started/QUICKSTART',
                component: ComponentCreator('/TokenisationSDK/docs/getting-started/QUICKSTART', 'b36'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/GLOSSARY',
                component: ComponentCreator('/TokenisationSDK/docs/GLOSSARY', 'b87'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/guides/BUILDING_REAL_ESTATE_APP',
                component: ComponentCreator('/TokenisationSDK/docs/guides/BUILDING_REAL_ESTATE_APP', 'ccb'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/guides/COMPLIANCE',
                component: ComponentCreator('/TokenisationSDK/docs/guides/COMPLIANCE', 'ef0'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/guides/REACT_INTEGRATION',
                component: ComponentCreator('/TokenisationSDK/docs/guides/REACT_INTEGRATION', 'c54'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/guides/REAL_ESTATE',
                component: ComponentCreator('/TokenisationSDK/docs/guides/REAL_ESTATE', '4ff'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/guides/WEBHOOKS',
                component: ComponentCreator('/TokenisationSDK/docs/guides/WEBHOOKS', 'e81'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/PLATFORM-DEVELOPER-GUIDE',
                component: ComponentCreator('/TokenisationSDK/docs/PLATFORM-DEVELOPER-GUIDE', 'b0c'),
                exact: true
              },
              {
                path: '/TokenisationSDK/docs/REAL_ESTATE_CONSOLIDATION_PLAN',
                component: ComponentCreator('/TokenisationSDK/docs/REAL_ESTATE_CONSOLIDATION_PLAN', '323'),
                exact: true
              },
              {
                path: '/TokenisationSDK/docs/recipes/AIRLINE_TICKETS',
                component: ComponentCreator('/TokenisationSDK/docs/recipes/AIRLINE_TICKETS', '092'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/recipes/CAR_RENTALS',
                component: ComponentCreator('/TokenisationSDK/docs/recipes/CAR_RENTALS', 'adb'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/recipes/CONCERT_TICKETS',
                component: ComponentCreator('/TokenisationSDK/docs/recipes/CONCERT_TICKETS', 'f10'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/recipes/HOTEL_RESERVATIONS',
                component: ComponentCreator('/TokenisationSDK/docs/recipes/HOTEL_RESERVATIONS', '20e'),
                exact: true,
                sidebar: "docs"
              },
              {
                path: '/TokenisationSDK/docs/security/SECURITY_AUDIT_CHECKLIST',
                component: ComponentCreator('/TokenisationSDK/docs/security/SECURITY_AUDIT_CHECKLIST', 'f9c'),
                exact: true
              },
              {
                path: '/TokenisationSDK/docs/security/SECURITY_MODEL',
                component: ComponentCreator('/TokenisationSDK/docs/security/SECURITY_MODEL', '896'),
                exact: true,
                sidebar: "docs"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    path: '/TokenisationSDK/',
    component: ComponentCreator('/TokenisationSDK/', '41a'),
    exact: true
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
