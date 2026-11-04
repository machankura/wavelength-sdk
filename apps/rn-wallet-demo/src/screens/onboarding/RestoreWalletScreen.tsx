import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ClipboardPaste, Fingerprint, KeyRound } from 'lucide-react-native';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { GhostButton, PrimaryButton, TextLink } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/InlineError';
import { SecretArea } from '../../components/ui/SecretArea';
import { Segmented } from '../../components/ui/Segmented';
import { ToggleRow } from '../../components/ui/ToggleRow';
import { parseBirthday } from '../../lib/format';
import { Palette, fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useThemedStyles } from '../../theme/useThemedStyles';

// resize grows or shrinks a word list to the requested length, preserving any
// already-entered words.
function resize(words: string[], length: number): string[] {
  const next = words.slice(0, length);
  while (next.length < length) {
    next.push('');
  }

  return next;
}

// parseMnemonicPaste splits clipboard text on whitespace into words.
function parseMnemonicPaste(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

const makeStyles = (p: Palette) => ({
  form: {
    gap: 16,
  },
  passkeySection: {
    marginBottom: 8,
  },
  divider: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 12,
    marginVertical: 20,
  },
  dividerLine: {
    backgroundColor: p.border,
    flex: 1,
    height: 1,
  },
  dividerText: {
    color: p.faint,
    fontFamily: fonts.sans,
    fontSize: 12,
  },
  restoreFailure: {
    gap: 6,
    marginTop: 20,
  },
  backRow: {
    alignItems: 'center' as const,
    marginTop: 20,
  },
  phraseHead: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    marginBottom: 8,
  },
  eyebrow: {
    color: p.muted,
    fontFamily: fonts.sansSemiBold,
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase' as const,
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  wordBox: {
    alignItems: 'center' as const,
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    flexBasis: '48%' as const,
    flexDirection: 'row' as const,
    flexGrow: 1,
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  wordIndex: {
    color: p.faint,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  wordInput: {
    color: p.text,
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    paddingVertical: 2,
  },
  recoverBox: {
    backgroundColor: p.well,
    borderColor: p.border,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  advanced: {
    borderTopColor: p.border,
    borderTopWidth: 1,
    gap: 12,
    paddingTop: 12,
  },
  advancedToggle: {
    color: p.muted,
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
});

// Divider renders the hairline "or" separator between the passkey restore
// affordance and the recovery phrase form.
function Divider({ label }: { label: string }) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

// parseDescriptorLines splits pasted text into one descriptor per line. Two
// lines are the usual export, tr() and wpkh().
function parseDescriptorLines(text: string): string[] {
  return text
    .split('\n')
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
  | { source: 'phrase'; mnemonic: string[]; passphrase: string }
  | { source: 'descriptors'; descriptors: string[]; birthday?: Date }
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
  const { palette } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [count, setCount] = useState<12 | 24>(12);
  const [words, setWords] = useState<string[]>(() => resize([], 12));
  const [passphrase, setPassphrase] = useState('');
  const [source, setSource] = useState<'phrase' | 'descriptors'>('phrase');
  const [descriptorText, setDescriptorText] = useState('');
  const [birthday, setBirthday] = useState('');
  // Restores default to recovery on: a mnemonic without it rebuilds the seed
  // but leaves the wallet empty, which is rarely what someone restoring wants.
  const [recoverState, setRecoverState] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [recoveryWindow, setRecoveryWindow] = useState('');

  const passwordOk = password.length > 0 && password === confirm;
  const descriptors = parseDescriptorLines(descriptorText);
  const parsedBirthday = parseBirthday(birthday);
  const sourceOk =
    source === 'phrase'
      ? words.every((w) => w.trim().length > 0)
      : descriptors.length > 0 && parsedBirthday !== null;
  // An empty window field means "let the daemon default"; only a present value
  // must parse to a positive integer.
  const windowOk =
    recoveryWindow.trim() === '' ||
    (/^\d+$/.test(recoveryWindow.trim()) && Number(recoveryWindow) > 0);
  const canSubmit = !busy && passwordOk && sourceOk && windowOk;

  // pastePhrase distributes a multi-word clipboard string across the inputs,
  // switching the word count when the clipboard holds exactly 12 or 24 words.
  // A clipboard read can reject under platform access restrictions, so a
  // failure is treated as an empty clipboard (the button no-ops) rather than
  // an unhandled rejection.
  const pastePhrase = async () => {
    let clip = '';
    try {
      clip = await Clipboard.getStringAsync();
    } catch {
      return;
    }
    const parts = parseMnemonicPaste(clip);
    if (parts.length <= 1) {
      return;
    }

    const length: 12 | 24 =
      parts.length === 12 ? 12 : parts.length === 24 ? 24 : count;
    if (length !== count) {
      setCount(length);
    }
    setWords(resize(parts, length));
  };

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Restore wallet"
        sub="Enter your recovery phrase or descriptors to rebuild this wallet on-device."
      />

      {onRestorePasskey ? (
        <View style={styles.passkeySection}>
          <GhostButton
            icon={Fingerprint}
            onPress={onRestorePasskey}
            disabled={busy || passkeyBusy}
            busy={passkeyBusy}
          >
            {passkeyBusy ? 'Waiting for passkey…' : 'Restore from passkey'}
          </GhostButton>
          <View style={{ marginTop: 8 }}>
            <InlineError message={passkeyError ?? ''} />
          </View>
          <Divider label="or enter your keys" />
        </View>
      ) : null}

      <View style={styles.form}>
        <Field
          label="New password"
          secure
          placeholder="••••••••••"
          value={password}
          onChange={setPassword}
        />
        <Field
          label="Confirm password"
          secure
          placeholder="••••••••••"
          value={confirm}
          onChange={setConfirm}
        />

        <Segmented
          size="sm"
          value={source}
          onChange={setSource}
          options={[
            { value: 'phrase', label: 'Recovery phrase' },
            { value: 'descriptors', label: 'Descriptors' },
          ]}
        />

        {source === 'phrase' ? (
          <>
            <View>
              <View style={styles.phraseHead}>
                <Text style={styles.eyebrow}>Recovery phrase</Text>
                <Segmented
                  size="sm"
                  value={String(count)}
                  onChange={(v) => {
                    const n = Number(v) as 12 | 24;
                    setCount(n);
                    setWords((w) => resize(w, n));
                  }}
                  options={[
                    { value: '12', label: '12 words' },
                    { value: '24', label: '24 words' },
                  ]}
                />
              </View>
              <View style={styles.grid}>
                {words.map((word, i) => (
                  <View key={i} style={styles.wordBox}>
                    <Text style={styles.wordIndex}>
                      {String(i + 1).padStart(2, '0')}
                    </Text>
                    <TextInput
                      style={styles.wordInput}
                      value={word}
                      onChangeText={(v) =>
                        setWords((w) => w.map((x, idx) => (idx === i ? v : x)))
                      }
                      autoCapitalize="none"
                      autoCorrect={false}
                      placeholderTextColor={palette.faint}
                      accessibilityLabel={`Word ${i + 1}`}
                    />
                  </View>
                ))}
              </View>
              <View style={{ marginTop: 12 }}>
                <GhostButton icon={ClipboardPaste} onPress={() => void pastePhrase()}>
                  Paste phrase
                </GhostButton>
              </View>
            </View>

            <Field
              label="BIP-39 passphrase (optional)"
              secure
              placeholder="leave blank if unused"
              value={passphrase}
              onChange={setPassphrase}
            />
          </>
        ) : (
          <>
            <SecretArea
              label="Private descriptors, one per line"
              value={descriptorText}
              onChange={setDescriptorText}
              placeholder={'tr(xprv.../86h/0h/0h/<0;1>/*)#checksum\nwpkh(xprv.../84h/0h/0h/<0;1>/*)#checksum'}
              disabled={busy}
            />
            <Field
              label="Birthday (optional)"
              mono
              placeholder="YYYY-MM-DD"
              value={birthday}
              onChange={setBirthday}
              disabled={busy}
            />
          </>
        )}

        <View style={styles.recoverBox}>
          <ToggleRow
            title="Recover wallet state"
            subtitle="Rebuild balances and history from the operator's indexer. This scan can take a while."
            on={recoverState}
            onChange={setRecoverState}
            disabled={busy}
          />
          {recoverState && (
            <View style={styles.advanced}>
              <Pressable
                onPress={() => setShowAdvanced((v) => !v)}
                disabled={busy}
              >
                <Text style={styles.advancedToggle}>
                  {showAdvanced ? 'Hide advanced' : 'Advanced'}
                </Text>
              </Pressable>
              {showAdvanced && (
                <Field
                  label="Recovery window (optional)"
                  numeric
                  mono
                  placeholder="daemon default"
                  value={recoveryWindow}
                  onChange={setRecoveryWindow}
                  disabled={busy}
                />
              )}
            </View>
          )}
        </View>

        <PrimaryButton
          icon={KeyRound}
          onPress={() => {
            if (canSubmit) {
              const window = recoveryWindow.trim();
              const options = {
                password,
                recoverState,
                recoveryWindow:
                  recoverState && window !== '' ? Number(window) : undefined,
              };
              if (source === 'descriptors') {
                onRestore({
                  ...options,
                  source,
                  descriptors,
                  birthday: parsedBirthday ?? undefined,
                });
              } else {
                onRestore({
                  ...options,
                  source,
                  mnemonic: words.map((w) => w.trim()),
                  passphrase: passphrase.trim(),
                });
              }
            }
          }}
          disabled={!canSubmit}
          busy={busy}
        >
          {busy ? 'Restoring wallet…' : 'Restore wallet'}
        </PrimaryButton>
        <InlineError message={error} />
      </View>

      {restoreFailure ? (
        <View style={styles.restoreFailure}>
          <InlineError message={restoreFailure} />
          <TextLink onPress={onDismissRestoreFailure}>Dismiss</TextLink>
        </View>
      ) : null}

      {/* Suppressed while a restore or passkey ceremony is in flight so the
          runtime is never torn down underneath a mid-flight daemon call. */}
      {!busy && !passkeyBusy ? (
        <View style={styles.backRow}>
          <TextLink onPress={onBack}>Back to wallets</TextLink>
        </View>
      ) : null}
    </AuthLayout>
  );
}
