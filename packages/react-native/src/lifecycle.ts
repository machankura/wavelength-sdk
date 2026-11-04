import type {
  RuntimePhase,
  WalletEngine,
} from '@lightninglabs/wavelength-core';

/**
 * The subset of React Native's AppState the watcher depends on. Narrowed to an
 * interface so unit tests can inject a fake without loading react-native.
 */
export type AppStateSource = {
  /** Subscribes to app state changes; returns the subscription. */
  addEventListener(
    type: 'change',
    listener: (state: string) => void,
  ): { remove(): void };
};

/** Options for restartAfterBackground. */
export type RestartAfterBackgroundOptions = {
  /**
   * How long the app must stay in the background before returning restarts the
   * daemon. On Android, another activity on top reports as 'background' too,
   * including a permission prompt or a file picker, and a restart costs the user
   * an unlock, so a brief visit should not trigger one. Default: 30000.
   */
  minBackgroundMs?: number;
};

const DEFAULT_MIN_BACKGROUND_MS = 30_000;

// Only an unlocked wallet holds external gRPC connections: the daemon dials the
// operator, the mailbox and the indexer on unlock. A wallet still locked or not
// yet created has nothing frozen and can stay as it is, which also keeps a
// restart from pulling a passkey prompt or an onboarding form out from under the
// user.
const OPEN_PHASES: ReadonlySet<RuntimePhase> = new Set(['syncing', 'ready']);

// watchBackground is restartAfterBackground over an injected AppState.
export function watchBackground(
  engine: WalletEngine,
  appState: AppStateSource,
  options: RestartAfterBackgroundOptions = {},
): () => void {
  const minBackgroundMs = options.minBackgroundMs ?? DEFAULT_MIN_BACKGROUND_MS;
  let backgroundedAt: number | null = null;
  let openWhenBackgrounded = false;

  const subscription = appState.addEventListener('change', (state) => {
    if (state === 'background') {
      backgroundedAt ??= Date.now();
      openWhenBackgrounded = OPEN_PHASES.has(engine.getSnapshot().phase);

      return;
    }
    // iOS passes through 'inactive' for the app switcher and system sheets
    // without the app ever leaving the foreground, so only 'active' ends a visit.
    if (state !== 'active' || backgroundedAt === null) {
      return;
    }
    // The wall clock on purpose: it keeps counting while the process is frozen.
    const elapsedMs = Date.now() - backgroundedAt;
    backgroundedAt = null;
    if (elapsedMs < minBackgroundMs) {
      return;
    }

    const { phase, recovery } = engine.getSnapshot();
    // A stream that died while the app was away has already moved an open wallet
    // to 'error', and a restart is the recovery for that too. Any other error
    // predates the visit and stays on the host's screen.
    const lostWhileAway = phase === 'error' && openWhenBackgrounded;
    if (!OPEN_PHASES.has(phase) && !lostWhileAway) {
      return;
    }
    // A stop would throw away a server-assisted recovery scan's progress. Its
    // connections carry keepalives, so a dead path fails the scan on its own.
    if (recovery.status === 'restoring') {
      return;
    }
    // A failed restart reaches the host through the 'error' phase.
    void engine.restart().catch(() => undefined);
  });

  return () => subscription.remove();
}
