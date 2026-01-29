import clsx from 'clsx';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import Link from '@docusaurus/Link';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary')} style={{padding: '4rem 0'}}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div style={{display: 'flex', gap: '1rem', justifyContent: 'center'}}>
          <Link className="button button--secondary button--lg" to="/docs/getting-started/QUICKSTART">
            Quick Start
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/ONE_PAGE_SDK_REFERENCE">
            SDK Reference
          </Link>
          <Link className="button button--secondary button--lg" to="/docs/API_REFERENCE">
            API Reference
          </Link>
        </div>
      </div>
    </header>
  );
}

const features = [
  {
    title: 'Stripe-like SDK',
    description: 'Create assets, onboard investors, deploy tokens, and execute transfers with a clean TypeScript API.',
  },
  {
    title: 'Built-in Compliance',
    description: 'ERC-3643 (T-REX) compliant with KYC, country whitelists, holder limits, and time locks.',
  },
  {
    title: 'Multi-Chain',
    description: 'Deploy to Ethereum, Polygon, Base, Arbitrum with upgradeable UUPS proxy contracts.',
  },
  {
    title: 'Chainlink Powered',
    description: 'Price feeds, automation, CCIP cross-chain, and Proof of Reserve integrations.',
  },
  {
    title: 'Production Ready',
    description: 'PostgreSQL, Redis rate limiting, OpenTelemetry, Docker, Kubernetes, and Terraform.',
  },
  {
    title: 'Use Case Templates',
    description: 'Pre-built packs for real estate, airline tickets, car rental, hotel, and concert tokens.',
  },
];

export default function Home(): JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <HomepageHeader />
      <main style={{padding: '2rem 0'}}>
        <div className="container">
          <div className="row">
            {features.map((feature, idx) => (
              <div key={idx} className={clsx('col col--4')} style={{marginBottom: '2rem'}}>
                <div className="text--center padding-horiz--md">
                  <Heading as="h3">{feature.title}</Heading>
                  <p>{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </Layout>
  );
}
