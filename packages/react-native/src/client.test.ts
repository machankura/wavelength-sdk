import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NativeWavelengthClient,
  type NativeActivityEvent,
  type WavelengthNativeModule,
} from './client.ts';
import {
  WavelengthError,
  type WavelengthEvent,
} from '@lightninglabs/wavelength-core';

const FINAL_PROFILE_DATA_DIR = '/data/wavelength/wdk/regtest/account-7';

// A scriptable fake of the native module: records calls, replays canned JSON,
// and hands the test the event listener so it can inject activity events.
function makeFake() {
  const calls: Array<{ method: string; paramsJson: string }> = [];
  const responses = new Map<string, string>();
  const startActivityRequests: string[] = [];
  let startActivityCount = 0;
  let stopActivityCount = 0;
  let stopActivityRejects = false;
  let defaultDataDirCount = 0;
  let deferredStop: { promise: Promise<void>; resolve: () => void } | null = null;
  let listener: ((event: NativeActivityEvent) => void) | null = null;
  let unsubscribed = 0;

  const native: WavelengthNativeModule = {
    call(method, paramsJson) {
      calls.push({ method, paramsJson });
      const canned = responses.get(method);
      if (canned === 'REJECT') {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve(canned ?? '');
    },
    startActivity(reqJson) {
      startActivityCount += 1;
      startActivityRequests.push(reqJson);
      return Promise.resolve();
    },
    stopActivity() {
      stopActivityCount += 1;
      if (deferredStop) {
        return deferredStop.promise;
      }
      return stopActivityRejects
        ? Promise.reject(new Error('close failed'))
        : Promise.resolve();
    },
    getDefaultDataDir() {
      defaultDataDirCount += 1;
      return Promise.resolve('/data/wavelength');
    },
  };

  const subscribe = (l: (event: NativeActivityEvent) => void) => {
    listener = l;
    return () => {
      unsubscribed += 1;
      listener = null;
    };
  };

  return {
    native,
    subscribe,
    calls,
    responses,
    startActivityRequests,
    failStopActivity: () => {
      stopActivityRejects = true;
    },
    deferStopActivity: () => {
      let resolve!: () => void;
      const promise = new Promise<void>((r) => {
        resolve = r;
      });
      deferredStop = { promise, resolve };
      return () => deferredStop!.resolve();
    },
    emit: (e: NativeActivityEvent) => listener?.(e),
    counts: () => ({
      startActivityCount,
      stopActivityCount,
      defaultDataDirCount,
      unsubscribed,
    }),
  };
}

describe('NativeWavelengthClient', () => {
  it('callFacade parses a native scalar JSON response', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    fake.responses.set('isRunning', 'true');

    assert.equal(await client.callFacade('isRunning'), true);
    assert.equal(fake.calls[0].method, 'isRunning');
  });

  it('normalizes a native JSON facade response in core', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    fake.responses.set('list', JSON.stringify({
      View: 'activity',
      Activity: { Entries: null },
      VTXOs: null,
      Onchain: null,
    }));

    assert.deepEqual(await client.callFacade('list'), {
      view: 'activity',
      activity: { entries: [] },
      vtxos: undefined,
      onchain: undefined,
    });
  });

  it('start injects the platform data dir and dials grpc', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    fake.responses.set('getInfo', '{"WalletState":0}');

    await client.start({ network: 'regtest', arkServerAddress: 'h:7070' });

    const cfg = JSON.parse(fake.calls[0].paramsJson) as Record<string, unknown>;
    assert.equal(cfg.data_dir, '/data/wavelength');
    assert.equal(cfg.server_transport, 'grpc');
    assert.equal(cfg.server_address, 'h:7070');
    assert.equal(fake.calls[1].method, 'getInfo');
  });

  it('start keeps an explicit dataDir', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    fake.responses.set('getInfo', '{}');

    await client.start({ network: 'regtest', dataDir: '/custom' });

    const cfg = JSON.parse(fake.calls[0].paramsJson) as Record<string, unknown>;
    assert.equal(cfg.data_dir, '/custom');
  });

  it('startExternalSeedWallet preserves the final profile config', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    fake.responses.set('startExternalSeedWallet', JSON.stringify({
      Imported: true,
      IdentityPubKey: 'identity',
      RecoveryRan: true,
      RecoveredBoardingAddresses: 1,
      RecoveredBoardingUTXOs: 2,
      RecoveredVTXOs: 3,
      RecoveredOORReceiveScripts: 4,
      RecoveredOORRecipientEvents: 5,
    }));

    const result = await client.startExternalSeedWallet(
      {
        network: 'regtest',
        dataDir: FINAL_PROFILE_DATA_DIR,
        arkServerAddress: 'h:7070',
      },
      {
        seedEntropy: Uint8Array.from({ length: 16 }, (_, index) => index),
        expectedIdentityPubKey: 'identity',
        recoverState: true,
        recoveryWindow: 37,
      },
    );

    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0].method, 'startExternalSeedWallet');
    assert.deepEqual(JSON.parse(fake.calls[0].paramsJson), {
      config: {
        data_dir: FINAL_PROFILE_DATA_DIR,
        network: 'regtest',
        server_address: 'h:7070',
        server_transport: 'grpc',
        swap_server_transport: 'grpc',
        wallet_type: 'lwwallet',
      },
      seed_entropy: 'AAECAwQFBgcICQoLDA0ODw==',
      expected_identity_pubkey: 'identity',
      recover_state: true,
      recovery_window: 37,
    });
    assert.equal(fake.counts().defaultDataDirCount, 0);
    assert.deepEqual(result, {
      imported: true,
      identityPubKey: 'identity',
      recoveryRan: true,
      recoveredBoardingAddresses: 1,
      recoveredBoardingUTXOs: 2,
      recoveredVTXOs: 3,
      recoveredOORReceiveScripts: 4,
      recoveredOORRecipientEvents: 5,
    });
  });

  describe('overlapping lifecycle calls', () => {
    // Models the Go facade's startEmbedded and Stop: one start at a time, a
    // second is refused, and a stop during a start cancels it. A start stays in
    // flight until the test releases it, as a slow open against a signer would.
    function makeLifecycleFake() {
      const order: string[] = [];
      let status: 'stopped' | 'starting' | 'started' = 'stopped';
      let generation = 0;
      const gate: { release?: () => void } = {};
      const startMethods = new Set([
        'startExternalSeedWallet',
        'startDescriptorWallet',
        'startWatchOnlyWallet',
      ]);
      const native: WavelengthNativeModule = {
        async call(method) {
          order.push(method);
          if (method === 'stop') {
            status = 'stopped';
            generation += 1;
            return '';
          }
          if (!startMethods.has(method)) {
            return '{}';
          }
          if (status !== 'stopped') {
            throw new Error('wavewalletdk mobile already started');
          }
          status = 'starting';
          const started = generation;
          await new Promise<void>((resolve) => {
            gate.release = resolve;
          });
          if (generation !== started) {
            throw new Error('wavewalletdk mobile start cancelled by Stop');
          }
          status = 'started';
          return JSON.stringify({ Imported: true, Descriptors: [] });
        },
        startActivity: () => Promise.resolve(),
        stopActivity: () => Promise.resolve(),
        getDefaultDataDir: () => Promise.resolve('/data/wavelength'),
      };
      const client = new NativeWavelengthClient(native, () => () => {});
      return {
        client,
        order,
        status: () => status,
        release: () => gate.release?.(),
      };
    }
    const config = {
      network: 'regtest',
      dataDir: FINAL_PROFILE_DATA_DIR,
      arkServerAddress: 'h:7070',
    } as const;
    const req = { descriptors: ['tr(xprv.../86h/0h/0h/<0;1>/*)'] };

    it('refuses a second start and leaves the first running', async () => {
      const { client, order, status, release } = makeLifecycleFake();
      const first = client.startDescriptorWallet(config, req);
      const second = client.startDescriptorWallet(config, req);

      await assert.rejects(second, (err: unknown) =>
        err instanceof WavelengthError &&
        /already started/.test(err.message));
      assert.equal(status(), 'starting');

      release();
      const result = await first;
      assert.equal(result.imported, true);
      assert.equal(status(), 'started');
      assert.deepEqual(order, ['startDescriptorWallet', 'startDescriptorWallet']);
    });

    it('cancels a start when stopped, and can start again', async () => {
      const { client, order, status, release } = makeLifecycleFake();
      const first = client.startDescriptorWallet(config, req);
      await client.stop();
      assert.equal(status(), 'stopped');

      release();
      await assert.rejects(first, (err: unknown) =>
        err instanceof WavelengthError &&
        /cancelled by Stop/.test(err.message));

      const again = client.startDescriptorWallet(config, req);
      while (status() !== 'starting') {
        await new Promise((resolve) => setImmediate(resolve));
      }
      release();
      await again;
      assert.equal(status(), 'started');
      assert.deepEqual(order, [
        'startDescriptorWallet',
        'stop',
        'startDescriptorWallet',
      ]);
    });
  });

  it('wraps native rejections in WavelengthError', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    fake.responses.set('getInfo', 'REJECT');

    await assert.rejects(client.getInfo(), (err: Error) => {
      assert.equal(err.name, 'WavelengthError');
      assert.equal(err.message, 'boom');
      return true;
    });
  });

  it('startActivity opens once and re-emits entries camelized', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity({
      includeExisting: true,
      kinds: ['send', 'exit'],
      cursor: 99,
    });
    await client.startActivity();
    assert.equal(fake.counts().startActivityCount, 1);
    assert.deepEqual(JSON.parse(fake.startActivityRequests[0]), {
      includeExisting: true,
      kinds: ['send', 'exit'],
      cursor: 99,
    });

    fake.emit({
      kind: 'entry',
      payload: '{"Kind":"send","Progress":null,"Request":null}',
    });
    assert.deepEqual(events, [
      {
        type: 'activity',
        payload: { kind: 'send', progress: undefined, request: undefined },
      },
    ]);
  });

  it('emits activityStream failed on a native error and allows reopening', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity();
    fake.emit({ kind: 'error', payload: 'stream broke' });

    assert.deepEqual(events, [
      {
        type: 'activityStream',
        payload: { state: 'failed', message: 'stream broke' },
      },
    ]);

    await client.startActivity();
    assert.equal(fake.counts().startActivityCount, 2);
  });

  it('emits activityStream ended on an unexpected native end and allows reopening', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity();
    fake.emit({ kind: 'end', payload: '' });

    assert.deepEqual(events, [
      { type: 'activityStream', payload: { state: 'ended' } },
    ]);

    await client.startActivity();
    assert.equal(fake.counts().startActivityCount, 2);
  });

  it('serializes a stop-then-start so the subscribe waits for the close', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);

    await client.startActivity();
    assert.equal(fake.counts().startActivityCount, 1);

    const resolveStop = fake.deferStopActivity();
    client.stopActivity();
    const secondStart = client.startActivity();
    // Let the chain advance as far as it can while the stop is still pending.
    await Promise.resolve();
    await Promise.resolve();
    // The second subscribe must not have fired while the close is in flight.
    assert.equal(fake.counts().startActivityCount, 1);

    resolveStop();
    await secondStart;
    // Once the close resolved, the serialized start subscribed.
    assert.equal(fake.counts().startActivityCount, 2);
  });

  it('drops an unparseable activity entry with a contextual log', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity();
    fake.emit({ kind: 'entry', payload: '{not json' });

    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'log');
    const payload = events[0].payload as { level: string; message: string };
    assert.equal(payload.level, 'error');
    assert.match(payload.message, /dropped an unparseable activity entry/);
  });

  it('logs a warning when the native close fails', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity();
    fake.failStopActivity();
    client.stopActivity();
    // The rejection is handled asynchronously; let the microtask run.
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(events.length, 1);
    const payload = events[0].payload as { level: string; message: string };
    assert.equal(payload.level, 'warn');
    assert.match(payload.message, /failed to close the activity stream/);
  });

  it('stopActivity and dispose release native resources', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    await client.startActivity();

    client.stopActivity();
    // The stop runs on the serialized op chain; let it settle before asserting.
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(fake.counts().stopActivityCount, 1);

    client.dispose();
    assert.equal(fake.counts().unsubscribed, 1);
  });

  it('closes the native stream when disposed with an open subscription', async () => {
    const fake = makeFake();
    const client = new NativeWavelengthClient(fake.native, fake.subscribe);
    const events: WavelengthEvent[] = [];
    client.subscribe((e) => events.push(e));

    await client.startActivity();
    client.dispose();
    // dispose enqueues the native close on the op chain; let it settle.
    await Promise.resolve();
    await Promise.resolve();

    // The subscription must actually be closed, not leaked.
    assert.equal(fake.counts().stopActivityCount, 1);
    // A terminal end after a client-initiated dispose stays silent.
    fake.emit({ kind: 'end', payload: '' });
    assert.deepEqual(
      events.filter((e) => e.type === 'activityStream'),
      [],
    );
  });
});
