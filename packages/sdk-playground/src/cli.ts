#!/usr/bin/env node

/**
 * Tokenisation SDK Playground
 *
 * Zero-friction demo for real-estate tokenization.
 * Uses the existing UI showcase components.
 * Run with: npx @tokenisation/sdk-playground
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamic imports for ESM-only packages
async function main() {
  const chalk = (await import('chalk')).default;
  const ora = (await import('ora')).default;
  const open = (await import('open')).default;
  const getPort = (await import('get-port')).default;

  console.log(chalk.bold.yellow(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🏠 Tokenisation SDK Playground                           ║
║   Real Estate Tokenization Demo                            ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `));

  // Detect if we're running in the monorepo or as an npx package
  const monorepoRoot = path.resolve(__dirname, '..', '..', '..');
  const uiDistPath = path.join(monorepoRoot, 'ui', 'dist');
  const uiPackagePath = path.join(monorepoRoot, 'ui');
  const bundledUIPath = path.join(__dirname, '..', 'public');

  const isMonorepo = existsSync(path.join(monorepoRoot, 'package.json')) &&
                     existsSync(uiPackagePath);

  let staticDir: string;

  if (isMonorepo) {
    // Running in monorepo - use or build the UI
    const spinner = ora('Checking UI build...').start();

    if (!existsSync(path.join(uiDistPath, 'index.html'))) {
      spinner.text = 'Building UI (first time setup)...';

      try {
        await new Promise<void>((resolve, reject) => {
          const buildProcess = spawn('npm', ['run', 'build'], {
            cwd: uiPackagePath,
            stdio: 'pipe',
            shell: true,
          });

          buildProcess.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Build failed with code ${code}`));
          });

          buildProcess.on('error', reject);
        });
        spinner.succeed(chalk.green('UI built successfully!'));
      } catch (err) {
        spinner.fail(chalk.red('Failed to build UI'));
        console.error(err);
        process.exit(1);
      }
    } else {
      spinner.succeed(chalk.green('UI build found!'));
    }

    staticDir = uiDistPath;
  } else {
    // Running as npx package - use bundled UI
    staticDir = bundledUIPath;
  }

  const spinner = ora('Starting playground server...').start();

  const app = express();

  // Serve static files
  app.use(express.static(staticDir));
  app.use(express.json());

  // Mock API endpoints for standalone playground mode
  const mockState = {
    assets: [] as any[],
    tokens: [] as any[],
    investors: [] as any[],
    transfers: [] as any[],
    parties: [] as any[],
  };

  // Initialize with demo data
  initializeMockData(mockState);

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', mode: 'playground' });
  });

  // Assets
  app.get('/api/v1/assets', (_req, res) => {
    res.json({ assets: mockState.assets });
  });

  app.post('/api/v1/assets', (req, res) => {
    const asset = {
      id: `asset-${Date.now()}`,
      ...req.body,
      state: 'DRAFT',
      createdAt: new Date().toISOString(),
    };
    mockState.assets.push(asset);
    res.status(201).json({ asset });
  });

  app.post('/api/v1/assets/:id/transition', (req, res) => {
    const asset = mockState.assets.find(a => a.id === req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    asset.state = req.body.toState;
    res.json({ asset, newState: req.body.toState });
  });

  // Tokens
  app.get('/api/v1/tokens', (_req, res) => {
    res.json({ tokens: mockState.tokens });
  });

  app.post('/api/v1/tokens', (req, res) => {
    const token = {
      id: `token-${Date.now()}`,
      ...req.body,
      address: `0x${Math.random().toString(16).slice(2, 42)}`,
      totalSupply: '0',
      deployedAt: new Date().toISOString(),
    };
    mockState.tokens.push(token);
    res.status(201).json({ token });
  });

  app.post('/api/v1/tokens/:id/mint', (req, res) => {
    const token = mockState.tokens.find(t => t.id === req.params.id);
    if (!token) return res.status(404).json({ error: 'Token not found' });
    const currentSupply = BigInt(token.totalSupply || '0');
    const mintAmount = BigInt(req.body.amount);
    token.totalSupply = (currentSupply + mintAmount).toString();

    // Record the investor holding
    const investor = mockState.investors.find(i => i.wallet === req.body.to);
    if (investor) {
      investor.balance = (BigInt(investor.balance || '0') + mintAmount).toString();
    }

    res.json({
      token,
      txHash: `0x${Math.random().toString(16).slice(2, 66)}`,
      minted: req.body.amount
    });
  });

  // Investors / Parties
  app.get('/api/v1/investors', (_req, res) => {
    res.json({ investors: mockState.investors });
  });

  app.post('/api/v1/investors', (req, res) => {
    const investor = {
      id: `inv-${Date.now()}`,
      ...req.body,
      kycStatus: 'VERIFIED',
      balance: '0',
      createdAt: new Date().toISOString(),
    };
    mockState.investors.push(investor);
    res.status(201).json({ investor });
  });

  // Transfers
  app.get('/api/v1/transfers', (_req, res) => {
    res.json({ transfers: mockState.transfers });
  });

  app.post('/api/v1/transfers', (req, res) => {
    const transfer = {
      id: `txf-${Date.now()}`,
      ...req.body,
      status: 'COMPLETED',
      txHash: `0x${Math.random().toString(16).slice(2, 66)}`,
      createdAt: new Date().toISOString(),
    };
    mockState.transfers.push(transfer);

    // Update balances
    const fromInvestor = mockState.investors.find(i => i.wallet === req.body.from);
    const toInvestor = mockState.investors.find(i => i.wallet === req.body.to);
    const amount = BigInt(req.body.amount);

    if (fromInvestor) {
      fromInvestor.balance = (BigInt(fromInvestor.balance || '0') - amount).toString();
    }
    if (toInvestor) {
      toInvestor.balance = (BigInt(toInvestor.balance || '0') + amount).toString();
    }

    res.status(201).json({ transfer });
  });

  // Cap Table
  app.get('/api/v1/tokens/:id/cap-table', (req, res) => {
    const token = mockState.tokens.find(t => t.id === req.params.id);
    if (!token) return res.status(404).json({ error: 'Token not found' });

    const holders = mockState.investors
      .filter(i => BigInt(i.balance || '0') > 0n)
      .map(i => ({
        investor: i,
        balance: i.balance,
        percentage: token.totalSupply !== '0'
          ? ((BigInt(i.balance) * 10000n) / BigInt(token.totalSupply)).toString()
          : '0',
      }));

    res.json({
      token,
      totalSupply: token.totalSupply,
      holders
    });
  });

  // Property Management
  app.get('/api/v1/properties/:assetId/summary', (req, res) => {
    res.json({
      summary: {
        assetId: req.params.assetId,
        totalUnits: 24,
        occupiedUnits: 20,
        vacantUnits: 3,
        maintenanceUnits: 1,
        reservedUnits: 0,
        occupancyRate: 83.33,
        totalMonthlyRent: 180000,
        maintenanceOpen: 3,
        maintenanceInProgress: 2,
        maintenanceCompleted: 45,
        totalExpenses: 35000,
        expenseCurrency: 'AED',
      }
    });
  });

  // Serve the SPA for all other routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });

  // Find available port and start server
  const port = await getPort({ port: [3333, 3334, 3335, 3336, 3337] });

  app.listen(port, () => {
    spinner.succeed(chalk.green('Playground server started!'));

    const url = `http://localhost:${port}/showcase/real-estate`;

    console.log(`
${chalk.dim('─────────────────────────────────────────────────────────')}

  ${chalk.bold('Playground running at:')} ${chalk.cyan.underline(url)}

  ${chalk.dim('Features:')}
  ${chalk.yellow('•')} Real Estate: Full tokenization flow with Dubai property
  ${chalk.yellow('•')} Airline: Ticket tokenization with boarding passes
  ${chalk.yellow('•')} Car Rental: Vehicle sharing with time-based tokens
  ${chalk.yellow('•')} Hotel: Room booking with NFT keys
  ${chalk.yellow('•')} Concert: Event tickets with resale controls

  ${chalk.dim('No wallet required - uses in-browser simulation')}

${chalk.dim('─────────────────────────────────────────────────────────')}

  Press ${chalk.bold('Ctrl+C')} to stop the server

`);

    // Auto-open browser
    open(url);
  });
}

function initializeMockData(state: any) {
  // Pre-create some demo investors with mock wallets
  state.investors = [
    {
      id: 'inv-1',
      name: 'Ahmed Al Maktoum',
      email: 'ahmed@example.ae',
      wallet: '0x1234567890123456789012345678901234567890',
      jurisdiction: 'AE',
      type: 'INDIVIDUAL',
      kycStatus: 'VERIFIED',
      balance: '0',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'inv-2',
      name: 'Sarah Johnson',
      email: 'sarah@example.com',
      wallet: '0x2345678901234567890123456789012345678901',
      jurisdiction: 'US',
      type: 'INDIVIDUAL',
      kycStatus: 'VERIFIED',
      balance: '0',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'inv-3',
      name: 'Dubai Properties LLC',
      email: 'invest@dubaiproperties.ae',
      wallet: '0x3456789012345678901234567890123456789012',
      jurisdiction: 'AE',
      type: 'INSTITUTION',
      kycStatus: 'VERIFIED',
      balance: '0',
      createdAt: new Date().toISOString(),
    },
  ];
}

main().catch(console.error);
