# Keys, backup & recovery

A Wavelength wallet is usually a hierarchical-deterministic (HD) wallet rooted
in a single seed, whose origin depends on the auth mode (typed password or
passkey). It can instead be built from keys that already exist: private output
descriptors, or a remote signer that keeps the keys off the device entirely.
What a wallet is built from decides what sits on disk, what counts as a backup,
and what a user needs to get funds back on a new device.

This is the repo copy of the concepts page published at
[wavelength.lightning.engineering/concepts/keys-backup-and-recovery](https://wavelength.lightning.engineering/concepts/keys-backup-and-recovery/);
the lifecycle states and UI phases around unlock are covered in
[Wallet lifecycle & auth](https://wavelength.lightning.engineering/concepts/wallet-lifecycle-and-auth/).

## Where the keys come from

| Wallet | Keys come from | Keys live in | Unlocked by |
|---|---|---|---|
| Password | A generated or imported 24-word mnemonic | The wallet database | The password |
| Passkey | The passkey's PRF output | The wallet database | The passkey |
| Descriptor | Private output descriptors you supply | The wallet database | The password you chose, or one derived from the keys |
| Watch-only | A remote signer's export | The signer. The wallet database holds public keys and at most two authentication keys | The password you chose, with the signer reachable |

The next sections cover the seed-based pair, then
[descriptor and watch-only wallets](#descriptor-and-watch-only-wallets).

## One seed, two ways to derive it

A **password wallet** gets its seed from a freshly generated (or imported)
24-word mnemonic; the password protects the wallet's key material at rest. A
**passkey wallet** inverts this: the seed itself is *derived* from the
passkey, so the passkey is simultaneously the unlock credential and the root
secret.

```mermaid
flowchart TD
  PK["Passkey assertion<br/>(WebAuthn PRF output)"] --> HKDF["HKDF-SHA256"]
  HKDF -->|"info: wavewalletdk:seed:v1"| ENT["16-byte entropy"]
  HKDF -->|"info: wavewalletdk:dbpw:v1"| DBP["wallet DB password<br/>(64-char hex)"]
  ENT --> AZ["aezeed mnemonic<br/>(24 words)"]
  AZ --> SEED["HD wallet seed"]
  PW["User password"] --> DBP2["wallet DB password"]
  MN["Generated / imported<br/>mnemonic"] --> SEED
  SEED --> DB[("wallet database<br/>(OPFS / app sandbox)")]
  DBP --> DB
  DBP2 --> DB
```

Both paths converge on the same storage: the seed lives only inside the
wallet database, encrypted under the wallet DB password and stored
device-locally. On the web that is OPFS, the browser's origin-private file
system. On React Native it is a data directory inside the app sandbox:
`RuntimeConfig.dataDir`, defaulting to the platform path reported by
`getDefaultDataDir()`. Either way the database never leaves the device, and
no key material ever reaches the operator or any server.

## The passkey ceremony

Passkey wallets are built on the WebAuthn **PRF extension**: an authenticator
holds a hidden pseudo-random function per credential, and evaluating it over
a fixed input yields a stable 32-byte secret. The SDK always evaluates the
PRF over the same input, `SHA-256("wavewalletdk-passkey:v1")` (exported from
core as `PASSKEY_PRF_SALT_HEX`), so the same
passkey produces the same secret on every device and every session. That
determinism is the whole design: the PRF output *is* the wallet's root
secret.

On the web, `registerPasskeyWallet(appName)` creates the credential with
`authenticatorAttachment: 'platform'`, `residentKey: 'required'`, and
`userVerification: 'required'`, meaning a discoverable, biometric-gated
passkey in the platform authenticator (Face ID, Touch ID, Windows Hello, or
a synced password manager). Some browsers do not return a PRF result from
the creation ceremony itself, so registration falls back to an immediate
assertion scoped to the just-created credential to read the PRF value
reliably.

`assertPasskeyPrf(credentialId?)` runs the returning-session ceremony. With
a stored `credentialId` the assertion is scoped to that one credential and
the OS unlocks it directly; without one, the assertion is *discoverable*, so
a passkey synced from another device can be offered even though this device
has never seen the wallet. The `credentialId` is not a secret; persisting
it in `localStorage` just skips the credential chooser on the next unlock.

On React Native, `createNativePasskeyCeremony({ rpId })` supplies the same
ceremony through the platform credential APIs: Credential Manager on Android
and AuthenticationServices on iOS (iOS support is experimental and needs iOS
18 or newer). Because every platform evaluates the PRF over the same fixed
input, the same passkey derives the same wallet everywhere: a wallet created
in the browser opens in the app, and vice versa, provided both use the same
relying-party domain.

> **Caution:** Passkeys are bound to the **relying-party ID**. On the web
> the SDK sets it to the page's hostname; on React Native you pass `rpId`
> explicitly and must associate that domain with your app (see
> [Passkey setup](https://wavelength.lightning.engineering/react-native/get-started/passkey-setup/)).
> If the app later moves to a different domain, existing passkeys cannot be
> asserted there and passkey-based recovery breaks for every user. Plan the
> relying-party domain as a long-term commitment, share it between your web
> and mobile apps so one passkey opens both, and treat the mnemonic as the
> domain-independent escape hatch.

## Seed derivation

The wallet runtime (the Go SDK, compiled to WASM on the web and bundled as
a native library on React Native) expands the PRF output with
**HKDF-SHA256** into two domain-separated secrets:

| HKDF `info` | Output | Role |
|---|---|---|
| `wavewalletdk:seed:v1` | 16 bytes | aezeed entropy (the HD wallet seed) |
| `wavewalletdk:dbpw:v1` | 32 bytes, hex-encoded | wallet DB password |

The entropy is wrapped into an [aezeed](https://github.com/lightningnetwork/lnd/tree/master/aezeed)
cipher seed with a pinned version and a birthday pinned to the Bitcoin
genesis date, and an **empty seed passphrase**. Pinning all three means the
wallet is a pure function of the PRF output: nothing else needs to be stored
or remembered for the keys to be reproducible.

Two invariants protect this contract:

- **The PRF input never changes.** The evaluation input is fixed per
  namespace version. If a caller ever evaluated the PRF over a different
  input, the same passkey would silently derive a different seed (a
  different wallet), and the original funds would be unreachable until the
  correct input is used again.
- **Short PRF outputs are rejected.** The SDK refuses PRF outputs under 32
  bytes, so a platform bug or empty input cannot collapse the derivation
  into a low-entropy, attacker-reproducible seed.

The derived DB password plays the same role a typed password plays in a
password wallet: it is the private passphrase that encrypts the wallet
database's key material at rest. Because it comes out of HKDF, it carries
the full 32 bytes of entropy, far stronger than any human password. And
because the derivation is deterministic, every device derives the same
password without storing or syncing it, which is why a passkey wallet never
shows a password prompt.

For a **password wallet**, the user's typed password is used directly as the
wallet database passphrase, and the seed comes from a mnemonic generated by
the daemon (`createWallet({ password })`) or imported by the user
(`createWallet({ password, mnemonic })`). An optional seed passphrase
(`seedPassphrase`) can be layered on an imported mnemonic; passkey wallets
always use an empty one.

## Descriptor and watch-only wallets

A **descriptor wallet** is built from private output descriptors, for keys that
another wallet already holds: either descriptors that share one master key, or
account-level private keys covering the on-chain account and every key family. See
[Restore a wallet](/guides/restore-a-wallet/#restore-from-output-descriptors).
There is no mnemonic, so the descriptors are the wallet: they are as sensitive as a
seed. `createWallet({ password, descriptors })` protects the database with the
password you choose. `startDescriptorWallet()` takes no password and derives one
from the keys, so the same descriptors unlock it on every open.

A **watch-only wallet** keeps its private keys on a separate machine. A remote
signer such as `wavesigner` or lnd holds them, and the wallet holds public keys and
asks the signer over gRPC for every signature. It needs a native transport: a
browser runtime cannot dial a signer, so the web transport refuses these wallets.
See [Use a remote signer](/guides/use-a-remote-signer/).

A signer exports one of three things:

- A **bundle** of public keys. Every signature then comes from the signer.
- A **minimal bundle**, which adds the two authentication keys as private keys. The
  daemon signs round joins and payment receipts itself, while every key that can
  move funds stays on the signer. It holds private keys, so keep it out of logs.
- A **manifest** with an **authentication keys** file, when a wallet's fund slots
  come from different keys. The manifest is public. Its hash is reported as
  `manifestHash` and identifies which manifest created the wallet.

On every open, the daemon has the signer sign a challenge with each fund key and
checks the signatures against its own copy. A wallet pointed at the wrong signer
refuses to open instead of failing at its first spend.

## What is stored where

| Artifact | Where | Protected by |
|---|---|---|
| HD seed and derived keys | Wallet database in OPFS (web) or the app-sandbox data directory (React Native) | Encrypted under the wallet DB password (typed password, or HKDF-derived for passkey wallets) |
| Swap and daemon bookkeeping | SQLite databases alongside the wallet database | Origin or app-sandbox isolation (no key material) |
| Passkey private key | Platform authenticator / passkey provider | Device biometrics or PIN; provider sync encryption |
| `credentialId`, wallet-kind markers | App-level storage (`localStorage` on web, by convention) | Nothing (not secret) |
| Mnemonic | Wherever the user wrote it down | The user |
| Private descriptors | Imported into the wallet database, and wherever the user keeps their copy | Encrypted under the wallet DB password once imported |
| Watch-only public keys, authentication keys | Wallet database | Encrypted under the wallet DB password |
| Fund private keys of a watch-only wallet | The remote signer, not this device | The signer's own key store |
| Signer macaroon and TLS certificate | Files the daemon opens by path, on the device | App-sandbox isolation; the macaroon grants signing |

Nothing above leaves the device except the passkey itself, which the
platform's passkey provider (iCloud Keychain, Google Password Manager,
1Password, and similar) may sync end-to-end encrypted across the user's
devices. The operator sees signed protocol messages, never keys. A watch-only
wallet also sends the signer what it needs to sign, over TLS with the macaroon.

## Backup

A passkey wallet has two independent backup layers:

1. **The synced passkey.** If the user's passkey provider syncs credentials,
   the wallet is already recoverable on any device signed into that
   provider: the PRF travels with the credential, and the seed is derived
   from it on demand. This is the primary, zero-effort layer.
2. **The mnemonic.** When a passkey wallet is created (or first imported on
   a device), the result includes a 24-word aezeed mnemonic. It decodes to
   the same entropy the passkey derives, so it recovers the same wallet
   *without* the passkey, on any domain, in any aezeed-compatible flow.
   Offer it to the user once, encourage writing it down, and do not persist
   it anywhere.

> **Note:** Two exports of the same passkey wallet show **different 24-word
> phrases**. aezeed encrypts the entropy under a fresh random salt each time
> it renders a mnemonic, so the words differ while deciphering to the same
> entropy, and therefore the same wallet. Both phrases are valid backups; a
> re-export that differs from the recorded phrase is expected, not a bug.

A password wallet has exactly one backup layer: the mnemonic. The password
cannot be recovered or reset from anywhere, and without the mnemonic a
forgotten password means the funds are gone once the local database is lost.

A descriptor wallet's backup is its private descriptors. A wallet opened with
`startDescriptorWallet()` needs them on every open as well.

A watch-only wallet's backup is the signer's: the keys are there, not on this
device. Losing the device loses nothing that the signer and its export cannot
rebuild. A wallet with a manifest needs more than a seed, because the manifest is
the only record of which key fills which slot. Back up the manifest, every key
source it names, and the primary root together. A signer restored from its primary
seed alone holds different keys, and `wavesigner create --manifest` catches that by
refusing a key store that does not fill every slot.

## Recovery paths

| Scenario | Path | What comes back |
|---|---|---|
| Same device, returning session | Passkey assertion (scoped to the stored `credentialId`) + `openWalletFromPasskey()` / `unlockWallet({ password })` | Everything; the local database is intact |
| New device, synced passkey | Discoverable passkey assertion + `openWalletFromPasskey()`. The wallet state is `'none'`, so the SDK derives the seed and imports it | Keys immediately; the view of funds converges in the background |
| Lost passkey, has mnemonic | `createWallet({ password, mnemonic, recoverState: true })`; the wallet continues as a password wallet | Keys immediately; funds and history via server-assisted recovery |
| Lost passkey and mnemonic | None | Nothing; there is no custodial reset |
| New device, private descriptors | `createWallet({ password, descriptors, recoverState: true })` or `startDescriptorWallet()` | Keys immediately; funds and history via server-assisted recovery |
| New device, watch-only wallet | `createWallet({ password, watchOnlyBundle })`, or a manifest with its `authKeys`, on a runtime started with the signer's settings | Public keys immediately; the view of funds converges, with recovery needing the signer too |
| Lost signer, has its seed or keys | Rebuild the signer with `wavesigner create`, with `--manifest` for a wallet that has one | The same keys, which the wallet checks on its next open |
| Lost signer and its keys | None | Nothing; a watch-only wallet cannot sign without them |

Recovery restores the *seed* instantly; restoring the *view* of funds takes
a scan. A mnemonic restore can opt into **server-assisted recovery** with
`recoverState: true`: the daemon walks the seed's addresses and queries the
operator's indexer to rebuild boarding outputs, VTXOs, and Lightning receive
history, tracked in the background through the engine's `'restoring'` phase
and `snapshot.recovery`. See
[Restore a wallet](https://wavelength.lightning.engineering/guides/restore-a-wallet/)
for the full flow. The passkey import path does not run that scan today, so
an app that supports passkey recovery on a fresh device should treat the
imported wallet's view of funds as converging rather than immediate.

> **Caution:** Recovery reproduces keys, not liveness obligations. VTXOs
> have expiries and unilateral-exit windows; a wallet that has been offline
> for a long time should be brought back online with enough margin to
> refresh or exit its VTXOs.

## Security model

- **Spending requires the device.** A passkey assertion demands user
  verification (biometric or PIN) on an unlocked device. Anyone who can pass
  that check can derive the seed; there is no second factor beyond the
  platform's.
- **The database at rest is only as strong as its passphrase.** For passkey
  wallets that is 32 bytes of HKDF output, effectively unbreakable offline.
  For password wallets it is the user's password; encourage real passphrases.
- **The app is part of the trust boundary.** Script running on the wallet's
  web origin, or code running inside the mobile app's process, can drive a
  ceremony (still gated by a user-verification prompt) and can read the PRF
  output once a legitimate ceremony completes. XSS on the wallet origin or a
  compromised dependency in the app bundle is therefore equivalent to key
  compromise; treat content-security policy and dependency hygiene as wallet
  security, not routine hygiene.
- **The mnemonic is the root of everything.** Anyone holding the 24 words
  holds the wallet, independent of passkeys, devices, or domains.
