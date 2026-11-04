import { useState } from "react";
import { Fingerprint, KeyRound } from "lucide-react";
import { AuthHeader } from "../../components/layout/AuthHeader";
import { AuthLayout } from "../../components/layout/AuthLayout";
import { Field } from "../../components/ui/Field";
import { InlineError } from "../../components/ui/InlineError";
import {
  GhostButton,
  PrimaryButton,
  TextLink,
} from "../../components/ui/Button";
import { Segmented } from "../../components/ui/Segmented";
import { ToggleRow } from "../../components/ui/ToggleRow";

// resize grows or shrinks a word list to the requested length, preserving any
// already-entered words.
function resize(words: string[], length: number): string[] {
  const next = words.slice(0, length);
  while (next.length < length) {
    next.push("");
  }

  return next;
}

// parseMnemonicPaste splits clipboard text on whitespace (spaces, tabs,
// newlines) into individual recovery words.
function parseMnemonicPaste(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

// parseDescriptorLines splits pasted text into one descriptor per line. Two
// lines are the usual export, tr() and wpkh().
function parseDescriptorLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// RestoreArgs is what the form submits: a phrase with its passphrase, or
// descriptors with their birthday, plus the options both share.
export type RestoreArgs = {
  password: string;
  recoverState: boolean;
  recoveryWindow?: number;
} & (
  | { source: "phrase"; mnemonic: string[]; passphrase: string }
  | { source: "descriptors"; descriptors: string[]; birthday?: Date }
);

// RestoreWalletScreen rebuilds a wallet on-device from an existing recovery
// phrase or private output descriptors. Restores are always password wallets,
// so it collects a new local password alongside them. When onRestorePasskey is provided and this
// device supports passkey PRF, it also offers a passkey-based alternative
// above the phrase form: rather than typing the recovery phrase, the wallet
// is derived straight from an existing passkey.
export function RestoreWalletScreen({
  network,
  onRestore,
  onBack,
  busy,
  error,
  onRestorePasskey,
  passkeyBusy,
  passkeyError,
  restoreFailure,
  onDismissRestoreFailure,
}: {
  network: string;
  onRestore: (args: RestoreArgs) => void;
  /** Stops the runtime and returns to the wallet list. */
  onBack: () => void;
  busy: boolean;
  error: string;
  /** Opens a wallet from a passkey the user already registered elsewhere. */
  onRestorePasskey?: () => void;
  passkeyBusy?: boolean;
  passkeyError?: string;
  /** A restore that failed before the wallet came up, or empty when none. */
  restoreFailure?: string;
  /** Dismisses the restore-failure message. */
  onDismissRestoreFailure?: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [count, setCount] = useState<12 | 24>(12);
  const [words, setWords] = useState<string[]>(() => resize([], 12));
  const [passphrase, setPassphrase] = useState("");
  const [source, setSource] = useState<"phrase" | "descriptors">("phrase");
  const [descriptorText, setDescriptorText] = useState("");
  const [showDescriptors, setShowDescriptors] = useState(false);
  const [birthday, setBirthday] = useState("");
  // Restores default to recovery on: a mnemonic without it rebuilds the seed
  // but leaves the wallet empty, which is rarely what someone restoring wants.
  const [recoverState, setRecoverState] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [recoveryWindow, setRecoveryWindow] = useState("");

  const passwordOk = password.length > 0 && password === confirm;
  const descriptors = parseDescriptorLines(descriptorText);
  const sourceOk =
    source === "phrase"
      ? words.every((w) => w.trim().length > 0)
      : descriptors.length > 0;
  // An empty window field means "let the daemon default"; only a present value
  // must parse to a positive integer.
  const windowOk =
    recoveryWindow.trim() === "" ||
    (/^\d+$/.test(recoveryWindow.trim()) && Number(recoveryWindow) > 0);
  const canSubmit = !busy && passwordOk && sourceOk && windowOk;

  // handleWordPaste distributes a multi-word clipboard string across the
  // recovery phrase inputs (e.g. paste all 24 words at once).
  function handleWordPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const parts = parseMnemonicPaste(e.clipboardData.getData("text"));
    if (parts.length <= 1) {
      return;
    }

    e.preventDefault();

    const length: 12 | 24 =
      parts.length === 12 ? 12 : parts.length === 24 ? 24 : count;

    if (length !== count) {
      setCount(length);
    }
    setWords(resize(parts, length));
  }

  // submit validates canSubmit and calls onRestore with the trimmed source.
  function submit() {
    if (!canSubmit) {
      return;
    }

    const window = recoveryWindow.trim();
    const options = {
      password,
      recoverState,
      recoveryWindow: recoverState && window !== "" ? Number(window) : undefined,
    };
    if (source === "descriptors") {
      onRestore({
        ...options,
        source,
        descriptors,
        birthday: birthday ? new Date(birthday) : undefined,
      });

      return;
    }
    onRestore({
      ...options,
      source,
      mnemonic: words.map((w) => w.trim()),
      passphrase: passphrase.trim(),
    });
  }

  return (
    <AuthLayout network={network} wide>
      <AuthHeader
        title="Restore wallet"
        sub="Enter your recovery phrase or descriptors to rebuild this wallet on-device."
      />

      {onRestorePasskey ? (
        <div className="mb-6">
          <GhostButton
            icon={Fingerprint}
            onClick={onRestorePasskey}
            disabled={busy || passkeyBusy}
            busy={passkeyBusy}
          >
            {passkeyBusy ? "Waiting for passkey…" : "Restore from passkey"}
          </GhostButton>
          <div className="mt-2">
            <InlineError message={passkeyError ?? ""} />
          </div>
          <div className="my-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-faint">or enter your keys</span>
            <span className="h-px flex-1 bg-border" />
          </div>
        </div>
      ) : null}

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field
          label="New password"
          type="password"
          placeholder="••••••••••"
          value={password}
          onChange={setPassword}
        />
        <Field
          label="Confirm password"
          type="password"
          placeholder="••••••••••"
          value={confirm}
          onChange={setConfirm}
        />

        <Segmented
          size="sm"
          value={source}
          onChange={setSource}
          options={[
            { value: "phrase", label: "Recovery phrase" },
            { value: "descriptors", label: "Descriptors" },
          ]}
        />

        {source === "phrase" ? (
          <>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Recovery phrase
                </span>
                <Segmented
                  size="sm"
                  value={String(count)}
                  onChange={(v) => {
                    const n = Number(v) as 12 | 24;
                    setCount(n);
                    setWords((w) => resize(w, n));
                  }}
                  options={[
                    { value: "12", label: "12 words" },
                    { value: "24", label: "24 words" },
                  ]}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {words.map((word, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 border border-border
                      bg-well px-2.5 py-1.5"
                  >
                    <span className="font-mono text-xs tabular-nums text-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <input
                      className="w-full bg-transparent text-sm text-fg
                        outline-none"
                      aria-label={`Word ${i + 1}`}
                      value={word}
                      onChange={(e) =>
                        setWords((w) =>
                          w.map((x, idx) => (idx === i ? e.target.value : x)),
                        )
                      }
                      onPaste={handleWordPaste}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Field
              label="BIP-39 passphrase (optional)"
              type="password"
              placeholder="leave blank if unused"
              value={passphrase}
              onChange={setPassphrase}
            />
          </>
        ) : (
          <>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label
                  htmlFor="restore-descriptors"
                  className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted"
                >
                  Private descriptors, one per line
                </label>
                <button
                  type="button"
                  className="text-xs font-medium text-muted hover:text-fg"
                  onClick={() => setShowDescriptors((v) => !v)}
                >
                  {showDescriptors ? "Hide" : "Show"}
                </button>
              </div>
              {/* Masked like a password: a private descriptor is as sensitive
                  as a recovery phrase. */}
              <textarea
                id="restore-descriptors"
                rows={4}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={"tr(xprv.../86h/0h/0h/<0;1>/*)#checksum\nwpkh(xprv.../84h/0h/0h/<0;1>/*)#checksum"}
                value={descriptorText}
                disabled={busy}
                onChange={(e) => setDescriptorText(e.target.value)}
                style={
                  showDescriptors
                    ? undefined
                    : ({ WebkitTextSecurity: "disc" } as React.CSSProperties)
                }
                className="w-full border border-border bg-well px-3 py-2.5
                  font-mono text-sm text-fg outline-none transition-colors
                  focus:border-border-strong disabled:cursor-not-allowed
                  disabled:text-muted"
              />
            </div>
            <Field
              label="Birthday (optional)"
              type="date"
              value={birthday}
              onChange={setBirthday}
              disabled={busy}
            />
          </>
        )}

        <div className="space-y-3 border border-border bg-well px-3 py-3">
          <ToggleRow
            title="Recover wallet state"
            subtitle="Rebuild balances and history from the operator's indexer.
              This scan can take a while."
            on={recoverState}
            onChange={setRecoverState}
            disabled={busy}
          />
          {recoverState && (
            <div className="space-y-3 border-t border-border pt-3">
              <button
                type="button"
                className="text-xs font-medium text-muted
                  hover:text-fg disabled:cursor-not-allowed"
                onClick={() => setShowAdvanced((v) => !v)}
                disabled={busy}
              >
                {showAdvanced ? "Hide advanced" : "Advanced"}
              </button>
              {showAdvanced && (
                <Field
                  label="Recovery window (optional)"
                  type="text"
                  inputMode="numeric"
                  mono
                  placeholder="daemon default"
                  value={recoveryWindow}
                  onChange={setRecoveryWindow}
                  disabled={busy}
                />
              )}
            </div>
          )}
        </div>

        <PrimaryButton type="submit" icon={KeyRound} disabled={!canSubmit}>
          {busy ? "Restoring wallet…" : "Restore wallet"}
        </PrimaryButton>
        <InlineError message={error} />
      </form>

      {restoreFailure ? (
        <div className="mt-6 border-t border-border pt-5">
          <InlineError message={restoreFailure} />
          <button
            type="button"
            onClick={onDismissRestoreFailure}
            className="mt-1 text-xs font-medium text-muted hover:text-fg"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Suppressed while a restore or passkey ceremony is in flight so the
          runtime is never torn down underneath a mid-flight daemon call. */}
      {!busy && !passkeyBusy ? (
        <div className="mt-5 text-center text-sm">
          <TextLink onClick={onBack}>Back to wallets</TextLink>
        </div>
      ) : null}
    </AuthLayout>
  );
}
