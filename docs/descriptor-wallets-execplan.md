# Finish descriptor and watch-only wallets in the TypeScript SDK

This ExecPlan is a living document. The sections `Progress`, `Surprises &
Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must stay current
while the work proceeds. It follows the ExecPlan rules in `PLANS.md` at the root
of the sibling `wavelength` repository.


## Purpose / Big Picture

The `descriptors` branch here has the low-level client methods for descriptor and
watch-only wallets. An app using the recommended path, `WalletEngine` and the React
hooks, can restore from descriptors but cannot export them or open a watch-only
wallet. Neither demo app shows any of this, the concept docs still say every wallet
comes from one seed, the command line docs do not cover the new commands, and none of
it has run outside unit tests.

After this work, a web or React Native app can restore from descriptors and export them
through hooks. A React Native app can open a watch-only wallet, whose keys stay on a
remote signer such as `wavesigner`. Both demos show it, the docs and agent skills describe
it, and the SDK ships paired with a daemon release containing it.

To see it working, run the web demo, choose to restore from descriptors, paste a
descriptor, and export the public descriptors from the settings screen. On a phone or
emulator, the React Native demo opens a watch-only wallet against a `wavesigner` on the host
machine.


## Progress

- [x] (2026-11-02) `startDescriptorWallet`, `listWalletDescriptors`, descriptors through
  `createWallet` and `restoreWallet`, web locks and redaction, React Native dispatch, docs.
- [x] (2026-11-04) `startWatchOnlyWallet`, `remoteSigner*` config fields, the web transport's
  refusal, React Native dispatch, docs. An SDK request was
  passed through the `wavelength-wdk` native transport into the Go parser once, by hand, and
  every field survived.
- [x] (2026-11-04) Milestone 1: correct the account-level descriptor docs, link the new symbols,
  and fix the wdk README. Checked against the real parser; see Artifacts and Notes.
- [x] (2026-11-04) Milestone 2: watch-only through `createWallet`, and the React Native lifecycle
  check. The JSON was decoded by Go's real `CreateWalletRequest` once, by hand.
- [x] (2026-11-04) Milestone 3: `WalletEngine` and React hooks.
- [x] (2026-11-04) Milestone 4: web demo, with a Playwright test. The whole hermetic suite passed
  locally, 9 of 9, against a wasm build of `wavelength` at `6786ea4b`.
- [x] (2026-11-04) Milestone 5, Android only: React Native demo, run on an emulator against a local
  build of `wavelength` at `6786ea4b`. Acceptance results are in Artifacts and Notes.
- [ ] Milestone 5, iOS: `WavelengthModule.mm` has still never been compiled, and none of the acceptance
  list has run on iOS. It needs macOS.
- [x] (2026-11-04) Milestone 6: concept docs, CLI docs, guides and agent skills.
- [ ] Milestone 7: pair with a daemon release and verify the whole ladder. Blocked until `wavelength`
  publishes a release containing its `descriptors` branch.


## Surprises & Discoveries

These were found while writing this plan, from reading the code on 2026-11-04.

- Observation: Our own docs are wrong about account-level descriptors. The restore guide says
  they are refused, and the `startDescriptorWallet` reference says anything but master-key
  forms is refused, but the daemon accepts account-level private keys that cover the on-chain
  account and every key family.
  Evidence: `parseDescriptorWalletRequest` in `sdk/wavewalletdk/descriptor.go` in `wavelength`
  routes on `walletdesc.HasAccountKeys`. `wavelength-wdk`'s README repeats the claim, and so does
  `wavelength-mobile`'s API guide.

- Observation: This branch cannot merge alone. `WavelengthModule.kt` and `WavelengthModule.mm`
  call `Mobile.startDescriptorWallet` and `Mobile.startWatchOnlyWallet`, which are in no
  published binary, so React Native builds against the pinned release fail until the pin moves.
  `RUNTIME_MANIFEST_VERSION` is `v0.2.0`, and neither it nor `v0.2.1` has them.
  Evidence: `packages/core/src/version.ts`; `git rev-list --count v0.2.1..descriptors` is 98 in
  `wavelength`.

- Observation: The base class's three host-owned start verbs do not go through
  `enqueueLifecycle`. The web clients override them to do so. `NativeWavelengthClient` does
  not, and its `opChain` covers only the activity stream.
  Evidence: `packages/core/src/base-client.ts`; `packages/react-native/src/client.ts` overrides
  only `start`.

- Observation: `apps/docs/src/config/api-links.ts` lists the external-seed symbols but none of
  the descriptor or watch-only ones, so those names do not link in the docs.
  Evidence: `grep -n "ExternalSeed\|Descriptor\|WatchOnly" apps/docs/src/config/api-links.ts`.

- Observation: Playwright tests cannot run on a fresh machine until its browser is installed.
  Evidence: `apps/docs` fails with "Executable doesn't exist" for `chromium_headless_shell`.

- Observation: The reference's `FacadeMethod` listing had none of the new verbs, and an account key
  with no key origin is refused too, as a bad master key rather than as a partial account set.
  Evidence: `apps/docs/src/content/docs/reference/wavelength-core.mdx`, and the parser run in
  Artifacts and Notes.

- Observation: A plain `start()` with no `dataDir` followed at once by `stop()` reaches the React
  Native module as `stop`, `start`, because `start` awaits `getDefaultDataDir` first. The stop is a
  no-op, the start then succeeds, and a daemon is left running after a stop that resolved. It predates
  this work and does not affect the three host-owned verbs, which require a `dataDir`. Left alone here.
  Evidence: a one-off test against `NativeWavelengthClient` printed `stop,start,getInfo`.

- Observation: The first full run of descriptor restore and export against the real wasm daemon
  worked with no daemon changes: the same identity after a reload, and `tr(` and `wpkh(` lines with
  no `prv`. The unlock screen needed a change, because it treated any kind but `password` as allowing
  a passkey and rewrote the kind to `password` on unlock.
  Evidence: `wavewalletdk-smoke.spec.js`, "a wallet restored from descriptors...".

- Observation: The daemon connects to the signer, creates a watch-only wallet's database, and only then
  checks the signer's keys. A first open that fails on those keys, or on anything later, therefore leaves
  a locked wallet, and retrying `createWallet` can only fail with "wallet already exists (state=locked)".
  The engine stayed in `needsWallet`, so hosts would offer that retry forever. Found on the emulator; fixed
  by `#followLockedWallet` in the engine. A signer that cannot be reached fails before the database exists:
  the state stays `none`, the engine rightly stays in `needsWallet`, and creating again works.
  Evidence: `waved/rpc_wallet.go` in `wavelength`, "the wallet database was created; retry via
  UnlockWallet", and the unreachable case from `wavelength-mobile`'s emulator runs.

- Observation: `start()` does not contact the signer. Only creating or unlocking does, and with the signer
  down that takes the whole 30 second connect timeout before failing.
  Evidence: the emulator runs in Artifacts and Notes.

- Observation: `getDefaultDataDir` on Android is under `filesDir`, and Expo's default manifest has
  `android:allowBackup="true"`, so Android Auto Backup could copy the wallet database and the signer
  macaroon off the device. The demo now turns backup off, and the guide warns hosts. This affects every
  wallet kind's database on any host that keeps the default, so `wavelength-react-native`'s docs may want
  a broader note.
  Evidence: `WavelengthModule.kt` line 44; the generated `AndroidManifest.xml`.

- Observation: Backgrounding is not handled, for any wallet kind. `docs/wavewalletdk_mobile.md` in
  `wavelength` says a host should call `Stop` and `Start` after a real background and resume, and neither
  the demo nor `packages/react-native` does. Left alone as a separate gap, so acceptance item 4 was run by
  stopping and reopening the wallet in the app rather than by backgrounding it.
  Evidence: `grep -rn AppState apps/rn-wallet-demo/src packages/react-native/src` finds nothing.

- Observation: Settings showed the server as Offline during the signet emulator runs, and a credit balance
  call logged `DeadlineExceeded`. The cause was not investigated. Wallet opening did not depend on it, but
  it means no payment or Ark round was attempted.
  Evidence: the demo's Settings screen; `GoLog` in logcat.

- Observation: Three things cost time on the machine rather than in the code. Gradle's `jlink` step failed
  under the profile's GraalVM `JAVA_HOME`, so builds used `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64`.
  `CI=1` stops Metro watching files. This demo has no `expo-dev-client`, so launch it directly with
  `adb shell am start -n engineering.lightning.wavelength.demo/.MainActivity` after `adb reverse tcp:8081
  tcp:8081`.


## Decision Log

- Decision: Add watch-only inputs to `CreateWalletRequest`, so `WalletEngine` needs no new lifecycle.
  Rationale: `engine.start(config)` followed by `engine.createWallet(...)` and later
  `engine.unlockWallet(...)` is the path the engine and hooks already model. The Go facade's
  `CreateWallet` already accepts these fields, and the generated types already include them.
  `startWatchOnlyWallet` stays for hosts that use the client directly.
  Date/Author: 2026-11-04, plan author.

- Decision: The web transport refuses watch-only creation too.
  Rationale: A browser runtime cannot dial a signer, so accepting a bundle would create a wallet
  that can never sign. The check belongs in core, beside the existing refusal.
  Date/Author: 2026-11-04, plan author.

- Decision: Keep watch-only out of the web demo.
  Rationale: It cannot work there. The web demo shows only descriptors.
  Date/Author: 2026-11-04, plan author.

- Decision: Keep the React Native host-owned start verbs out of `enqueueLifecycle`.
  Rationale: `startEmbedded` and `Stop` in `sdk/wavewalletdk/mobile/mobile.go` give a clear answer:
  a second start gets "already started", and a stop during a start cancels it and its start rejects
  with "start cancelled by Stop". Queuing would make such a stop wait out a slow open instead of
  cancelling it. Calls reach native in invocation order. `client.test.ts` pins this with a fake
  modeling the facade.
  Date/Author: 2026-11-04.

- Decision: Redact `bundle`, `watchOnlyBundle` and `authKeys` from web debug logs although the typed
  methods refuse them there.
  Rationale: `callFacade` can still carry them, and they can hold private keys.
  Date/Author: 2026-11-04.

- Decision: Name the hook's verb `listDescriptors`, not `list`, and give it no data field.
  Rationale: `useWalletList` already returns `list`, and the reference promises hooks never collide
  when destructured together. A result can hold private keys, so it stays out of React state.
  Date/Author: 2026-11-04.

- Decision: Fix the failed first open in the engine, not only in the demo.
  Rationale: Every engine host would otherwise hit the same dead end. A failed create that leaves no
  wallet behind keeps its existing behavior.
  Date/Author: 2026-11-04.

- Decision: Paste the macaroon as hex and the certificate and exports as text, with no document picker.
  Rationale: It needs no new native dependency in a demo. A multi-line input cannot mask text, so
  `SecretArea` keeps the value off screen until asked for.
  Date/Author: 2026-11-04.

- Decision: Do not offer `recoverState` or `overrideIdentity` in the demo's watch-only form.
  Rationale: Both are in the SDK and reference. The demo stays small, and neither has been run on a device.
  Date/Author: 2026-11-04.

- Decision: No changes for signer spending policy or in-process manifests.
  Rationale: Neither exists in the daemon yet.
  Date/Author: 2026-11-04, plan author.


## Outcomes & Retrospective

Milestones 1 to 6 are done on the branch, with Milestone 5 on Android only. Hosts on the engine and hooks can
now restore from descriptors, export them, and on native open a watch-only wallet. The first real run found one
real bug, the failed first open above, and otherwise worked. Not done: anything on iOS, a real payment or Ark round
with a remote signer, and pairing with a release. This branch still cannot merge until Milestone 7.


## Context and Orientation

This is a pnpm monorepo for embedding the wavelength wallet in an app. `waved`, the wallet daemon
written in Go, lives in the sibling `wavelength` repository. In a browser it runs as WebAssembly, and
in React Native as a gomobile native module, both inside the app's process. The Go package both go
through is `sdk/wavewalletdk/mobile`, called "the facade" here. Its private JSON envelopes use
snake_case, and its ordinary requests use PascalCase with base64 for bytes.

`packages/core` is the shared client: `src/base-client.ts` is `BaseWavelengthClient`; `src/client.ts`
holds the public contracts, where optional abilities are separate interfaces such as
`DescriptorWalletClient` and `WatchOnlyWalletClient`; `src/requests.ts` holds request types and
validation; `src/facade.ts` maps them onto the wire; `src/generated.ts` is generated from the Go
types by `pnpm gen:types`; `src/config.ts` is `RuntimeConfig` and its validation;
`src/engine/engine.ts` is `WalletEngine`, the framework-free observable wallet;
`src/public-api-assertions.ts` pins the exported API. `packages/react/src/hooks.ts` wraps the
engine in hooks. `packages/web` is the browser transport, and `serverTransport` there is `rest`.
`packages/react-native` is the native transport, with `grpc`, and its dispatch tables are
`android/.../WavelengthModule.kt` and `ios/WavelengthModule.mm`. `apps/web-wallet-demo` and
`apps/rn-wallet-demo` are the demos. `apps/docs` is the published documentation site, and `skills/`
holds agent skills that ship with the SDK.

`RUNTIME_MANIFEST_VERSION` in `packages/core/src/version.ts` pins the daemon release the SDK pairs
with. `.claude/skills/syncing-daemon-release/SKILL.md` is the runbook for moving it. Read it before
Milestone 7.

These terms are used throughout.

An output descriptor is a line of text that describes keys and how to spend from them, such as
`tr(tprv.../86h/0h/0h/<0;1>/*)#checksum`. A private one is as sensitive as a seed. The daemon accepts
either descriptors sharing one master key, or account-level private keys covering the on-chain account
and every key family, recognized by an origin like `[fingerprint/86h/0h/0h]`.

A remote signer is a separate process holding the private keys, which the wallet asks to sign over
gRPC. `wavesigner` is ours, and lnd works too. A watch-only wallet holds only public keys and signs
everything through the signer.

A bundle is the text the signer exports for a watch-only wallet. A minimal bundle also holds private
"authentication" keys, used for routine Ark server authentication so that the signer is not asked each
time. A manifest is a JSON file used instead of a bundle when the wallet's fund slots come from several
keys; it needs a matching authentication keys file. The manifest hash identifies which manifest created
a wallet. The wallet password protects the local database and any authentication keys.

On every open, the daemon has the signer sign a challenge with each key slot, so opening a watch-only
wallet fails if the signer is unreachable or holds different keys.

### Prerequisites in `wavelength`

Milestones 1 to 6 run against a local checkout of its `descriptors` branch through `WAVELENGTH_DIR`.
Milestone 7 needs a published release containing that branch, written `vX.Y.Z` here. If the `wavelength-kmp`
plan's change moving two result types into `sdk/wavewalletdk/types.go` lands first, `pnpm gen:types` will
reorder `generated.ts` with no functional change.


## Plan of Work

### Milestone 1: correct the account-level descriptor docs

Fix `apps/docs/src/content/docs/guides/restore-a-wallet.mdx`, which says account-level descriptors are
refused. Say instead that the daemon takes either form above, that a partial account-level set is refused
because the wallet needs every key family, and that `xpub` descriptors are refused here because a wallet
built this way holds its own keys. Fix the matching sentence under `DescriptorWalletClient` in
`reference/wavelength-core.mdx`, and the doc comments on `DescriptorWalletRequest` and `CreateWalletRequest.descriptors`
in `packages/core/src/requests.ts`. Verify the claim first with a one-off request against the real parser, as in
Concrete Steps, using a full set and a lone account descriptor, and keep the exact daemon errors for the docs.
Add the missing symbols to `apps/docs/src/config/api-links.ts`. Make the same correction in
`wdk-wallet-wavelength/README.md` in `wavelength-wdk`, which repeats the claim, as its own commit in that repository.

The result: docs that match the daemon, and `pnpm --filter ./apps/docs test:unit` passing.

### Milestone 2: watch-only createWallet and the native lifecycle

Add `watchOnlyBundle`, `watchOnlyManifest`, `authKeys` and `overrideIdentity` to `CreateWalletRequest` in
`requests.ts`, with a validator that refuses them with a mnemonic or descriptors and applies the same rules as
`validateWatchOnlyWalletRequest`, and extract the shared rules so the two cannot drift. Base64-encode the three
text values in `toGoCreateWalletReq` in `facade.ts`, using `base64FromUtf8`. In `BaseWavelengthClient.createWallet`,
refuse them when `serverTransport` is `rest`, with `invalid_config`. Add `manifestHash` to the create result type
through `results.ts` if the generated type does not already carry it to hosts.

Then answer the question from `Surprises & Discoveries`: what does a React Native host see when it calls `stop()`
while `startDescriptorWallet` is running, or two starts at once? Write a test in `packages/react-native/src` with a
slow fake native module. The Go facade refuses a second start with "already started", so the likely answer is a
clear error and no corruption. If so, keep the code, leave the test as the record, and say so in the Decision Log.
If anything interleaves badly, route the three verbs through `enqueueLifecycle` as `packages/web/src/clients/worker.ts`
does.

The result: new `base-client.test.ts` cases for the JSON and each rule, a web refusal test, and a lifecycle test.

### Milestone 3: engine and hooks

`WalletEngine.client` has the type `WavelengthClient`, which deliberately lacks the optional abilities. Add
`listWalletDescriptors(req)` to `WalletEngine`, checking that the client implements it, and rejecting with a
`WavelengthError` coded `unsupported_facade_method` otherwise. Extend `restoreWallet`'s check in `engine.ts`, and the
`RestoreWalletRequest` union in `requests.ts`, so a request has exactly one of a mnemonic, descriptors, or a watch-only
input. `snapshot.info.manifestHash` then flows by itself, because `Info` is generated; confirm this with an engine test.
Add `watchOnly` to `WalletKind` in `packages/core/src/passkey.ts`.

In `packages/react/src/hooks.ts`, add `useWalletDescriptors()`, following `useWalletMutationState`, returning `list`,
pending and error state. Never keep a private result in hook state after the promise resolves; return it to the caller
only. `useWalletRestore` already takes the wider union. Export it, and add it to `public-api-assertions.ts`.

The result: tests in `engine.test.ts` and the React package for each new path, including the capability check.

### Milestone 4: web demo

In `apps/web-wallet-demo/src/screens/onboarding/RestoreWalletScreen.tsx`, add a toggle between a recovery phrase and
descriptors, with a multi-line masked input and an optional birthday, passing `descriptors` to `onRestore`. In the wallet's
settings, add an "Export descriptors" panel showing public descriptors with a copy button. Private export is deliberately
absent from the demo, because showing private keys on screen is a poor pattern to demonstrate. Store the wallet as kind
`descriptor` in the wallet registry, and check that the list screen and legacy migration in `walletRegistry.ts` handle it.

Add a Playwright case to the demo's hermetic smoke suite: restore with a fixed test descriptor, see the wallet become
ready, and see the export contain `tr(` and no `prv`. The smoke server mocks every backend, so this needs no network, but
it does need a local wasm build containing the new daemon.

The result: `pnpm --filter web-wallet-demo run test` passes locally. CI does not run it, so record the run here.

### Milestone 5: React Native demo

Add the same restore toggle and export panel to `apps/rn-wallet-demo`. Add a "Watch-only wallet" flow in
`src/screens/onboarding/` taking the signer host, the bundle or manifest with authentication keys, and the macaroon and
certificate. The daemon opens those two as file paths, and Expo's file APIs return `file://` URIs, so write them under the
app's private directory and pass plain paths with the scheme stripped; `src/lib/wipeLocalData.ts` shows the same
conversion the other way. The bundle and authentication keys are needed only for the first open, because the wallet database
then holds the imported keys, so do not store them. The demo has no secure storage and asks for the password each time, so keep
that, and never log any of these.

Use `engine.start(config)` and `engine.createWallet(...)` for the first open, and `engine.unlockWallet(...)` afterward.
When an open fails because the signer is down, show the error with a retry, not a wrong password message. The signer is needed on
every unlock, including after the daemon restarts. Neither the demo nor `packages/react-native` handles app backgrounding today, so read
what `docs/wavewalletdk_mobile.md` in `wavelength` requires, and record in `Surprises & Discoveries` whether this demo needs to change.

This repository has no automated test for the native demo, and its `CLAUDE.md` describes device-driven verification, so
run the acceptance list by hand and record the results. This milestone is also the first compile of the dispatch tables
in `WavelengthModule.kt` and `WavelengthModule.mm`, which so far only have their text checked by `native-dispatch.test.ts`.
It is also the first run of the Go facade's watch-only path against a real daemon, so treat failures as likely real.

### Milestone 6: docs and agent skills

Rewrite the concepts that are now false. `docs/key-management.md` and
`apps/docs/src/content/docs/concepts/keys-backup-and-recovery.mdx` open with "one seed, two ways to derive it". Add descriptor
and watch-only wallets to that section, to "What is stored where", to "Backup" (a manifest is part of a watch-only wallet's
backup, and a signer restored from its primary seed alone holds different keys, which `wavesigner create --manifest` catches),
and to "Recovery paths". Update `concepts/wallet-lifecycle-and-auth.mdx` with what unlocks each kind and how a signer outage
appears.

Add a guide, `guides/use-a-remote-signer.mdx`, covering signer setup, export, and opening from React Native, and add it to
`apps/docs/src/config/nav.ts`. Say clearly that it is native-only.

Bring the command line docs up to date. `cli/create.mdx` lacks `--descriptor-file`, `--birthday` and the watch-only and manifest
flags, so copy names and meanings from `wavecli create --help` in the paired daemon. Add pages for `wavecli descriptors` and
`wavecli export-watchonly`, and one for `wavesigner`, with nav entries. Add `bakemacaroon remotesigner:generate` to
`cli/bakemacaroon.mdx`, for a signer that dials in to a daemon.

Update `skills/wavelength-api`, `skills/wavelength-cli`, `skills/wavelength-react-native` and `skills/wavelength-web`, since coding
agents reading them would otherwise give stale advice. Each should route to the new client methods, repeat the critical rule that
private descriptors, minimal bundles and authentication keys must not be logged or sent anywhere, and the web skill should state that
watch-only wallets are unavailable.

The result: `pnpm --filter ./apps/docs build` and `test:unit` pass, and every new page is reachable from the nav.

### Milestone 7: pair with a release

Once `vX.Y.Z` is published, follow the `syncing-daemon-release` skill in full: move the pin, regenerate `generated.ts` and
`wallet.json` against that exact tag, update digests with `pnpm gen:runtime-digests`, fetch the released binaries, and run its
verification ladder. Then repeat Milestones 4 and 5's acceptance on released artifacts. Merge and release through `RELEASE.md`, with
release notes saying what a host gains and that watch-only is native-only. `wavelength-wdk` pins this package and cannot release its
descriptor and watch-only entry points until this ships. Tell its owner when it does.


## Concrete Steps

Run these from the repository root. `pnpm gen:api-docs` needs Node 24 or newer; the rest ran on Node 22 when this plan was written.

    pnpm install
    pnpm build
    pnpm typecheck
    pnpm --filter @lightninglabs/wavelength-core test
    pnpm --filter @lightninglabs/wavelength-react-native test
    pnpm --filter @lightninglabs/wavelength-web test
    pnpm --filter ./apps/docs test:unit

Expect each test command to end with `fail 0`. After Milestone 5, core has 230 tests, React 36, React Native 42 and web 178.

For the web demo, and only once per machine for the browser:

    npx playwright install chromium
    export WAVELENGTH_DIR="$(cd ../wavelength && pwd)"
    pnpm --filter web-wallet-demo run wasm:local
    pnpm --filter web-wallet-demo run build:local
    pnpm --filter web-wallet-demo run test

For the React Native demo:

    export WAVELENGTH_DIR="$(cd ../wavelength && pwd)"
    pnpm --filter @lightninglabs/wavelength-react-native run bindings:local
    cd apps/rn-wallet-demo && npx expo run:android

To stand up a signer on the host. An emulator reaches the host at `10.0.2.2`, which must be in the signer's certificate:

    export WAVESIGNER_PASSWORD=test-password-only
    wavesigner --network=signet create --mnemonic-file wallet.mnemonic
    wavesigner --network=signet export-watchonly --output signer.bundle
    wavesigner --network=signet run --listen=0.0.0.0:10019 --tlsextraip=10.0.2.2

`wallet.mnemonic` holds a throwaway 24-word mnemonic for this test only; `create` also takes `--descriptor-file`. `signer.macaroon`
and `tls.cert` are written to `~/.wavesigner/signet/` when `run` first starts.

A manifest needs a signer store with overrides, so use a separate data directory. The key files hold private keys for those fund
slots; `docs/daemon_cli_guide.md` in `wavelength`, under "Fund slots from other keys (manifests)", describes their format:

    wavesigner --network=signet --datadir=/tmp/signer2 create \
      --mnemonic-file wallet.mnemonic --override onchain=cold-a.key
    wavesigner --network=signet --datadir=/tmp/signer2 export-watchonly \
      --manifest-out wallet.manifest --auth-keys-out auth.keys

To check a request against the real Go parser for Milestone 1, add a throwaway `_test.go` in `sdk/wavewalletdk/mobile` in
the `wavelength` checkout that feeds JSON to `parseDescriptorWalletStartRequest`, and run it with
`go test -tags 'mobile wavewalletrpc swapruntime' -run <name> .`. Delete it afterward. `parseDescriptorWalletRequest` in
`sdk/wavewalletdk/descriptor.go` gives the accept and refuse results.

Commit after each milestone on the existing `descriptors` branch, using this repository's bare prefixes (`core:`, `react:`, `demo:`,
`docs:`). Its `CLAUDE.md` asks for a clean series, so fold a change to work already on the branch into the commit that introduced it,
including Milestone 1's corrections, rather than stacking fixups. Each commit must build. Leave the untracked `package-lock.json` at the repository root
out of commits; it dates from before this work, and this repository uses pnpm.


## Validation and Acceptance

All test commands pass with new cases that fail without each change, and `pnpm typecheck` passes after `pnpm build`.

In the web demo: restore from a fixed descriptor, see the wallet become ready, export and find `tr(` and `wpkh(` lines with no `prv`,
reload the page and unlock with the password. Calling `client.startWatchOnlyWallet` or passing a `remoteSigner*` field rejects with
`invalid_config` naming the web transport, and nothing starts.

In the React Native demo, on an Android emulator and the iOS simulator:

1. Restore from a descriptor, relaunch and unlock, and see the same identity.
2. Open a watch-only wallet against the signer. The identity matches `wavesigner`'s.
3. Repeat with the second signer's manifest and authentication keys, on a fresh wallet with that signer running, and see
   `manifestHash` set on `snapshot.info`.
4. Stop the signer, background and return. The open fails with a signer message and a retry. Restart the signer, and it opens.
5. Use another signer's files. The open fails.
6. Search the device log for `prv` during all of this and find nothing.

An actual payment or Ark round on signet proves the most, but depends on public servers, so it is recommended, not required.


## Idempotence and Recovery

Generators overwrite their outputs and can be rerun; review the diff before committing. Do not commit digests or a pin from a local
daemon build, because those belong to Milestone 7. `wasm:local` and `bindings:local` outputs are gitignored. The syncing skill warns
not to move a shared daemon checkout, so use a throwaway `git worktree` for pinned generation. Demo wallets live in OPFS or app storage,
so clearing site or app data restarts cleanly.


## Artifacts and Notes

The facade's create request for a watch-only wallet:

    {
      "WalletPassword": "aHVudGVyMg==",
      "WatchOnlyBundle": "<base64 of the bundle text>",
      "Birthday": "2026-01-01T00:00:00.000Z"
    }

`parseDescriptorWalletRequest` on 2026-11-04, for each form of input:

    full account set         accepted, as account keys
    master keys              accepted, as a master key
    lone account descriptor  invalid account keys: watch-only bundle is incomplete: key families
                             0 to 255 are required, got 0
    lone coin-level key      invalid account keys: watch-only bundle is incomplete: no BIP86
                             account 86'/0'/0'
    xpub, no origin          invalid descriptors: descriptor 1: watch-only descriptors are not
                             supported: Wavelength must sign Ark rounds, so the descriptor needs
                             a private key
    xpub, with origin        invalid account keys: entry 1: account key entries must be private
                             keys; public keys belong in a watch-only bundle used with a remote
                             signer
    account xprv, no origin  invalid descriptors: descriptor 1: descriptor key must be the BIP32
                             master key: Ark keys are derived under m/1017' and cannot come from
                             an account-level key: key is at depth 3

Android emulator, `Medium_Phone` image on API 36.1 in read-only mode, on signet, 2026-11-04:

    1. Restore from descriptors, relaunch, unlock   pass: identity 0309b8ec...9e649909 both times,
                                                    the same as the web run with the same keys
       Export                                       pass: tr( and wpkh( lines, no prv
    2. Watch-only from a full bundle (258 lines)    pass: same identity as the signer's keys
    3. Manifest and authentication keys             pass: manifest hash f5907a...534322 equals the
                                                    SHA-256 of the manifest file; identity 0370f437...
    4. Signer stopped, wallet reopened              start ok; unlock fails after 35 s:
                                                    "connect to remote signer: ... context deadline
                                                    exceeded". Signer restarted, Unlock opens in 8 s
    5. Another signer's credentials                 refused: "signer does not hold the key for a
                                                    wallet slot: [onchain (not signed) 6 (wrong key)
                                                    42 (wrong key) ...]"
    6. Search logcat for tprv and xprv              0 matches at each check
       Remove a wallet                              its data directory and signer files are gone

Observed on 2026-11-04, an SDK request through `toWatchOnlyWalletStartParams` parsed in Go as:

    host=signer:10009 mac=/m tls=/t connect=30s request=40s dir=/wallets/w
    manifest="{\"m\":1}" auth="keys" override=true password="hunter2" birthday=1767225600


## Interfaces and Dependencies

No new runtime dependencies. At the end:

    // packages/core/src/requests.ts
    export type CreateWalletRequest = {
      // ...existing fields...
      watchOnlyBundle?: string;
      watchOnlyManifest?: string;
      authKeys?: string;
      overrideIdentity?: boolean;
    };

    // packages/core/src/engine/engine.ts, on WalletEngine
    listWalletDescriptors(
      req?: ListWalletDescriptorsRequest,
    ): Promise<ListWalletDescriptorsResult>;

    // packages/react/src/hooks.ts
    export function useWalletDescriptors(): UseWalletDescriptorsResult;
    // ...which returns listDescriptors, listDescriptorsPending, listDescriptorsError and
    // resetListDescriptors, deliberately with no data field.


Revision note (2026-11-04): first version, written from the `descriptors` branch here and in `wavelength`.

Revision note (2026-11-04): updated while executing Milestones 1 to 6, with what the emulator runs found.
