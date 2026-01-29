#!/usr/bin/env node

import { Command } from 'commander';
import { select, input, confirm } from '@inquirer/prompts';
import * as fs from 'fs-extra';
import * as path from 'path';

interface ChainConfig {
  name: string;
  chainId: number;
  rpcEnvVar: string;
  testnet?: { name: string; chainId: number };
}

interface ProjectConfig {
  projectName: string;
  assetType: string;
  chain: ChainConfig;
  compliance: string;
  tokenStandard: string;
  includeServer: boolean;
  includeUi: boolean;
}

const CHAINS: Record<string, ChainConfig> = {
  base: {
    name: 'Base',
    chainId: 8453,
    rpcEnvVar: 'BASE_RPC_URL',
    testnet: { name: 'Base Sepolia', chainId: 84532 },
  },
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    rpcEnvVar: 'ETH_RPC_URL',
    testnet: { name: 'Sepolia', chainId: 11155111 },
  },
  polygon: {
    name: 'Polygon',
    chainId: 137,
    rpcEnvVar: 'POLYGON_RPC_URL',
    testnet: { name: 'Polygon Mumbai', chainId: 80001 },
  },
  arbitrum: {
    name: 'Arbitrum',
    chainId: 42161,
    rpcEnvVar: 'ARBITRUM_RPC_URL',
    testnet: { name: 'Arbitrum Sepolia', chainId: 421614 },
  },
};

async function promptUser(): Promise<ProjectConfig> {
  const projectName = await input({
    message: 'Project name:',
    default: 'my-tokenised-asset',
    validate: (v) => /^[a-z0-9-]+$/.test(v) || 'Use lowercase letters, numbers, and hyphens only',
  });

  const assetType = await select({
    message: 'Asset type:',
    choices: [
      { name: 'Real Estate — Property tokenization with rental income', value: 'real-estate' },
      { name: 'Securities — Fund shares, equity, debt instruments', value: 'securities' },
      { name: 'Tickets — Event tickets, airline, hotel reservations', value: 'tickets' },
      { name: 'Custom — Start from scratch', value: 'custom' },
    ],
  });

  const chainKey = await select({
    message: 'Primary blockchain:',
    choices: [
      { name: 'Base (recommended — low fees, Coinbase ecosystem)', value: 'base' },
      { name: 'Ethereum (mainnet — highest security)', value: 'ethereum' },
      { name: 'Polygon (low fees, wide adoption)', value: 'polygon' },
      { name: 'Arbitrum (Ethereum L2, fast finality)', value: 'arbitrum' },
    ],
  });

  const compliance = await select({
    message: 'Compliance preset:',
    choices: [
      { name: 'US Accredited — SEC Reg D / Reg S', value: 'us-accredited' },
      { name: 'UAE DIFC — Dubai financial center rules', value: 'uae-difc' },
      { name: 'EU MiCA — Markets in Crypto-Assets', value: 'eu-mica' },
      { name: 'Global — Multi-jurisdiction with country whitelist', value: 'global' },
      { name: 'None — No compliance rules (testing only)', value: 'none' },
    ],
  });

  const tokenStandard = await select({
    message: 'Token standard:',
    choices: [
      { name: 'ERC-3643 (recommended — full compliance)', value: 'ERC3643' },
      { name: 'ERC-20 (simple fungible token)', value: 'ERC20' },
      { name: 'ERC-721 (NFT — unique assets)', value: 'ERC721' },
      { name: 'ERC-1155 (multi-token)', value: 'ERC1155' },
    ],
  });

  const includeServer = await confirm({
    message: 'Include API server?',
    default: true,
  });

  const includeUi = await confirm({
    message: 'Include React dashboard?',
    default: false,
  });

  return {
    projectName,
    assetType,
    chain: CHAINS[chainKey],
    compliance,
    tokenStandard,
    includeServer,
    includeUi,
  };
}

function generatePackageJson(config: ProjectConfig): string {
  const deps: Record<string, string> = {
    '@tokenisation/sdk': '^1.0.0',
    dotenv: '^16.0.0',
  };
  if (config.includeServer) {
    deps['express'] = '^4.18.0';
    deps['cors'] = '^2.8.0';
  }

  return JSON.stringify(
    {
      name: config.projectName,
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'ts-node src/index.ts',
        build: 'tsc',
        start: 'node dist/index.js',
      },
      dependencies: deps,
      devDependencies: {
        '@types/node': '^20.0.0',
        'ts-node': '^10.9.0',
        typescript: '^5.3.0',
      },
    },
    null,
    2,
  );
}

function generateEnvFile(config: ProjectConfig): string {
  const lines = [
    '# Tokenisation SDK Configuration',
    `# Generated for: ${config.assetType} on ${config.chain.name}`,
    '',
    '# API Key (get from your platform dashboard)',
    'TOKENISATION_API_KEY=sk_test_your-key-here',
    '',
    '# Blockchain RPC',
    `${config.chain.rpcEnvVar}=https://rpc.example.com`,
    '',
    '# Deployer wallet (NEVER commit this)',
    'DEPLOYER_PRIVATE_KEY=',
    '',
  ];

  if (config.includeServer) {
    lines.push('# Server', 'PORT=3001', 'NODE_ENV=development', '');
  }

  return lines.join('\n');
}

function generateMainFile(config: ProjectConfig): string {
  return `import { createApiClient } from '@tokenisation/sdk';
import 'dotenv/config';

const client = createApiClient({
  apiKey: process.env.TOKENISATION_API_KEY!,
});

async function main() {
  console.log('Tokenisation SDK — ${config.assetType} project');
  console.log('Chain: ${config.chain.name} (${config.chain.chainId})');
  console.log('Standard: ${config.tokenStandard}');
  console.log('Compliance: ${config.compliance}');
  console.log('');

  // Step 1: Create asset
  const asset = await client.assets.create({
    name: '${config.projectName}',
    rightType: 'OWNERSHIP',
    jurisdiction: { countryCode: 'US' },
  });
  console.log('Asset created:', asset.id);

  // Step 2: Create token
  const token = await client.tokens.create({
    name: '${config.projectName} Token',
    symbol: '${config.projectName.replace(/-/g, '').slice(0, 5).toUpperCase()}',
    chainId: ${config.chain.chainId},
    assetId: asset.id,
  });
  console.log('Token created:', token.id);

  // Step 3: Create investor
  const investor = await client.investors.create({
    email: 'investor@example.com',
    jurisdiction: 'US',
  });
  console.log('Investor created:', investor.id);

  console.log('\\nReady! Next steps:');
  console.log('1. Deploy token: await client.tokens.deploy(token.id)');
  console.log('2. Issue tokens: await client.tokens.issue(token.id, { ... })');
  console.log('3. Transfer: await client.transfers.create({ ... })');
}

main().catch(console.error);
`;
}

function generateTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        outDir: 'dist',
        rootDir: 'src',
        strict: true,
        esModuleInterop: true,
        declaration: true,
      },
      include: ['src'],
    },
    null,
    2,
  );
}

function generateReadme(config: ProjectConfig): string {
  return [
    `# ${config.projectName}`,
    ``,
    `Generated with [create-tokenised-asset](https://github.com/EmotionLotion/TokenisationSDK)`,
    ``,
    `## Configuration`,
    ``,
    `| Setting | Value |`,
    `|---------|-------|`,
    `| Asset Type | ${config.assetType} |`,
    `| Chain | ${config.chain.name} (${config.chain.chainId}) |`,
    `| Token Standard | ${config.tokenStandard} |`,
    `| Compliance | ${config.compliance} |`,
    ``,
    `## Getting Started`,
    ``,
    '```bash',
    `npm install`,
    `npm run dev`,
    '```',
    ``,
    `## Documentation`,
    ``,
    `- [Tokenisation SDK](https://github.com/EmotionLotion/TokenisationSDK)`,
    `- [Quick Start](https://github.com/EmotionLotion/TokenisationSDK/blob/main/docs/getting-started/QUICKSTART.md)`,
    `- [API Reference](https://github.com/EmotionLotion/TokenisationSDK/blob/main/docs/API_REFERENCE.md)`,
  ].join('\n');
}

async function scaffoldProject(config: ProjectConfig) {
  const projectDir = path.resolve(process.cwd(), config.projectName);

  console.log(`\nCreating project in ${projectDir}...\n`);

  // Create directories
  await fs.ensureDir(path.join(projectDir, 'src'));

  // Write files
  await fs.writeFile(path.join(projectDir, 'package.json'), generatePackageJson(config));
  await fs.writeFile(path.join(projectDir, 'tsconfig.json'), generateTsConfig());
  await fs.writeFile(path.join(projectDir, 'src', 'index.ts'), generateMainFile(config));
  await fs.writeFile(path.join(projectDir, '.env'), generateEnvFile(config));
  await fs.writeFile(path.join(projectDir, '.gitignore'), 'node_modules\ndist\n.env\n');
  await fs.writeFile(path.join(projectDir, 'README.md'), generateReadme(config));

  console.log('Project created successfully!\n');
  console.log('Next steps:');
  console.log(`  cd ${config.projectName}`);
  console.log('  npm install');
  console.log('  npm run dev');
  console.log('');
  console.log('Documentation: https://github.com/EmotionLotion/TokenisationSDK');
}

const program = new Command();

program
  .name('create-tokenised-asset')
  .description('Scaffold a new tokenized asset project')
  .version('1.0.0')
  .action(async () => {
    console.log('\n  Tokenisation SDK — Project Scaffolder\n');
    console.log('  Create a new tokenized asset project with compliance,');
    console.log('  governance, and multi-chain support built in.\n');

    const config = await promptUser();
    await scaffoldProject(config);
  });

program.parse();
