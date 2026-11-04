---
name: wavelength-react-native
description: Embed a self-custodial Lightning wallet in a React Native or Expo app with the Wavelength SDK (@lightninglabs/wavelength-react-native, @lightninglabs/wavelength-react). Use when integrating Wavelength into a React Native or Expo app, creating a native wallet engine, sending or receiving Lightning payments on device, wiring WavelengthProvider with a native engine, or adding native passkey protection. Triggers include "wavelength react native", "createNativeWalletEngine", "embed a Lightning wallet in React Native", "createNativePasskeyCeremony", and "Expo wallet".
---

# Wavelength React Native integration

Wavelength embeds a self-custodial Lightning wallet in a React Native or Expo
app. The wallet daemon is compiled directly into the app binary; there is no
node to run, no backend to operate, and nothing listening on a socket.

Docs index: https://wavelength.lightning.engineering/llms.txt. Every docs page
has a markdown twin at the same URL with `.md` appended; fetch those.

## Packages

Check the npm registry for current versions; do not rely on memorized ones.

- `@lightninglabs/wavelength-react-native`: the native transport. A Turbo
  Module wrapping the wallet runtime compiled into the app binary.
  `createNativeClient()` builds a raw client; `createNativeWalletEngine()`
  wraps it in a `WalletEngine` and is the factory to use with the React
  provider. Re-exports everything from core.
- `@lightninglabs/wavelength-react`: `<WavelengthProvider>` plus hooks. Takes an
  injected engine; it does not depend on the react-native package.

## Task routing

| Building | Read first |
| --- | --- |
| Any new integration | https://wavelength.lightning.engineering/react-native/get-started/quickstart.md |
| Package install and native runtime staging | https://wavelength.lightning.engineering/react-native/get-started/installation.md |
| Platform, OS, and passkey requirements | https://wavelength.lightning.engineering/react-native/get-started/requirements.md |
| Passkey rpId domain association | https://wavelength.lightning.engineering/react-native/get-started/passkey-setup.md |
| Wallet creation and unlock | https://wavelength.lightning.engineering/guides/create-a-wallet.md |
| Passkey protection | https://wavelength.lightning.engineering/guides/use-a-passkey.md |
| Restoring from a phrase or descriptors | https://wavelength.lightning.engineering/guides/restore-a-wallet.md |
| Keys on a remote signer (watch-only) | https://wavelength.lightning.engineering/guides/use-a-remote-signer.md |
| App background and resume | https://wavelength.lightning.engineering/react-native/background-and-resume.md |
| Build or runtime failures | https://wavelength.lightning.engineering/react-native/troubleshooting.md |
| Exact API surface | https://wavelength.lightning.engineering/reference/wavelength-react-native.md |

## Critical rules

- Create the engine with `createNativeWalletEngine()` from
  wavelength-react-native and pass it to `<WavelengthProvider engine={...}>`.
  Build the engine once, outside the component tree (module scope), and
  inject the same instance on every render.
- Call `restartAfterBackground(engine)` once beside the engine. The daemon cannot
  see the app lifecycle, and left running through a suspension it keeps gRPC
  connections frozen on their old network path. An open wallet returns on
  `'locked'`, so the app must render its unlock flow for that phase.
- Requires React Native 0.76 or newer, iOS 15.1+, and Android minSdk 24.
  The New Architecture must be enabled. This package is New Architecture
  only; it does not support the legacy architecture.
- Expo apps need a **development build**, not Expo Go: the native wallet
  runtime is a compiled module that Expo Go cannot load. `npx expo run:android`
  and `npx expo run:ios` both produce development builds that include it.
- The native wallet runtime binaries (`Wavewalletdk.aar`,
  `Wavewalletdk.xcframework`) are not bundled in the npm package. Stage them
  before the first build from the paired wavelength release: the `.aar` is
  copied into `android/libs/`, while the iOS archive is unpacked to one side,
  has its headers rewritten (clang rejects gomobile's `@import` before it will
  compile the package's Objective-C++ glue), and only then replaces any
  `ios/Wavewalletdk.xcframework` already there. Follow the installation page
  above rather than improvising it. From a checkout of the SDK repository, the
  `bindings:fetch` script does all of it for you.
- Passkey ceremonies are injected. Pass `createNativePasskeyCeremony({ rpId })`
  from wavelength-react-native into `useWalletPasskey(ceremony)`; do not
  implement platform authentication calls by hand. The `rpId` domain needs
  an `assetlinks.json` (Android) and an `apple-app-site-association` plus
  Associated Domains entitlement (iOS); see the passkey setup page above.
  iOS passkey support is experimental.
- Private descriptors, minimal bundles and authentication keys are as
  sensitive as a seed. Never log them, send them anywhere but the wallet, or
  keep them in app state after the first open. `useWalletDescriptors()` returns
  its result to the caller and deliberately keeps none in React state.
- A watch-only wallet needs the `remoteSigner*` settings in the config given to
  `start()`, with the macaroon and certificate as plain file paths, not
  `file://` URIs, and its signer on every open. A signer that is down is a failed
  open with a retry, not a wrong password.
- Activity arrives as typed `activity` events, re-emitted from native
  `wavelengthActivity` device events; do not poll for state changes by hand.

## Verify the integration

After wiring, confirm: the app builds and launches on a device or
simulator via a development build (not Expo Go), the engine's `phase`
(from `useWallet()`) reaches `ready`, and an invoice can be created.
