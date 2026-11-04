import assert from 'node:assert/strict';
import { it } from 'node:test';
import { normalizeEntry, normalizeFacadeResult } from './response-normalization.ts';

it('normalizes known pointer and slice fields without rewriting unrelated nulls', () => {
  assert.deepEqual(normalizeFacadeResult('prepareSend', {
    SelectedOutpoints: null,
    CreditPreview: null,
    Warning: null,
  }), {
    selectedOutpoints: [],
    creditPreview: undefined,
    warning: null,
  });

  assert.deepEqual(normalizeFacadeResult('list', {
    View: 'activity',
    Activity: { Entries: null },
    VTXOs: null,
    Onchain: null,
  }), {
    view: 'activity',
    activity: { entries: [] },
    vtxos: undefined,
    onchain: undefined,
  });
});

it('normalizes every array result family', () => {
  assert.deepEqual(
    normalizeFacadeResult('createWallet', { Mnemonic: null, Descriptors: null }),
    { mnemonic: [], descriptors: [] },
  );
  assert.deepEqual(
    normalizeFacadeResult('startDescriptorWallet', {
      Imported: true,
      Descriptors: null,
      Mnemonic: ['must', 'not', 'escape'],
    }),
    { imported: true, descriptors: [] },
  );
  assert.deepEqual(
    normalizeFacadeResult('startWatchOnlyWallet', {
      Imported: true,
      ManifestHash: 'abc',
      Descriptors: null,
      Mnemonic: ['must', 'not', 'escape'],
    }),
    { imported: true, manifestHash: 'abc', descriptors: [] },
  );
  assert.deepEqual(
    normalizeFacadeResult('listWalletDescriptors', { Descriptors: null }),
    { descriptors: [] },
  );
  assert.deepEqual(normalizeFacadeResult('openWalletFromPasskey', { Mnemonic: null }), { mnemonic: [] });
  assert.deepEqual(
    normalizeFacadeResult('startExternalSeedWallet', {
      Imported: true,
      Mnemonic: ['must', 'not', 'escape'],
    }),
    { imported: true },
  );
  assert.deepEqual(normalizeFacadeResult('exit', { QueuedOutpoints: null }), { queuedOutpoints: [] });
  assert.deepEqual(normalizeFacadeResult('exitSummary', { Exits: null }), { exits: [] });
  assert.deepEqual(normalizeFacadeResult('getExitPlan', { Plans: null }), { plans: [] });
  assert.deepEqual(normalizeFacadeResult('sweepWallet', { Inputs: null }), { inputs: [] });
});

it('normalizes entry pointers in responses and streams', () => {
  assert.deepEqual(normalizeEntry({ Cursor: 3, Progress: null, Request: null }), {
    cursor: 3,
    progress: undefined,
    request: undefined,
  });
});

it('normalizes list variant slices and exit status pointers', () => {
  assert.deepEqual(normalizeFacadeResult('list', {
    View: 'vtxos',
    VTXOs: { VTXOs: null },
  }), {
    view: 'vtxos',
    vtxos: { vtxos: [] },
  });
  assert.deepEqual(normalizeFacadeResult('list', {
    View: 'onchain',
    Onchain: { Txs: null },
  }), {
    view: 'onchain',
    onchain: { txs: [] },
  });
  assert.deepEqual(normalizeFacadeResult('exitStatus', {
    Progress: null,
    CSV: null,
    Fees: null,
  }), {
    progress: undefined,
    cSV: undefined,
    fees: undefined,
  });
});

for (const method of ['deposit', 'receive', 'sendPrepared'] as const) {
  it(`normalizes the nested entry returned by ${method}`, () => {
    assert.deepEqual(normalizeFacadeResult(method, {
      Entry: { Progress: null, Request: null },
    }), {
      entry: { progress: undefined, request: undefined },
    });
  });
}
