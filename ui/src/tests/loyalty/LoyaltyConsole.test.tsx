/**
 * LoyaltyConsole wiring test — drives the page against an injected fake
 * `client.loyalty.*`, proving the operator flow maps to the real SDK surface:
 * connect → create program → open account → earn → balance → redeem, with a
 * RightAction receipt and a REQUIRED idempotency key on the spend.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoyaltyConsole } from '../../pages/LoyaltyConsole';

function makeFake() {
  const iso = '2026-06-25T10:00:00.000Z';
  const fake = {
    loyalty: {
      programs: { create: vi.fn(async (input: { name: string; currency?: string }) => ({ id: 'prog_1', name: input.name, currency: input.currency ?? 'POINTS' })) },
      accounts: { create: vi.fn(async () => ({ id: 'acct_1', balance: 0, currentTier: '' })) },
      points: {
        earn: vi.fn(async () => ({ id: 'tx_earn' })),
        balance: vi.fn(async () => ({ balance: 100, currentTier: 'Bronze', lifetimeEarned: 250, lifetimeSpent: 80 })),
        redeem: vi.fn(async (accountId: string, input: { amount: number }) => ({
          receipt: { id: 'rcpt_1', kind: 'REDEEM', status: 'COMPLETED', subjectId: accountId, quantity: String(input.amount), unit: 'points', auditEntryId: 'audit_1', metadata: {}, createdAt: iso },
          transactionId: 'tx_redeem', balanceBefore: 100, balanceAfter: 50, redeemedValue: '0.50',
        })),
        consume: vi.fn(),
        revoke: vi.fn(),
      },
      transactions: {
        list: vi.fn(async () => ({ data: [{ id: 'tx1', type: 'earn', amount: 100, action: 'purchase_reward', balanceBefore: 0, balanceAfter: 100, createdAt: iso }], total: 1 })),
      },
    },
  };
  return fake;
}

describe('LoyaltyConsole', () => {
  it('drives the real loyalty flow through client.loyalty.* with an idempotency key', async () => {
    const fake = makeFake();
    render(<LoyaltyConsole makeClient={() => fake as never} />);

    // 1. Connect (button is gated on a non-empty key).
    fireEvent.change(screen.getByPlaceholderText('sk_test_...'), { target: { value: 'sk_test_abc' } });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    // 2. Create program.
    fireEvent.click(await screen.findByRole('button', { name: /create program/i }));
    await waitFor(() => expect(fake.loyalty.programs.create).toHaveBeenCalled());

    // 3. Open account → triggers balance + ledger refresh.
    fireEvent.click(await screen.findByRole('button', { name: /open account/i }));
    await waitFor(() => expect(fake.loyalty.accounts.create).toHaveBeenCalled());
    await waitFor(() => expect(fake.loyalty.points.balance).toHaveBeenCalledWith('acct_1'));

    // Overview shows the live balance; ledger evidence renders.
    expect(await screen.findByText('100')).toBeInTheDocument();
    expect(screen.getByText(/purchase reward/i)).toBeInTheDocument();

    // 4. Earn.
    fireEvent.click(screen.getByRole('button', { name: /earn/i }));
    await waitFor(() => expect(fake.loyalty.points.earn).toHaveBeenCalled());

    // 5. Redeem → RightAction receipt with a REQUIRED idempotency key.
    fireEvent.click(screen.getByRole('button', { name: /^redeem$/i }));
    await waitFor(() => expect(fake.loyalty.points.redeem).toHaveBeenCalled());

    const redeemArgs = fake.loyalty.points.redeem.mock.calls[0];
    expect(redeemArgs[0]).toBe('acct_1');
    expect(redeemArgs[2]).toMatch(/^redeem-/); // idempotency key passed (3rd arg)

    // Receipt panel renders kind + status.
    expect(await screen.findByText('REDEEM')).toBeInTheDocument();
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
  });
});
