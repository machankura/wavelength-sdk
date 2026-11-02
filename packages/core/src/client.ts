import type { WavelengthListener } from './events.ts';
import type { RuntimeConfig } from './config.ts';
import type { FacadeMethod } from './facade.ts';
import type { WalletInfo, WalletStatus } from './state.ts';
import type { ActivityStreamOptions } from './activity-options.ts';
import type {
  CreateWalletRequest,
  DepositRequest,
  DescriptorWalletRequest,
  ExternalSeedWalletRequest,
  ExitRequest,
  ExitStatusRequest,
  ExitSummaryRequest,
  GetExitPlanRequest,
  ListRequest,
  ListWalletDescriptorsRequest,
  OpenWalletFromPasskeyRequest,
  ReceiveRequest,
  SendRequest,
  SweepWalletRequest,
  UnlockWalletRequest,
} from './requests.ts';
import type {
  Balance,
  CreateWalletResult,
  DepositResult,
  DescriptorWalletOpenResult,
  ExternalSeedWalletOpenResult,
  ExitResult,
  ExitStatusResult,
  ExitSummaryResult,
  GetExitPlanResult,
  ListResult,
  ListWalletDescriptorsResult,
  OpenWalletFromPasskeyResult,
  PrepareSendResult,
  ReceiveResult,
  SendResult,
  SweepWalletResult,
  UnlockWalletResult,
} from './results.ts';

/**
 * The framework-agnostic contract every Wavelength transport implements. It
 * wraps the embedded daemon's lifecycle, wallet operations, and activity
 * stream behind typed, camelCase-normalized methods.
 *
 * External-seed startup is an additive transport capability;
 * see {@link ExternalSeedWalletClient}.
 */
export interface WavelengthClient {
  /** Resolves once the runtime assets are loaded and the client is usable. */
  ready(): Promise<void>;
  /**
   * Starts the embedded daemon with the given config and resolves with its
   * initial info. Calling start() while a session is already running coalesces
   * onto it and resolves with the current info; the passed config is ignored,
   * so stop() first to start under a different one.
   */
  start(config: RuntimeConfig): Promise<WalletInfo>;
  /** Stops the embedded daemon. */
  stop(): Promise<void>;
  /** Returns the current normalized wallet info. */
  getInfo(): Promise<WalletInfo>;
  /** Returns the daemon's runtime status snapshot. */
  status(): Promise<WalletStatus>;
  /** Returns the current wallet balance. */
  balance(): Promise<Balance>;
  /** Creates a new wallet from the given request. */
  createWallet(req: CreateWalletRequest): Promise<CreateWalletResult>;
  /** Unlocks an existing wallet with the given password. */
  unlockWallet(req: UnlockWalletRequest): Promise<UnlockWalletResult>;
  /** Opens a wallet from a passkey assertion. */
  openWalletFromPasskey(
    req: OpenWalletFromPasskeyRequest,
  ): Promise<OpenWalletFromPasskeyResult>;
  /** Generates an on-chain deposit address. */
  deposit(req?: DepositRequest): Promise<DepositResult>;
  /** Generates a receive invoice for the requested amount. */
  receive(req: ReceiveRequest): Promise<ReceiveResult>;
  /**
   * Quotes a payment without dispatching it: it returns the fee and a single-use
   * sendIntentId. Pair it with {@link sendPrepared} for a quote -> confirm -> pay
   * flow; {@link send} folds the two steps into one call.
   */
  prepareSend(req: SendRequest): Promise<PrepareSendResult>;
  /** Dispatches a payment previously quoted by {@link prepareSend}. */
  sendPrepared(prepared: PrepareSendResult): Promise<SendResult>;
  /** Quotes and dispatches a payment in a single call. */
  send(req: SendRequest): Promise<SendResult>;
  /** Lists wallet activity or UTXOs per the request. */
  list(req?: ListRequest): Promise<ListResult>;
  /** Exits a single outpoint, attempting a cooperative leave to the optional destination. */
  exit(req: ExitRequest): Promise<ExitResult>;
  /** Queries the status of an exit. */
  exitStatus(req: ExitStatusRequest): Promise<ExitStatusResult>;
  /**
   * Summarizes all in-progress exits: one entry per active exit plus
   * wallet-wide totals for the amount being recovered, the estimated fees, and
   * the estimated net recoverable. Completed and failed exits are omitted.
   */
  exitSummary(req?: ExitSummaryRequest): Promise<ExitSummaryResult>;
  /**
   * Previews unilateral-exit readiness (and the backing-wallet funding required)
   * for a set of VTXO outpoints, without moving funds.
   */
  getExitPlan(req: GetExitPlanRequest): Promise<GetExitPlanResult>;
  /**
   * Previews or broadcasts a sweep of the backing wallet. Call it with
   * `broadcast: false` first to preview; `broadcast: true` moves funds.
   */
  sweepWallet(req: SweepWalletRequest): Promise<SweepWalletResult>;
  /**
   * Invokes a portable daemon facade method with a normalized response. A
   * low-level escape hatch for facade verbs the typed methods do not cover;
   * prefer the typed methods wherever they exist.
   *
   * Rejects the lifecycle verbs `'start'`, `'startExternalSeedWallet'`, and
   * `'stop'`. Use the typed methods here or on
   * {@link ExternalSeedWalletClient} instead. On web those methods take and
   * release the cross-tab runtime lock. Raw lifecycle dispatch would bypass
   * that guard.
   */
  callFacade<T = unknown>(method: FacadeMethod, params?: unknown): Promise<T>;
  /** Reports whether the embedded daemon is running. */
  isRunning(): Promise<boolean>;
  /** Subscribes a listener to runtime events; returns an unsubscribe function. */
  subscribe(listener: WavelengthListener): () => void;
  /**
   * Opens the wallet activity stream and forwards each entry to subscribers as an
   * `'activity'` event until {@link stopActivity} is called.
   */
  startActivity(opts?: ActivityStreamOptions): Promise<void>;
  /** Closes the activity stream opened by {@link startActivity}. */
  stopActivity(): void;
  /**
   * Releases the client's resources and unsubscribes all listeners: it closes
   * the activity stream, and transports tear down their runtime resources (the
   * web transport terminates its Worker; the native transport removes its
   * event subscription). The client is unusable afterward; build a new one to
   * start again.
   */
  dispose(): void;
}

/**
 * Additive client capability for callers that derive external wallet entropy
 * and select the final storage profile themselves. Official web and React
 * Native clients implement it. Custom clients can keep implementing
 * {@link WavelengthClient} unless they need external-seed startup.
 */
export interface ExternalSeedWalletClient extends WavelengthClient {
  /**
   * Atomically starts the daemon at the final configured profile and imports
   * or unlocks a wallet from exactly 16 bytes of external seed entropy. This is
   * a lifecycle operation: call {@link stop} before selecting another wallet.
   */
  startExternalSeedWallet(
    config: RuntimeConfig,
    req: ExternalSeedWalletRequest,
  ): Promise<ExternalSeedWalletOpenResult>;
}

/**
 * Additive client capability for wallets defined by private output
 * descriptors instead of a mnemonic. Official web and React Native clients
 * implement it. Custom clients can keep implementing {@link WavelengthClient}
 * unless they need descriptor startup or export.
 */
export interface DescriptorWalletClient extends WavelengthClient {
  /**
   * Atomically starts the daemon at the final configured profile and imports
   * or unlocks a wallet from private descriptors, which share one master key or
   * are account-level keys covering every key family. This is a lifecycle
   * operation: call {@link stop} before selecting another wallet.
   */
  startDescriptorWallet(
    config: RuntimeConfig,
    req: DescriptorWalletRequest,
  ): Promise<DescriptorWalletOpenResult>;
  /**
   * Returns the open wallet's tr and wpkh descriptors: public by default, or
   * private when the request resupplies the wallet's mnemonic or root
   * descriptors. Use it to move a mnemonic wallet into descriptor software.
   */
  listWalletDescriptors(
    req?: ListWalletDescriptorsRequest,
  ): Promise<ListWalletDescriptorsResult>;
}
