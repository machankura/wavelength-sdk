import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import vm from 'node:vm';
import { facadeDebugPayload } from './util.ts';

const R = '[REDACTED]';
const PASSWORD_B64 = 'Y29ycmVjdCBob3JzZSBiYXR0ZXJ5';
const PASSPHRASE_B64 = 'c2VlZCBwYXNzcGhyYXNl';
const MNEMONIC = ['abandon', 'ability', 'able', 'about'];
const ENCIPHERED_SEED = 'AGVuY2lwaGVyZWQgc2VlZA==';
const PRF_OUTPUT = 'ab'.repeat(32);
const SEED_ENTROPY = 'AAECAwQFBgcICQoLDA0ODw==';
const PRIVATE_DESCRIPTOR = 'tr(tprv8ZgxMBicQKsPdSecretRoot/86h/0h/0h/<0;1>/*)';
const MINIMAL_BUNDLE = '[d34db33f/1017h/1h/21h]tprvMINIMALBUNDLE/0/*';
const AUTH_KEYS = '[d34db33f/1017h/1h/43h]tprvAUTHKEYS/0/*';

type Case = {
  method: string;
  params: unknown;
  result: unknown;
  redactedParams: unknown;
  redactedResult: unknown;
};

// Wire shapes as they cross the transport: Go PascalCase for createWallet and
// unlockWallet, the camelCase passkey request, and the snake_case
// external-seed envelope.
const CASES: Case[] = [
  {
    method: 'createWallet',
    params: {
      WalletPassword: PASSWORD_B64,
      Mnemonic: MNEMONIC,
      SeedPassphrase: PASSPHRASE_B64,
      RecoverState: true,
      RecoveryWindow: 250,
    },
    result: {
      Mnemonic: MNEMONIC,
      EncipheredSeed: ENCIPHERED_SEED,
      IdentityPubKey: '02aa',
      RecoveryRan: true,
      RecoveredVTXOs: 2,
    },
    redactedParams: {
      WalletPassword: R,
      Mnemonic: R,
      SeedPassphrase: R,
      RecoverState: true,
      RecoveryWindow: 250,
    },
    redactedResult: {
      Mnemonic: R,
      EncipheredSeed: R,
      IdentityPubKey: '02aa',
      RecoveryRan: true,
      RecoveredVTXOs: 2,
    },
  },
  {
    method: 'unlockWallet',
    params: { WalletPassword: PASSWORD_B64 },
    result: { IdentityPubKey: '02aa' },
    redactedParams: { WalletPassword: R },
    redactedResult: { IdentityPubKey: '02aa' },
  },
  {
    method: 'openWalletFromPasskey',
    params: { prfOutput: PRF_OUTPUT },
    result: { Imported: true, Mnemonic: MNEMONIC, IdentityPubKey: '02aa' },
    redactedParams: { prfOutput: R },
    redactedResult: { Imported: true, Mnemonic: R, IdentityPubKey: '02aa' },
  },
  {
    method: 'startExternalSeedWallet',
    params: {
      config: { data_dir: '/wallets', network: 'regtest' },
      seed_entropy: SEED_ENTROPY,
      expected_identity_pubkey: '02aa',
      recover_state: true,
    },
    result: { Imported: true, IdentityPubKey: '02aa', RecoveryRan: false },
    redactedParams: {
      config: { data_dir: '/wallets', network: 'regtest' },
      seed_entropy: R,
      expected_identity_pubkey: '02aa',
      recover_state: true,
    },
    redactedResult: { Imported: true, IdentityPubKey: '02aa', RecoveryRan: false },
  },
  {
    method: 'startDescriptorWallet',
    params: {
      config: { data_dir: '/wallets', network: 'regtest' },
      descriptors: [PRIVATE_DESCRIPTOR],
      birthday_unix: 1767225600,
    },
    result: {
      Imported: true,
      IdentityPubKey: '02aa',
      Descriptors: ['tr([d34db33f/86h/0h/0h]tpub/<0;1>/*)'],
    },
    redactedParams: {
      config: { data_dir: '/wallets', network: 'regtest' },
      descriptors: R,
      birthday_unix: 1767225600,
    },
    redactedResult: { Imported: true, IdentityPubKey: '02aa', Descriptors: R },
  },
  {
    method: 'startWatchOnlyWallet',
    params: {
      config: { data_dir: '/wallets', network: 'regtest' },
      bundle: MINIMAL_BUNDLE,
      wallet_password: PASSWORD_B64,
    },
    result: { Imported: true, ManifestHash: '' },
    redactedParams: {
      config: { data_dir: '/wallets', network: 'regtest' },
      bundle: R,
      wallet_password: R,
    },
    redactedResult: { Imported: true, ManifestHash: '' },
  },
  {
    method: 'startWatchOnlyWallet',
    params: {
      config: { data_dir: '/wallets', network: 'regtest' },
      manifest: '{"version":1}',
      auth_keys: AUTH_KEYS,
      wallet_password: PASSWORD_B64,
    },
    result: { Imported: true, ManifestHash: 'abc' },
    redactedParams: {
      config: { data_dir: '/wallets', network: 'regtest' },
      manifest: '{"version":1}',
      auth_keys: R,
      wallet_password: R,
    },
    redactedResult: { Imported: true, ManifestHash: 'abc' },
  },
  {
    method: 'createWallet',
    params: {
      WalletPassword: PASSWORD_B64,
      WatchOnlyBundle: MINIMAL_BUNDLE,
      AuthKeys: AUTH_KEYS,
    },
    result: { IdentityPubKey: '02aa' },
    redactedParams: { WalletPassword: R, WatchOnlyBundle: R, AuthKeys: R },
    redactedResult: { IdentityPubKey: '02aa' },
  },
  {
    method: 'listWalletDescriptors',
    params: {
      IncludePrivate: true,
      Descriptors: [PRIVATE_DESCRIPTOR],
    },
    result: { Descriptors: [PRIVATE_DESCRIPTOR], IncludesPrivate: true },
    redactedParams: { IncludePrivate: true, Descriptors: R },
    redactedResult: { Descriptors: R, IncludesPrivate: true },
  },
  {
    method: 'list',
    params: { Limit: 2 },
    result: { Activity: { Entries: [{ Id: 'a', AmountSat: 5 }] } },
    redactedParams: { Limit: 2 },
    redactedResult: { Activity: { Entries: [{ Id: 'a', AmountSat: 5 }] } },
  },
];

const SECRETS = [
  PRIVATE_DESCRIPTOR,
  MINIMAL_BUNDLE,
  AUTH_KEYS,
  PASSWORD_B64,
  PASSPHRASE_B64,
  ENCIPHERED_SEED,
  PRF_OUTPUT,
  SEED_ENTROPY,
  ...MNEMONIC,
];

function assertNoSecrets(rendered: string): void {
  for (const secret of SECRETS) {
    assert.equal(rendered.includes(secret), false, `leaked ${secret}`);
  }
}

describe('main-thread debug payload redaction', () => {
  for (const c of CASES) {
    it(`${c.method}: redacts secret fields and keeps the rest`, () => {
      const before = JSON.stringify([c.params, c.result]);

      assert.deepEqual(facadeDebugPayload(c.params), c.redactedParams);
      assert.deepEqual(facadeDebugPayload(c.result), c.redactedResult);
      assert.equal(JSON.stringify([c.params, c.result]), before);
    });
  }

  it('passes non-object payloads through', () => {
    assert.equal(facadeDebugPayload(null), null);
    assert.equal(facadeDebugPayload(true), true);
    assert.equal(facadeDebugPayload('ok'), 'ok');
  });
});

describe('worker debug payload redaction', () => {
  it('logs the same redacted payloads as the main thread', async () => {
    const source = await readFile(
      new URL('./wavewalletdk-worker.js', import.meta.url),
      'utf8',
    );
    const listeners = new Map<string, Array<() => void>>();
    const logs: unknown[][] = [];
    let result: unknown;
    const self: Record<string, unknown> = {
      postMessage: () => undefined,
      addEventListener: (name: string, listener: () => void) => {
        const current = listeners.get(name) ?? [];
        current.push(listener);
        listeners.set(name, current);
      },
      wavewalletdkCall: async () => result,
    };
    vm.runInNewContext(source, {
      self,
      console: { ...console, log: (...args: unknown[]) => logs.push(args) },
      URL,
      Event: class Event {},
      setTimeout,
      clearTimeout,
    });

    const onmessage = self.onmessage as (event: unknown) => Promise<void>;
    await onmessage({ data: { $init: { debug: true } } });
    for (const listener of listeners.get('wavewalletdk-ready') ?? []) listener();

    for (const [i, c] of CASES.entries()) {
      logs.length = 0;
      result = c.result;
      await onmessage({ data: { id: i, method: c.method, params: c.params } });

      assertNoSecrets(JSON.stringify(logs));
      // The worker's objects come from the vm realm; compare their JSON form.
      const logged = JSON.parse(JSON.stringify(logs.map((args) => args[1])));
      assert.deepEqual(logged, [c.redactedParams, c.redactedResult], c.method);
    }
  });
});
