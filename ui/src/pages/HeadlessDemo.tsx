import { useState, useCallback } from 'react';
import { LifecycleState } from '@tokenisation/sdk';
import { sdkStore } from '../store';

interface LogEntry {
  id: number;
  time: string;
  message: string;
}

let logId = 0;

export function HeadlessDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [running, setRunning] = useState(false);

  const log = useCallback((msg: string) => {
    setLogs(prev => [...prev, { id: ++logId, time: new Date().toLocaleTimeString(), message: msg }]);
  }, []);

  const refreshAssets = useCallback(() => {
    setAssets(sdkStore.getAssets());
  }, []);

  const runMintFlow = async () => {
    setRunning(true);
    try {
      log('Starting mint flow...');

      // Ensure initialized
      await sdkStore.init();
      log('SDK initialized');

      // Create asset (createAsset returns the full Asset object)
      const asset = await sdkStore.createAsset({
        name: 'Headless Test Token',
        type: 'equity',
        jurisdiction: 'SG',
        totalSupply: '10000',
        description: 'Created from headless demo',
      });
      const assetId = asset.id;
      log(`Created asset: ${assetId}`);

      // Create party
      const partyId = sdkStore.addParty('Headless Investor', 'investor');
      log(`Created party: ${partyId}`);

      // Verify KYC
      sdkStore.verifyKyc(partyId);
      log('KYC verified');

      // Transition to active using SDK LifecycleState enum
      const t1 = await sdkStore.transition(assetId, LifecycleState.PENDING_VERIFICATION, partyId);
      log(`Transition → PENDING_VERIFICATION: ${t1.success}`);

      const t2 = await sdkStore.transition(assetId, LifecycleState.VERIFIED, partyId);
      log(`Transition → VERIFIED: ${t2.success}`);

      const t3 = await sdkStore.transition(assetId, LifecycleState.ACTIVE, partyId);
      log(`Transition → ACTIVE: ${t3.success}`);

      // Mint
      const mint = await sdkStore.mint(assetId, partyId, '500');
      log(`Minted 500 tokens: ${mint.success}`);

      refreshAssets();
      log('Mint flow complete!');
    } catch (e: any) {
      log(`ERROR: ${e.message || e}`);
    } finally {
      setRunning(false);
    }
  };

  const runTransferFlow = async () => {
    setRunning(true);
    try {
      log('Starting transfer flow...');

      const allAssets = sdkStore.getAssets();
      if (allAssets.length === 0) {
        log('No assets found. Run mint flow first.');
        setRunning(false);
        return;
      }

      const asset = allAssets[0];
      const parties = sdkStore.getParties();

      // Create a second party if needed
      let toPartyId: string;
      if (parties.length < 2) {
        toPartyId = sdkStore.addParty('Transfer Recipient', 'investor');
        sdkStore.verifyKyc(toPartyId);
        log(`Created recipient party: ${toPartyId}`);
      } else {
        toPartyId = parties[1].id;
      }

      const fromPartyId = parties[0].id;
      log(`Transfer: ${fromPartyId} → ${toPartyId}`);

      const result = await sdkStore.transfer(asset.id, fromPartyId, toPartyId, '50');
      log(`Transfer 50 tokens: ${result.success}`);

      refreshAssets();
      log('Transfer flow complete!');
    } catch (e: any) {
      log(`ERROR: ${e.message || e}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{
      fontFamily: '"Courier New", Courier, monospace',
      backgroundColor: '#000',
      color: '#00FF00',
      minHeight: '100vh',
      padding: 32,
    }}>
      <h1 style={{ fontSize: 24, marginBottom: 8, color: '#00FF00' }}>
        Headless SDK Demo
      </h1>
      <p style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>
        Proves the SDK works without any UI framework. Plain HTML + inline styles only.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button
          onClick={runMintFlow}
          disabled={running}
          style={{
            padding: '10px 20px',
            backgroundColor: running ? '#333' : '#004400',
            color: '#00FF00',
            border: '1px solid #00FF00',
            cursor: running ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontSize: 14,
          }}
        >
          Run Mint Flow
        </button>
        <button
          onClick={runTransferFlow}
          disabled={running}
          style={{
            padding: '10px 20px',
            backgroundColor: running ? '#333' : '#004400',
            color: '#00FF00',
            border: '1px solid #00FF00',
            cursor: running ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontSize: 14,
          }}
        >
          Run Transfer Flow
        </button>
      </div>

      {/* Log output */}
      <pre style={{
        backgroundColor: '#001100',
        border: '1px solid #003300',
        padding: 16,
        maxHeight: 300,
        overflowY: 'auto',
        fontSize: 12,
        lineHeight: 1.6,
        marginBottom: 24,
      }}>
        {logs.length === 0
          ? '> Waiting for commands...\n'
          : logs.map(l => `[${l.time}] ${l.message}\n`).join('')}
      </pre>

      {/* Assets table */}
      {assets.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, marginBottom: 8, color: '#00FF00' }}>Assets</h2>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
          }}>
            <thead>
              <tr>
                {['ID', 'Name', 'State', 'Type', 'Supply'].map(h => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      borderBottom: '1px solid #003300',
                      color: '#888',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assets.map((a: any) => (
                <tr key={a.id}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #001a00' }}>{a.id?.slice(0, 8)}...</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #001a00' }}>{a.name}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #001a00', color: '#FFAA00' }}>{a.state}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #001a00' }}>{a.type}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid #001a00' }}>{a.totalSupply}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
