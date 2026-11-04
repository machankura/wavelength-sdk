import { useState } from 'react';
import { View } from 'react-native';
import { KeyRound } from 'lucide-react-native';
import { AuthHeader } from '../../components/layout/AuthHeader';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { PrimaryButton, TextLink } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { InlineError } from '../../components/ui/InlineError';
import { SecretArea } from '../../components/ui/SecretArea';
import { Segmented } from '../../components/ui/Segmented';
import { parseBirthday } from '../../lib/format';
import { Palette } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useThemedStyles';

const makeStyles = (_p: Palette) => ({
  form: {
    gap: 16,
  },
  backRow: {
    alignItems: 'center' as const,
    marginTop: 20,
  },
});

// WatchOnlyWalletArgs is what the form submits: the signer's export, the local
// password, and how far back to scan.
export type WatchOnlyWalletArgs = {
  password: string;
  birthday?: Date;
} & (
  | { watchOnlyBundle: string }
  | { watchOnlyManifest: string; authKeys: string }
);

// WatchOnlyWalletScreen creates a wallet whose fund keys stay on a remote
// signer. The runtime is already started with the signer's settings by the time
// this renders. The bundle and authentication keys are needed only here, because
// the wallet database then holds the imported keys, so they live in this form's
// state and go when it unmounts. A failure stays on the form, where submitting
// again is the retry: a signer that is down is the common cause.
export function WatchOnlyWalletScreen({
  network,
  onCreate,
  onBack,
  busy,
  error,
}: {
  network: string;
  onCreate: (args: WatchOnlyWalletArgs) => void;
  /** Stops the runtime and returns to the wallet list. */
  onBack: () => void;
  busy: boolean;
  error: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const [source, setSource] = useState<'bundle' | 'manifest'>('bundle');
  const [bundle, setBundle] = useState('');
  const [manifest, setManifest] = useState('');
  const [authKeys, setAuthKeys] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [birthday, setBirthday] = useState('');

  const parsedBirthday = parseBirthday(birthday);
  const sourceOk =
    source === 'bundle'
      ? bundle.trim().length > 0
      : manifest.trim().length > 0 && authKeys.trim().length > 0;
  const canSubmit =
    !busy &&
    sourceOk &&
    password.length > 0 &&
    password === confirm &&
    parsedBirthday !== null;

  function submit() {
    if (!canSubmit || parsedBirthday === null) {
      return;
    }
    const options = { password, birthday: parsedBirthday };
    onCreate(
      source === 'bundle'
        ? { ...options, watchOnlyBundle: bundle }
        : { ...options, watchOnlyManifest: manifest, authKeys },
    );
  }

  return (
    <AuthLayout network={network}>
      <AuthHeader
        title="Watch-only wallet"
        sub="Paste what your signer exported. Your keys stay on the signer, which must be reachable to open this wallet."
      />

      <View style={styles.form}>
        <Segmented
          size="sm"
          value={source}
          onChange={setSource}
          options={[
            { value: 'bundle', label: 'Bundle' },
            { value: 'manifest', label: 'Manifest' },
          ]}
        />

        {source === 'bundle' ? (
          <SecretArea
            label="Signer bundle"
            value={bundle}
            onChange={setBundle}
            placeholder="wavesigner export-watchonly"
            disabled={busy}
          />
        ) : (
          <>
            <SecretArea
              label="Signer manifest"
              value={manifest}
              onChange={setManifest}
              placeholder="--manifest-out"
              disabled={busy}
            />
            <SecretArea
              label="Authentication keys"
              value={authKeys}
              onChange={setAuthKeys}
              placeholder="--auth-keys-out"
              disabled={busy}
            />
          </>
        )}

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
        <Field
          label="Birthday (optional)"
          mono
          placeholder="YYYY-MM-DD"
          value={birthday}
          onChange={setBirthday}
          disabled={busy}
        />

        <PrimaryButton
          icon={KeyRound}
          onPress={submit}
          disabled={!canSubmit}
          busy={busy}
        >
          {busy ? 'Opening wallet…' : 'Open wallet'}
        </PrimaryButton>
        <InlineError message={error} />
      </View>

      {!busy ? (
        <View style={styles.backRow}>
          <TextLink onPress={onBack}>Back to wallets</TextLink>
        </View>
      ) : null}
    </AuthLayout>
  );
}
