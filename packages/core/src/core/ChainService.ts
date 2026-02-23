
import {
    createPublicClient,
    createWalletClient,
    http,
    type PublicClient,
    type WalletClient,
    type Account,
    type Hash,
    type Address,
    parseEther,
    createTestClient,
    type Chain
} from 'viem';
import { mainnet, sepolia, anvil } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { Result, ok, err } from './types.js'; // Assuming types.js exists in core

// ============================================================================
// SECURITY: Browser Environment Detection
// ============================================================================

/**
 * Detects if code is running in a browser environment
 * @returns true if running in a browser
 */
function isBrowserEnvironment(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.document !== 'undefined'
    );
}

/**
 * Security error thrown when attempting to use private keys in browser
 */
export class ClientSideKeyError extends Error {
    constructor() {
        super(
            'SECURITY ERROR: Private keys must NEVER be used in browser environments. ' +
            'This would expose your keys to potential attackers. Instead, use one of these secure alternatives:\n' +
            '  1. WalletConnect or injected wallet (MetaMask, etc.) for user transactions\n' +
            '  2. Server-side signing with a custody provider (Fireblocks, BitGo)\n' +
            '  3. Meta-transactions with a relayer service\n' +
            '  4. Session keys with limited permissions\n\n' +
            'See: https://docs.tokenisation.io/security/key-management'
        );
        this.name = 'ClientSideKeyError';
    }
}

export interface ChainConnectionConfig {
    chainId: number;
    rpcUrl: string;
    /**
     * Private key for signing transactions.
     * @security NEVER use in browser environments - will throw ClientSideKeyError.
     * Use WalletConnect, injected wallets, or server-side signing instead.
     */
    privateKey?: string;
    relayerUrl?: string; // Optional: For meta-transactions
    /**
     * Bypass browser security check (for testing only).
     * @internal This should NEVER be used in production code.
     */
    _dangerouslyAllowBrowserKeys?: boolean;
}

export class ChainService {
    private publicClient: PublicClient;
    private walletClient?: WalletClient;
    private account?: Account;
    private chain: Chain;

    /**
     * Check if the current environment supports direct private key usage.
     * @returns true if running in Node.js (server-side), false if in browser
     */
    static canUsePrivateKeys(): boolean {
        return !isBrowserEnvironment();
    }

    /**
     * Check if running in a browser environment
     * @returns true if running in browser
     */
    static isBrowser(): boolean {
        return isBrowserEnvironment();
    }

    constructor(config: ChainConnectionConfig) {
        // SECURITY: Prevent private key usage in browser environments
        if (config.privateKey && isBrowserEnvironment() && !config._dangerouslyAllowBrowserKeys) {
            throw new ClientSideKeyError();
        }

        this.chain = this.getChain(config.chainId);

        this.publicClient = createPublicClient({
            chain: this.chain,
            transport: http(config.rpcUrl)
        });

        if (config.privateKey) {
            // Additional warning even in Node.js environments
            if (process.env.NODE_ENV === 'production') {
                console.warn(
                    '[ChainService] WARNING: Using raw private keys is not recommended in production. ' +
                    'Consider using a custody provider or hardware wallet for enhanced security.'
                );
            }
            this.account = privateKeyToAccount(config.privateKey as `0x${string}`);
            this.walletClient = createWalletClient({
                account: this.account,
                chain: this.chain,
                transport: http(config.rpcUrl)
            });
        }
    }

    private getChain(chainId: number): Chain {
        switch (chainId) {
            case 1: return mainnet;
            case 11155111: return sepolia;
            case 31337: return anvil;
            default: return sepolia; // Default to Sepolia
        }
    }

    /**
     * Get the connected address
     */
    public getAddress(): Address | undefined {
        return this.account?.address;
    }

    /**
     * Get native token balance
     */
    public async getBalance(address: Address): Promise<string> {
        const balance = await this.publicClient.getBalance({ address });
        return balance.toString();
    }

    /**
     * Send a raw transaction
     */
    public async sendTransaction(to: Address, value: string, data?: `0x${string}`): Promise<Result<Hash, string>> {
        if (!this.walletClient || !this.account) {
            return err('No wallet connected for signing transactions');
        }

        try {
            const hash = await this.walletClient.sendTransaction({
                account: this.account,
                to,
                value: BigInt(value),
                data,
                chain: this.chain
            });
            return ok(hash);
        } catch (error: any) {
            return err(`Transaction failed: ${error.message}`);
        }
    }

    /**
     * Contract Write (Generic)
     */
    public async writeContract(
        address: Address,
        abi: any[],
        functionName: string,
        args: any[]
    ): Promise<Result<Hash, string>> {
        if (!this.walletClient || !this.account) {
            return err('No wallet connected for signing contract interactions');
        }

        try {
            const { request } = await this.publicClient.simulateContract({
                account: this.account,
                address,
                abi,
                functionName,
                args
            });
            const hash = await this.walletClient.writeContract({
                ...request,
                chain: this.chain
            });
            return ok(hash);
        } catch (error: any) {
            return err(`Contract write failed: ${error.message}`);
        }
    }

    /**
     * Contract Read (Generic)
     */
    public async readContract(
        address: Address,
        abi: any[],
        functionName: string,
        args: any[]
    ): Promise<any> {
        try {
            return await this.publicClient.readContract({
                address,
                abi,
                functionName,
                args
            });
        } catch (error: any) {
            console.error(`Read failed: ${error.message}`);
            return null;
        }
    }
}
