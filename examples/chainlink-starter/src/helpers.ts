/**
 * Shared logging helpers — visual consistency across all demos.
 */

export function log(section: string, message: string) {
  console.log(`\n[${'='.repeat(60)}]`);
  console.log(`[${section}]`);
  console.log(`[${'='.repeat(60)}]`);
  console.log(message);
}

export function logStep(step: number, description: string) {
  console.log(`\n  Step ${step}: ${description}`);
  console.log(`  ${'-'.repeat(50)}`);
}

export function logSuccess(message: string) {
  console.log(`  ✅ ${message}`);
}

export function logInfo(label: string, value: string | number | boolean) {
  console.log(`     ${label}: ${value}`);
}

export function logWarning(message: string) {
  console.log(`  ⚠️  ${message}`);
}

export const BASE_SEPOLIA_RPC_URL =
  process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';

export const BASE_SEPOLIA_CHAIN_ID = 84532;
