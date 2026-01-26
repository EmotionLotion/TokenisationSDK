import { Router } from 'express';
import { db, chainDeployments, assets } from '../config/database.js';
import { eq, and } from 'drizzle-orm';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/errorHandler.js';
import { z } from 'zod';

export const chainRouter = Router();

// Chain configurations (public)
const SUPPORTED_CHAINS = [
  {
    chainId: 8453,
    name: 'Base',
    rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
    ccipRouter: '0x881e3A65B4d4a04dD529061dd0071cf975F58bCD',
    isDefault: true,
  },
  {
    chainId: 137,
    name: 'Polygon',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    explorerUrl: 'https://polygonscan.com',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18,
    },
    ccipRouter: '0x849c5ED5a80F5B408Dd4969b78c2C8fdf0565Bfe',
    isDefault: false,
  },
  {
    chainId: 1,
    name: 'Ethereum',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
    ccipRouter: '0x80226fc0Ee2b096224EeAc085Bb9a8cba1146f7D',
    isDefault: false,
  },
  // Testnets
  {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
    nativeCurrency: {
      name: 'Ethereum',
      symbol: 'ETH',
      decimals: 18,
    },
    ccipRouter: '0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93',
    isDefault: false,
    isTestnet: true,
  },
  {
    chainId: 80002,
    name: 'Polygon Amoy',
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    explorerUrl: 'https://amoy.polygonscan.com',
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18,
    },
    ccipRouter: '0x9C32fCB86BF0f4a1A8921a9Fe46de3198bb884B2',
    isDefault: false,
    isTestnet: true,
  },
];

// Chainlink Data Feed addresses by chain
const CHAINLINK_FEEDS: Record<number, Record<string, string>> = {
  8453: { // Base
    'ETH/USD': '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
    'BTC/USD': '0x64c911996D3c6aC71E9b8F11F8f4D7A9d5a8C1e4',
    'USDC/USD': '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B',
  },
  137: { // Polygon
    'ETH/USD': '0xF9680D99D6C9589e2a93a78A04A279e509205945',
    'BTC/USD': '0xc907E116054Ad103354f2D350FD2514433D57F6f',
    'USDC/USD': '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7',
    'MATIC/USD': '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
  },
  1: { // Ethereum
    'ETH/USD': '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
    'BTC/USD': '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
    'USDC/USD': '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6',
  },
};

// Deployment schema
const deploymentSchema = z.object({
  assetId: z.string().uuid(),
  contractType: z.enum(['ERC20', 'ERC721', 'ERC1155', 'SBT']),
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  deployTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  deployerAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  abi: z.array(z.any()).optional(),
});

// Get supported chains (public)
chainRouter.get('/', (_req, res) => {
  res.json({
    chains: SUPPORTED_CHAINS.map(chain => ({
      chainId: chain.chainId,
      name: chain.name,
      rpcUrl: chain.rpcUrl,
      explorerUrl: chain.explorerUrl,
      nativeCurrency: chain.nativeCurrency,
      isDefault: chain.isDefault,
      isTestnet: chain.isTestnet || false,
    })),
  });
});

// Get chain by ID (public)
chainRouter.get('/:chainId', (req, res, next) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const chain = SUPPORTED_CHAINS.find(c => c.chainId === chainId);

    if (!chain) {
      throw new NotFoundError('Chain');
    }

    res.json({
      ...chain,
      dataFeeds: CHAINLINK_FEEDS[chainId] || {},
    });
  } catch (error) {
    next(error);
  }
});

// Get Chainlink data feeds for a chain (public)
chainRouter.get('/:chainId/feeds', (req, res, next) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const feeds = CHAINLINK_FEEDS[chainId];

    if (!feeds) {
      throw new NotFoundError('Data feeds for this chain');
    }

    res.json({ chainId, feeds });
  } catch (error) {
    next(error);
  }
});

// Get deployments for a chain (public)
chainRouter.get('/:chainId/deployments', async (req, res, next) => {
  try {
    const chainId = parseInt(req.params.chainId);

    const deployments = await db.select({
      id: chainDeployments.id,
      assetId: chainDeployments.assetId,
      chainId: chainDeployments.chainId,
      chainName: chainDeployments.chainName,
      contractType: chainDeployments.contractType,
      contractAddress: chainDeployments.contractAddress,
      deployTxHash: chainDeployments.deployTxHash,
      verified: chainDeployments.verified,
      createdAt: chainDeployments.createdAt,
      assetName: assets.name,
    })
      .from(chainDeployments)
      .leftJoin(assets, eq(chainDeployments.assetId, assets.id))
      .where(eq(chainDeployments.chainId, chainId));

    res.json({ deployments });
  } catch (error) {
    next(error);
  }
});

// Get deployments for an asset (public)
chainRouter.get('/asset/:assetId', async (req, res, next) => {
  try {
    const { assetId } = req.params;

    const deployments = await db.query.chainDeployments.findMany({
      where: eq(chainDeployments.assetId, assetId),
    });

    res.json({ deployments });
  } catch (error) {
    next(error);
  }
});

// Create deployment (authenticated)
chainRouter.post('/:chainId/deployments', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const chainId = parseInt(req.params.chainId);
    const data = deploymentSchema.parse(req.body);

    // Check chain is supported
    const chain = SUPPORTED_CHAINS.find(c => c.chainId === chainId);
    if (!chain) {
      throw new NotFoundError('Chain');
    }

    // Check asset exists
    const asset = await db.query.assets.findFirst({
      where: eq(assets.id, data.assetId),
    });

    if (!asset) {
      throw new NotFoundError('Asset');
    }

    // Check permission
    if (asset.issuerId !== req.user?.partyId) {
      throw new ForbiddenError('Only the issuer can register deployments');
    }

    // Create deployment
    const [deployment] = await db.insert(chainDeployments).values({
      assetId: data.assetId,
      chainId,
      chainName: chain.name,
      contractType: data.contractType,
      contractAddress: data.contractAddress.toLowerCase(),
      deployTxHash: data.deployTxHash,
      deployerAddress: data.deployerAddress?.toLowerCase(),
      abi: data.abi,
    }).returning();

    res.status(201).json(deployment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new ValidationError(error.errors.map(e => e.message).join(', ')));
    } else {
      next(error);
    }
  }
});

// Mark deployment as verified (authenticated)
chainRouter.patch('/:chainId/deployments/:deploymentId/verify', authMiddleware, async (req: AuthRequest, res, next) => {
  try {
    const { deploymentId } = req.params;

    const deployment = await db.query.chainDeployments.findFirst({
      where: eq(chainDeployments.id, deploymentId),
    });

    if (!deployment) {
      throw new NotFoundError('Deployment');
    }

    const [updated] = await db.update(chainDeployments)
      .set({ verified: true })
      .where(eq(chainDeployments.id, deploymentId))
      .returning();

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// CCIP supported lanes
chainRouter.get('/ccip/lanes', (_req, res) => {
  const lanes = [
    { source: 8453, dest: 1, name: 'Base -> Ethereum' },
    { source: 1, dest: 8453, name: 'Ethereum -> Base' },
    { source: 137, dest: 1, name: 'Polygon -> Ethereum' },
    { source: 1, dest: 137, name: 'Ethereum -> Polygon' },
    { source: 8453, dest: 137, name: 'Base -> Polygon (via Ethereum)' },
    { source: 137, dest: 8453, name: 'Polygon -> Base (via Ethereum)' },
  ];

  res.json({ lanes });
});
