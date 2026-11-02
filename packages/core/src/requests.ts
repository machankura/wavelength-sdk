// Request types stay hand-authored: they carry semantics the wire shape does not
// (e.g. a plain password the client base64-encodes into the Go []byte field), so
// core's facade module keeps explicit request mappers for them.

import type { EntryKind, ListView } from './generated.ts';
import { WavelengthError } from './errors.ts';

/**
 * Parameters for creating a new wallet.
 */
export type CreateWalletRequest = {
  /** The plain password the client base64-encodes into the daemon's byte field. */
  password: string;
  /** An optional existing mnemonic to restore from; a fresh one is generated when omitted. */
  mnemonic?: string[];
  /** An optional BIP-39 passphrase applied on top of the mnemonic. */
  seedPassphrase?: string;
  /**
   * Opt into server-assisted recovery. When true, the daemon rebuilds wallet
   * state (boarding UTXOs, VTXOs, and receive history) from the seed by
   * querying the operator's indexer, rather than starting empty. Leave it unset
   * or false when creating a fresh wallet; set it when restoring from a
   * `mnemonic` so the funds and activity come back. Defaults to false.
   */
  recoverState?: boolean;
  /**
   * The per-key-family look-ahead used during recovery: how many unused
   * addresses past the last used one the indexer scan probes before giving up.
   * Only meaningful when `recoverState` is true. Omit to let the daemon resolve
   * its own default; raise it if a wallet skipped a large gap of addresses.
   */
  recoveryWindow?: number;
  /**
   * Private output descriptors to build the wallet from instead of a mnemonic,
   * for example `tr(xprv.../86h/0h/0h/<0;1>/*)`. They must either share one
   * BIP32 master key, or be account-level private keys covering the on-chain
   * account and every key family. Mutually exclusive with `mnemonic` and
   * `seedPassphrase`. Private descriptors are as sensitive as a seed.
   */
  descriptors?: string[];
  /**
   * The earliest date the descriptor keys may have received funds; bounds the
   * first rescan of a descriptor import. Omit to scan from genesis. Ignored for
   * mnemonics, which carry their own birthday.
   */
  birthday?: Date;
};

/**
 * Parameters for listing a wallet's output descriptors.
 */
export type ListWalletDescriptorsRequest = {
  /**
   * Requests private descriptors. Requires the wallet's `mnemonic` or its
   * private root `descriptors`, which the daemon checks against the open wallet
   * before rendering anything private.
   */
  includePrivate?: boolean;
  /** The wallet's mnemonic, resupplied to authorize private export. */
  mnemonic?: string[];
  /** The optional passphrase for `mnemonic`. */
  seedPassphrase?: string;
  /** The wallet's private root descriptors, resupplied to authorize export. */
  descriptors?: string[];
};

/**
 * Opens one daemon wallet from private output descriptors. The daemon accepts
 * either of two forms. Descriptors that share one BIP32 master key: `tr()` under
 * `86h/0h/0h` and `wpkh()` under `84h/0h/0h`, coin type 0' on every network, with
 * branch `0`, `1` or `<0;1>`. Or account-level private keys: the BIP86 account
 * with its origin, `tr([fp/86h/0h/0h]xprv.../<0;1>/*)`, and the key families as
 * `[fp/1017h/COINh]xprv...` or one entry per family. A partial set is refused.
 */
export type DescriptorWalletRequest = {
  /** The private descriptors. They are as sensitive as a seed. */
  descriptors: string[];
  /** The earliest date the keys may have received funds; omit to scan from genesis. */
  birthday?: Date;
  /**
   * The identity public key observed on a previous open. The daemon also always
   * checks the opened wallet against the identity the descriptors derive.
   */
  expectedIdentityPubKey?: string;
  /** Runs the daemon's state-recovery scan for this open operation. */
  recoverState?: boolean;
  /** Recovery look-ahead for each address family; must fit in a uint32. */
  recoveryWindow?: number;
};

/** Validates a descriptor wallet request before startup. */
export function validateDescriptorWalletRequest(
  req: DescriptorWalletRequest,
): void {
  if (
    !Array.isArray(req.descriptors) ||
    req.descriptors.length === 0 ||
    req.descriptors.some((d) => typeof d !== 'string' || d.trim() === '')
  ) {
    throw new WavelengthError(
      'descriptors must be a nonempty array of nonempty strings',
      'invalid_descriptor',
    );
  }
  if (
    req.birthday !== undefined &&
    (!(req.birthday instanceof Date) || Number.isNaN(req.birthday.getTime()) ||
      req.birthday.getTime() < 0)
  ) {
    throw new WavelengthError(
      'birthday must be a valid Date at or after the Unix epoch',
      'invalid_descriptor',
    );
  }
  if (
    req.expectedIdentityPubKey !== undefined &&
    (typeof req.expectedIdentityPubKey !== 'string' ||
      req.expectedIdentityPubKey === '')
  ) {
    throw new WavelengthError(
      'expectedIdentityPubKey must be a nonempty string',
      'invalid_descriptor',
    );
  }
  if (req.recoverState !== undefined && typeof req.recoverState !== 'boolean') {
    throw new WavelengthError(
      'recoverState must be a boolean',
      'invalid_descriptor',
    );
  }
  if (
    req.recoveryWindow !== undefined &&
    (!Number.isSafeInteger(req.recoveryWindow) ||
      req.recoveryWindow < 0 ||
      req.recoveryWindow > 0xffff_ffff)
  ) {
    throw new WavelengthError(
      'recoveryWindow must be an integer that fits in uint32',
      'invalid_descriptor',
    );
  }
}

/**
 * Parameters for unlocking an existing wallet.
 */
export type UnlockWalletRequest = {
  /** The plain password the client base64-encodes into the daemon's byte field. */
  password: string;
};

/**
 * Parameters for opening a wallet from a passkey assertion.
 */
export type OpenWalletFromPasskeyRequest = {
  /** The PRF output (hex) derived from the passkey ceremony. */
  prfOutput: string;
};

/**
 * Opens one daemon wallet from seed entropy derived by a higher-level owner.
 * This low-level lifecycle request deliberately contains no root mnemonic,
 * passphrase, account index, network, or profile location.
 */
export type ExternalSeedWalletRequest = {
  /** Exactly 16 bytes of entropy for the daemon's internal wallet seed. */
  seedEntropy: Uint8Array;
  /**
   * The identity public key observed on a previous open. When supplied, the
   * daemon refuses to open a wallet whose derived identity does not match.
   */
  expectedIdentityPubKey?: string;
  /** Runs the daemon's state-recovery scan for this open operation. */
  recoverState?: boolean;
  /**
   * Recovery look-ahead for each address family. Only meaningful when
   * {@link recoverState} is true and must fit in a uint32.
   */
  recoveryWindow?: number;
};

/** Validates entropy and recovery fields before external-seed startup. */
export function validateExternalSeedWalletRequest(
  req: ExternalSeedWalletRequest,
): void {
  if (!(req.seedEntropy instanceof Uint8Array) || req.seedEntropy.length !== 16) {
    throw new WavelengthError(
      'seedEntropy must be a 16-byte Uint8Array',
      'invalid_external_seed',
    );
  }

  if (
    req.expectedIdentityPubKey !== undefined &&
    (
      typeof req.expectedIdentityPubKey !== 'string' ||
      req.expectedIdentityPubKey === ''
    )
  ) {
    throw new WavelengthError(
      'expectedIdentityPubKey must be a nonempty string',
      'invalid_external_seed',
    );
  }
  if (
    req.recoverState !== undefined &&
    typeof req.recoverState !== 'boolean'
  ) {
    throw new WavelengthError(
      'recoverState must be a boolean',
      'invalid_external_seed',
    );
  }
  if (
    req.recoveryWindow !== undefined &&
    (
      !Number.isSafeInteger(req.recoveryWindow) ||
      req.recoveryWindow < 0 ||
      req.recoveryWindow > 0xffff_ffff
    )
  ) {
    throw new WavelengthError(
      'recoveryWindow must be an integer that fits in uint32',
      'invalid_external_seed',
    );
  }
}

/**
 * Parameters for generating an on-chain deposit address.
 */
export type DepositRequest = {
  /** An optional hint for the amount (in sats) the caller intends to deposit. */
  amountSatHint?: number;
};

/**
 * Parameters for generating a receive invoice.
 */
export type ReceiveRequest = {
  /** The amount to request, in sats. */
  amountSat: number;
  /** An optional memo attached to the invoice. */
  memo?: string;
};

/**
 * Parameters for sending a payment, as a discriminated union: supply an
 * `invoice` for a Lightning send or an `onchainAddress` for an on-chain send.
 * The two are mutually exclusive, and `sweepAll` applies only to on-chain sends.
 */
export type SendRequest =
  | {
      /** A Lightning invoice to pay. */
      invoice: string;
      /** The amount to send, in sats. Ignored on the invoice path: v1 requires an amount-bearing BOLT-11 invoice. */
      amountSat?: number;
      /** An optional note recorded with the activity. */
      note?: string;
      /** An optional cap on the fee, in sats. */
      maxFeeSat?: number;
      /**
       * The most server credit, in sats, this send may reserve, including
       * credit funded by a top-up. Omitted or zero disables credit use, so an
       * invoice below the server's minimum Ark output fails to quote.
       */
      maxCreditSat?: number;
      /**
       * The most new Ark value, in sats, this send may move into server
       * credit. Omitted or zero disables credit top-ups. The server may round
       * a shortfall up to its minimum Ark output, and the rounded amount must
       * stay within this cap.
       */
      maxCreditTopupSat?: number;
    }
  | {
      /** An on-chain address to pay. */
      onchainAddress: string;
      /** The amount to send, in sats. Provide this or set `sweepAll`. */
      amountSat?: number;
      /** When true, sweeps the entire spendable balance to the destination. */
      sweepAll?: boolean;
      /** An optional note recorded with the activity. */
      note?: string;
      /** An optional cap on the fee, in sats. */
      maxFeeSat?: number;
    };

/**
 * Parameters for listing wallet activity or UTXOs.
 */
export type ListRequest = {
  /** Which view to list: activity entries, VTXOs, or on-chain outputs. */
  view?: ListView;
  /** When true, returns only pending items. */
  pendingOnly?: boolean;
  /** Restricts results to the selected activity kinds. */
  kinds?: EntryKind[];
  /** The maximum number of items to return. */
  limit?: number;
  /**
   * The number of items to skip for pagination. Applies to the `vtxos` and
   * `onchain` views only; the `activity` view paginates by `cursor` and
   * ignores `offset`.
   */
  offset?: number;
  /**
   * The opaque pagination token for the `activity` view. Empty starts from
   * the newest entry; otherwise pass the `nextCursor` from the previous
   * {@link ActivityList} page. Ignored by the `vtxos` and `onchain` views.
   */
  cursor?: string;
};

/** Exact acknowledgement required to start a unilateral unroll. */
export const FORCE_UNROLL_ACK = 'I_KNOW_WHAT_I_AM_DOING' as const;

/**
 * Parameters for exiting one VTXO through a cooperative leave or an explicitly
 * acknowledged unilateral unroll.
 */
export type ExitRequest =
  | {
      /** The VTXO outpoint to exit. */
      outpoint: string;
      /**
       * Cooperative on-chain destination. When omitted, the daemon generates
       * a fresh backing-wallet address.
       */
      destination?: string;
      /** Unavailable on the cooperative branch. */
      forceUnrollAck?: never;
    }
  | {
      /** The VTXO outpoint to exit. */
      outpoint: string;
      /** Unavailable on the unilateral branch. */
      destination?: never;
      /** The exact acknowledgement required to start unilateral unroll. */
      forceUnrollAck: typeof FORCE_UNROLL_ACK;
    };

/**
 * Parameters for querying the status of an exit.
 */
export type ExitStatusRequest = {
  /** The VTXO outpoint whose exit status is queried. */
  outpoint: string;
  /**
   * Request recovery-tree progress, a CSV maturity countdown, a fee breakdown,
   * and a best-case block countdown. It costs one live actor round-trip plus a
   * fee estimate, so leave it unset or false (both give the coarse, cheaper
   * phase-only status). Omitting it defaults to false; the wavecli `exit
   * status` command defaults to true instead.
   */
  detailed?: boolean;
};

/**
 * Parameters for summarizing all in-progress exits. Takes no arguments; the
 * daemon reports the wallet-wide portfolio.
 */
export type ExitSummaryRequest = Record<string, never>;

/**
 * Previews unilateral-exit readiness for a set of VTXO outpoints (funding the
 * backing wallet needs before Exit can run).
 */
export type GetExitPlanRequest = {
  /** The VTXO outpoints to plan an exit for. */
  outpoints: string[];
  /** An optional confirmation target (in blocks) used to estimate fees. */
  confTarget?: number;
};

/**
 * Previews (`broadcast: false`) or broadcasts (`broadcast: true`) a sweep of the
 * backing wallet to destinationAddress. It moves funds when broadcast is true,
 * so surface the preview to the user first.
 */
export type SweepWalletRequest = {
  /** The on-chain address to sweep the backing wallet to. */
  destinationAddress: string;
  /** When true, broadcasts the sweep; when false (the default), only previews it. */
  broadcast?: boolean;
  /** An optional explicit fee rate, in sat/vByte. */
  feeRateSatPerVByte?: number;
  /** An optional confirmation target (in blocks) used to estimate fees. */
  confTarget?: number;
};

/**
 * A restore request: creation options stay meaningful on import, and exactly
 * one source is mandatory, either a mnemonic or private output descriptors.
 */
export type RestoreWalletRequest = CreateWalletRequest &
  (
    | {
        /** The recovery phrase to restore from. */
        mnemonic: string[];
        descriptors?: undefined;
      }
    | {
        /** The private descriptors to restore from. */
        descriptors: string[];
        mnemonic?: undefined;
      }
  );
