import assert from 'node:assert/strict';
import { describe, it, type TestContext } from 'node:test';
import type {
  RecoveryState,
  RuntimePhase,
  WalletEngine,
} from '@lightninglabs/wavelength-core';
import { watchBackground, type AppStateSource } from './lifecycle.ts';

// A fake engine reduced to what the watcher reads and calls, plus a fake
// AppState the test drives by hand.
function setup(
  t: TestContext,
  options?: Parameters<typeof watchBackground>[2],
) {
  t.mock.timers.enable({ apis: ['Date'] });

  const state: { phase: RuntimePhase; recovery: RecoveryState } = {
    phase: 'ready',
    recovery: { status: 'idle' },
  };
  let restarts = 0;
  let restartResult: Promise<void> = Promise.resolve();
  const engine = {
    getSnapshot: () => state,
    restart: () => {
      restarts += 1;

      return restartResult;
    },
  } as unknown as WalletEngine;

  let listener: ((appState: string) => void) | null = null;
  let removed = 0;
  const appState: AppStateSource = {
    addEventListener(_type, l) {
      listener = l;

      return {
        remove() {
          removed += 1;
          listener = null;
        },
      };
    },
  };
  const unwatch = watchBackground(engine, appState, options);

  return {
    state,
    unwatch,
    restarts: () => restarts,
    removed: () => removed,
    failRestart: () => {
      restartResult = Promise.reject(new Error('no route to host'));
    },
    emit: (appStateValue: string) => listener?.(appStateValue),
    wait: (ms: number) => t.mock.timers.tick(ms),
  };
}

describe('watchBackground', () => {
  for (const phase of ['ready', 'syncing'] as const) {
    it(`restarts a ${phase} wallet after a real background and return`, (t) => {
      const app = setup(t);
      app.state.phase = phase;
      app.emit('background');
      app.wait(30_000);
      assert.equal(app.restarts(), 0);
      app.emit('active');
      assert.equal(app.restarts(), 1);
    });
  }

  it('leaves a brief visit alone, as a system prompt on Android', (t) => {
    const app = setup(t);
    app.emit('background');
    app.wait(29_999);
    app.emit('active');
    assert.equal(app.restarts(), 0);
  });

  it('honors minBackgroundMs', (t) => {
    const app = setup(t, { minBackgroundMs: 1_000 });
    app.emit('background');
    app.wait(1_000);
    app.emit('active');
    assert.equal(app.restarts(), 1);
  });

  it('measures each visit from its first background event', (t) => {
    const app = setup(t);
    app.emit('background');
    app.wait(20_000);
    app.emit('background');
    app.wait(10_000);
    app.emit('active');
    assert.equal(app.restarts(), 1);

    // The visit is over, so the next short one starts from zero.
    app.emit('background');
    app.wait(1_000);
    app.emit('active');
    assert.equal(app.restarts(), 1);
  });

  it("ignores iOS's 'inactive' without a background", (t) => {
    const app = setup(t);
    app.emit('inactive');
    app.wait(60_000);
    app.emit('active');
    assert.equal(app.restarts(), 0);
  });

  it("keeps counting through iOS's 'inactive' on the way back", (t) => {
    const app = setup(t);
    app.emit('inactive');
    app.emit('background');
    app.wait(30_000);
    app.emit('inactive');
    assert.equal(app.restarts(), 0);
    app.emit('active');
    assert.equal(app.restarts(), 1);
  });

  // These phases either hold no external connections or are mid-transition, and
  // a restart would throw away a passkey prompt, a form, or a host's stop.
  for (const phase of [
    'loading',
    'runtimeReady',
    'starting',
    'needsWallet',
    'locked',
    'restoring',
    'stopping',
    'stopped',
  ] as const) {
    it(`leaves a wallet in ${phase} alone`, (t) => {
      const app = setup(t);
      app.state.phase = phase;
      app.emit('background');
      app.wait(60_000);
      app.emit('active');
      assert.equal(app.restarts(), 0);
    });
  }

  it('restarts a wallet that the visit itself moved to error', (t) => {
    const app = setup(t);
    app.emit('background');
    app.state.phase = 'error';
    app.wait(30_000);
    app.emit('active');
    assert.equal(app.restarts(), 1);
  });

  it('leaves an error from before the visit on the host screen', (t) => {
    const app = setup(t);
    app.state.phase = 'error';
    app.emit('background');
    app.wait(30_000);
    app.emit('active');
    assert.equal(app.restarts(), 0);
  });

  it('leaves a wallet the host stopped during the visit', (t) => {
    const app = setup(t);
    app.emit('background');
    app.state.phase = 'stopped';
    app.wait(30_000);
    app.emit('active');
    assert.equal(app.restarts(), 0);
  });

  it('does not interrupt a live recovery scan', (t) => {
    const app = setup(t);
    app.state.recovery = { status: 'restoring' };
    app.emit('background');
    app.wait(60_000);
    app.emit('active');
    assert.equal(app.restarts(), 0);
  });

  it('swallows a failed restart, which the phase already reports', async (t) => {
    const app = setup(t);
    app.failRestart();
    app.emit('background');
    app.wait(30_000);
    app.emit('active');
    assert.equal(app.restarts(), 1);
    // An unhandled rejection here would fail the test run.
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('stops watching once unsubscribed', (t) => {
    const app = setup(t);
    app.emit('background');
    app.wait(30_000);
    app.unwatch();
    assert.equal(app.removed(), 1);
    app.emit('active');
    assert.equal(app.restarts(), 0);
  });
});
