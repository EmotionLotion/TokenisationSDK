/**
 * Event Emitter for component lifecycle events
 *
 * Provides a typed event system for:
 * - Authentication events
 * - KYC status changes
 * - Transaction events
 * - Error events
 */

export type TokenisationEventType =
  | 'ready'
  | 'error'
  | 'auth:login'
  | 'auth:logout'
  | 'auth:restored'
  | 'kyc:started'
  | 'kyc:step'
  | 'kyc:completed'
  | 'kyc:failed'
  | 'wallet:connected'
  | 'wallet:disconnected'
  | 'wallet:changed'
  | 'transaction:pending'
  | 'transaction:confirmed'
  | 'transaction:failed'
  | 'theme:changed';

export interface TokenisationEventMap {
  ready: { timestamp: number };
  error: { type: string; message: string; details?: any };
  'auth:login': { user: any };
  'auth:logout': { reason: string };
  'auth:restored': { user: any };
  'kyc:started': { tier: string };
  'kyc:step': { step: string; progress: number };
  'kyc:completed': { status: string; identityId: string };
  'kyc:failed': { reason: string; retryable: boolean };
  'wallet:connected': { address: string; chainId: number; provider: string };
  'wallet:disconnected': { reason?: string };
  'wallet:changed': { address: string; previousAddress: string };
  'transaction:pending': { txHash: string; type: string };
  'transaction:confirmed': { txHash: string; type: string; blockNumber: number };
  'transaction:failed': { txHash?: string; type: string; error: string };
  'theme:changed': { theme: any };
}

export type TokenisationEvent<T extends TokenisationEventType = TokenisationEventType> = {
  type: T;
  payload: T extends keyof TokenisationEventMap ? TokenisationEventMap[T] : any;
  timestamp: number;
};

type Listener<T extends TokenisationEventType> = (
  event: TokenisationEvent<T>
) => void | Promise<void>;

export class EventEmitter {
  private listeners: Map<TokenisationEventType, Set<Listener<any>>> = new Map();
  private onceListeners: Map<TokenisationEventType, Set<Listener<any>>> = new Map();

  /**
   * Subscribe to an event
   */
  on<T extends TokenisationEventType>(
    type: T,
    listener: Listener<T>
  ): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);

    // Return unsubscribe function
    return () => this.off(type, listener);
  }

  /**
   * Subscribe to an event (fires once)
   */
  once<T extends TokenisationEventType>(
    type: T,
    listener: Listener<T>
  ): () => void {
    if (!this.onceListeners.has(type)) {
      this.onceListeners.set(type, new Set());
    }
    this.onceListeners.get(type)!.add(listener);

    return () => {
      this.onceListeners.get(type)?.delete(listener);
    };
  }

  /**
   * Unsubscribe from an event
   */
  off<T extends TokenisationEventType>(type: T, listener: Listener<T>): void {
    this.listeners.get(type)?.delete(listener);
    this.onceListeners.get(type)?.delete(listener);
  }

  /**
   * Emit an event
   */
  emit<T extends TokenisationEventType>(
    type: T,
    payload: T extends keyof TokenisationEventMap ? TokenisationEventMap[T] : any
  ): void {
    const event: TokenisationEvent<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };

    // Call regular listeners
    this.listeners.get(type)?.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error(`[Tokenisation:Event] Error in listener for ${type}:`, error);
      }
    });

    // Call once listeners and remove them
    this.onceListeners.get(type)?.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error(`[Tokenisation:Event] Error in once listener for ${type}:`, error);
      }
    });
    this.onceListeners.delete(type);
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(type?: TokenisationEventType): void {
    if (type) {
      this.listeners.delete(type);
      this.onceListeners.delete(type);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  /**
   * Get listener count for an event type
   */
  listenerCount(type: TokenisationEventType): number {
    return (
      (this.listeners.get(type)?.size || 0) +
      (this.onceListeners.get(type)?.size || 0)
    );
  }
}
