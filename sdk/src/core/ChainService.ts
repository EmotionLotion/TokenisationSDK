
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

export interface ChainConnectionConfig {
    chainId: number;
    rpcUrl: string;
    privateKey?: string; // Optional: Only needed for signing transactions directly
    relayerUrl?: string; // Optional: For meta-transactions
}

export class ChainService {
    private publicClient: PublicClient;
    private walletClient?: WalletClient;
    private account?: Account;
    private chain: Chain;

    constructor(config: ChainConnectionConfig) {
        this.chain = this.getChain(config.chainId);

        this.publicClient = createPublicClient({
            chain: this.chain,
            transport: http(config.rpcUrl)
        });

        if (config.privateKey) {
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
