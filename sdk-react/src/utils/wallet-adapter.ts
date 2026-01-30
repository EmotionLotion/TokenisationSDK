/**
 * Wallet Adapter - EIP-1193 wallet signing abstraction
 *
 * Provides a unified interface for signing messages and sending transactions
 * via browser wallets (MetaMask, WalletConnect, etc.).
 */

// ============================================================================
// Types
// ============================================================================

export interface TransactionRequest {
  to: string;
  from?: string;
  data?: string;
  value?: string;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
  chainId?: number;
}

export interface WalletAdapter {
  signMessage(message: string): Promise<string>;
  signTypedData(domain: any, types: any, value: any): Promise<string>;
  sendTransaction(tx: TransactionRequest): Promise<string>;
}

// ============================================================================
// EIP-1193 Implementation
// ============================================================================

export class EIP1193WalletAdapter implements WalletAdapter {
  private getProvider(): any {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      throw new Error('No EIP-1193 wallet provider found. Please install MetaMask or another wallet.');
    }
    return ethereum;
  }

  private async getAccount(): Promise<string> {
    const provider = this.getProvider();
    const accounts: string[] = await provider.request({ method: 'eth_accounts' });
    if (!accounts || accounts.length === 0) {
      throw new Error('No wallet account available. Please connect your wallet first.');
    }
    return accounts[0];
  }

  async signMessage(message: string): Promise<string> {
    const provider = this.getProvider();
    const account = await this.getAccount();

    const signature: string = await provider.request({
      method: 'personal_sign',
      params: [message, account],
    });

    return signature;
  }

  async signTypedData(domain: any, types: any, value: any): Promise<string> {
    const provider = this.getProvider();
    const account = await this.getAccount();

    // EIP-712 typed data signing
    const typedData = {
      types: {
        EIP712Domain: [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        ...types,
      },
      primaryType: Object.keys(types)[0],
      domain,
      message: value,
    };

    const signature: string = await provider.request({
      method: 'eth_signTypedData_v4',
      params: [account, JSON.stringify(typedData)],
    });

    return signature;
  }

  async sendTransaction(tx: TransactionRequest): Promise<string> {
    const provider = this.getProvider();
    const account = await this.getAccount();

    const txParams: Record<string, any> = {
      from: tx.from || account,
      to: tx.to,
    };

    if (tx.data) txParams.data = tx.data;
    if (tx.value) txParams.value = tx.value;
    if (tx.gasLimit) txParams.gas = tx.gasLimit;
    if (tx.maxFeePerGas) txParams.maxFeePerGas = tx.maxFeePerGas;
    if (tx.maxPriorityFeePerGas) txParams.maxPriorityFeePerGas = tx.maxPriorityFeePerGas;
    if (tx.nonce !== undefined) txParams.nonce = `0x${tx.nonce.toString(16)}`;
    if (tx.chainId !== undefined) txParams.chainId = `0x${tx.chainId.toString(16)}`;

    const txHash: string = await provider.request({
      method: 'eth_sendTransaction',
      params: [txParams],
    });

    return txHash;
  }
}
