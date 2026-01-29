import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'Tokenisation SDK',
  tagline: 'The Stripe of Real-World Asset Tokenization',
  favicon: 'img/favicon.ico',
  url: 'https://emotionlotion.github.io',
  baseUrl: '/TokenisationSDK/',
  organizationName: 'EmotionLotion',
  projectName: 'TokenisationSDK',
  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },
  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          path: '../docs',
          editUrl: 'https://github.com/EmotionLotion/TokenisationSDK/tree/main/website/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    navbar: {
      title: 'Tokenisation SDK',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/EmotionLotion/TokenisationSDK',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Quick Start', to: '/docs/getting-started/QUICKSTART' },
            { label: 'API Reference', to: '/docs/API_REFERENCE' },
            { label: 'SDK Reference', to: '/docs/ONE_PAGE_SDK_REFERENCE' },
          ],
        },
        {
          title: 'Resources',
          items: [
            { label: 'GitHub', href: 'https://github.com/EmotionLotion/TokenisationSDK' },
            { label: 'Changelog', to: '/docs/CHANGELOG' },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Tokenisation SDK. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['solidity', 'bash', 'json', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
