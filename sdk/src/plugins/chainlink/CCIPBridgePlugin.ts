/**
 * Chainlink CCIP Bridge Plugin
 *
 * Enables cross-chain token transfers using Chainlink's Cross-Chain Interoperability Protocol.
 * Supports transfers between Base, Polygon, and Ethereum.
 */

import { ethers, type Provider, type Signer } from 'ethers';
import { ok, err, type Result } from '../../core/types.js';
import { chainRegistry, type ChainConfig } from '../chain/ChainRegistry.js';
import { ValidationError, ErrorCode } from '../../errors/index.js';

// CCIP Router ABI (minimal)
const CCIP_ROUTER_ABI = [
  'function ccipSend(uint64 destinationChainSelector, tuple(bytes receiver, bytes data, tuple(address token, uint256 amount)[] tokenAmounts, address feeToken, bytes extraArgs) message) external payable returns (bytes32)',
  'function getFee(uint64 destinationChainSelector, tuple(bytes receiver, bytes data, tuple(address token, uint256 amount)[] tokenAmounts, address feeToken, bytes extraArgs) message) external view returns (uint256)',
  'function isChainSupported(uint64 chainSelector) external view returns (bool)',
  'function getSupportedTokens(uint64 chainSelector) external view returns (address[])',
];

// ERC20 ABI (minimal)
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
];

export interface CCIPBridgeConfig {
  sourceChainId: number;
  rpcUrl: string;
  /**
   * @deprecated Use `connectSigner()` with an external Signer (Fireblocks, Ledger, AWS KMS) instead.
   * Raw private keys should never be hardcoded or stored in .env files in production.
   */
  privateKey?: string;
}

export interface CCIPMessage {
  receiver: string;
  data?: string;
  tokenAmounts: Array<{ token: string; amount: string }>;
  feeToken?: string; // address(0) for native token
  extraArgs?: string;
}

export interface CCIPTransferParams {
  destChainId: number;
  receiver: string;
  token: string;
  amount: string;
  data?: string;
  gasLimit?: number;
}

export interface CCIPTransferResult {
  messageId: string;
  txHash: string;
  sourceChainId: number;
  destChainId: number;
  fee: string;
}

/**
 * Encode EVMExtraArgsV1 for CCIP messages.
 * Tag: 0x97a657c9 (bytes4 selector for EVMExtraArgsV1)
 * If no gasLimit is provided, returns '0x' (use destination chain default).
 */
function encodeExtraArgs(gasLimit?: number): string {
  if (gasLimit === undefined) {
    return '0x';
  }
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [gasLimit]);
  return '0x97a657c9' + encoded.slice(2);
}

export class CCIPBridgePlugin {
  readonly pluginId = 'chainlink-ccip';

  private sourceChain: ChainConfig;
  private provider: Provider;
  private signer: Signer | null = null;
  private routerAddress: string;

  constructor(config: CCIPBridgeConfig) {
    const sourceChain = chainRegistry.get(config.sourceChainId);
    if (!sourceChain) {
      throw new ValidationError(`Source chain ${config.sourceChainId} not found in registry`, {
        field: 'sourceChainId',
        constraints: { validChain: 'Chain must be registered in ChainRegistry' },
      });
    }
    if (!sourceChain.ccipRouter) {
      throw new ValidationError(`CCIP not supported on chain ${config.sourceChainId}`, {
        field: 'sourceChainId',
        constraints: { ccipSupport: 'Chain must have ccipRouter configured' },
      });
    }

    this.sourceChain = sourceChain;
    this.routerAddress = sourceChain.ccipRouter;
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, config.sourceChainId);

    if (config.privateKey) {
      console.warn(
        '[CCIPBridgePlugin] WARNING: Using raw privateKey is deprecated and insecure for production. ' +
        'Use connectSigner() with an external Signer (Fireblocks, Ledger, AWS KMS) instead.'
      );
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
    }
  }

  async estimateFee(params: CCIPTransferParams): Promise<Result<string, string>> {
    try {
      const destChain = chainRegistry.get(params.destChainId);
      if (!destChain?.ccipChainSelector) {
        return err(`Destination chain ${params.destChainId} does not support CCIP`);
      }

      const router = new ethers.Contract(this.routerAddress, CCIP_ROUTER_ABI, this.provider);

      const message: CCIPMessage = {
        receiver: ethers.AbiCoder.defaultAbiCoder().encode(['address'], [params.receiver]),
        data: params.data || '0x',
        tokenAmounts: [{
          token: params.token,
          amount: params.amount,
        }],
        feeToken: ethers.ZeroAddress, // Pay in native token
        extraArgs: encodeExtraArgs(params.gasLimit),
      };

      const fee = await router.getFee(destChain.ccipChainSelector, message);
      return ok(fee.toString());
    } catch (error) {
      return err(`Fee estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async bridgeTokens(params: CCIPTransferParams): Promise<Result<CCIPTransferResult, string>> {
    if (!this.signer) {
      return err('No signer configured. Provide a privateKey to bridge tokens.');
    }

    try {
      const destChain = chainRegistry.get(params.destChainId);
      if (!destChain?.ccipChainSelector) {
        return err(`Destination chain ${params.destChainId} does not support CCIP`);
      }

      // Get fee estimate
      const feeResult = await this.estimateFee(params);
      if (!feeResult.success) {
        return err(feeResult.error);
      }
      const fee = BigInt(feeResult.data);

      // Approve token spending
      const token = new ethers.Contract(params.token, ERC20_ABI, this.signer);
      const currentAllowance = await token.allowance(await this.signer.getAddress(), this.routerAddress);

      if (BigInt(currentAllowance.toString()) < BigInt(params.amount)) {
        const approveTx = await token.approve(this.routerAddress, params.amount);
        await approveTx.wait();
      }

      // Build CCIP message
      const message: CCIPMessage = {
        receiver: ethers.AbiCoder.defaultAbiCoder().encode(['address'], [params.receiver]),
        data: params.data || '0x',
        tokenAmounts: [{
          token: params.token,
          amount: params.amount,
        }],
        feeToken: ethers.ZeroAddress,
        extraArgs: encodeExtraArgs(params.gasLimit),
      };

      // Send CCIP message
      const router = new ethers.Contract(this.routerAddress, CCIP_ROUTER_ABI, this.signer);
      const tx = await router.ccipSend(destChain.ccipChainSelector, message, { value: fee });
      const receipt = await tx.wait();

      // Extract messageId from the CCIPMessageSent event.
      // The CCIP Router emits CCIPMessageSent(bytes32 indexed messageId, ...).
      // We match by event signature instead of assuming log index, because
      // token approval/transfer events often appear before the CCIP event.
      const ccipMessageSentTopic = ethers.id('CCIPMessageSent(bytes32,uint64,address,tuple,uint256)');
      const ccipSendRequestedTopic = ethers.id('CCIPSendRequested(bytes32)');
      const messageSentLog = receipt.logs.find(
        (log: ethers.Log) =>
          log.topics[0] === ccipMessageSentTopic ||
          log.topics[0] === ccipSendRequestedTopic
      );
      const messageId = messageSentLog?.topics[1] || receipt.hash;

      return ok({
        messageId,
        txHash: receipt.hash,
        sourceChainId: this.sourceChain.chainId,
        destChainId: params.destChainId,
        fee: fee.toString(),
      });
    } catch (error) {
      return err(`Bridge failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async isChainSupported(destChainId: number): Promise<boolean> {
    try {
      const destChain = chainRegistry.get(destChainId);
      if (!destChain?.ccipChainSelector) {
        return false;
      }

      const router = new ethers.Contract(this.routerAddress, CCIP_ROUTER_ABI, this.provider);
      return router.isChainSupported(destChain.ccipChainSelector);
    } catch {
      return false;
    }
  }

  async getSupportedTokens(destChainId: number): Promise<string[]> {
    try {
      const destChain = chainRegistry.get(destChainId);
      if (!destChain?.ccipChainSelector) {
        return [];
      }

      const router = new ethers.Contract(this.routerAddress, CCIP_ROUTER_ABI, this.provider);
      return router.getSupportedTokens(destChain.ccipChainSelector);
    } catch {
      return [];
    }
  }

  getSupportedLanes(): Array<{ source: number; dest: number; name: string }> {
    const lanes: Array<{ source: number; dest: number; name: string }> = [];
    const chains = chainRegistry.getMainnets();

    for (const source of chains) {
      for (const dest of chains) {
        if (source.chainId !== dest.chainId && chainRegistry.isCCIPSupported(source.chainId, dest.chainId)) {
          lanes.push({
            source: source.chainId,
            dest: dest.chainId,
            name: `${source.name} -> ${dest.name}`,
          });
        }
      }
    }

    return lanes;
  }

  getExplorerUrl(txHash: string): string {
    return `${this.sourceChain.explorerUrl}/tx/${txHash}`;
  }

  getCCIPExplorerUrl(messageId: string): string {
    return `https://ccip.chain.link/msg/${messageId}`;
  }

  // Connect with an external signer
  connectSigner(signer: Signer): void {
    this.signer = signer;
  }

  /**
   * Destroy the plugin, removing all event listeners from the provider.
   */
  destroy(): void {
    (this.provider as ethers.JsonRpcProvider).removeAllListeners?.();
  }
}

// Factory functions
export function createCCIPBridgePlugin(config: CCIPBridgeConfig): CCIPBridgePlugin {
  return new CCIPBridgePlugin(config);
}

export function createBaseCCIPBridge(rpcUrl?: string, privateKey?: string): CCIPBridgePlugin {
  return new CCIPBridgePlugin({
    sourceChainId: 8453,
    rpcUrl: rpcUrl || 'https://mainnet.base.org',
    privateKey,
  });
}

export function createPolygonCCIPBridge(rpcUrl?: string, privateKey?: string): CCIPBridgePlugin {
  return new CCIPBridgePlugin({
    sourceChainId: 137,
    rpcUrl: rpcUrl || 'https://polygon-rpc.com',
    privateKey,
  });
}

export function createEthereumCCIPBridge(rpcUrl?: string, privateKey?: string): CCIPBridgePlugin {
  return new CCIPBridgePlugin({
    sourceChainId: 1,
    rpcUrl: rpcUrl || 'https://eth.llamarpc.com',
    privateKey,
  });
}

export default CCIPBridgePlugin;
