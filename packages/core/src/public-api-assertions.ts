import {
  EntryFailureCodeFailed,
  EntryKindSend,
  EntryPhaseSettling,
  EntryRequestTypeLightning,
  EntryStatusPending,
  ExitInfeasibilityReasonUneconomical,
  ExitJobStatusPending,
  ExitPathUnilateral,
  FACADE_METHODS,
  FORCE_UNROLL_ACK,
  isExitInfeasibilityFundable,
  ListViewActivity,
  SendQuoteStatusComplete,
  SendRailLightning,
} from './index.ts';
import type {
  ActivityStreamOptions,
  CreditPreview,
  DebugLevel,
  EntryFailureCode,
  EntryProgress,
  EntryRequest,
  EntryRequestType,
  ExitBatchEvent,
  ExitBatchOptions,
  ExitBatchResult,
  ExitBatchStop,
  ExitInfeasibilityReason,
  DescriptorWalletClient,
  DescriptorWalletOpenResult,
  DescriptorWalletRequest,
  ExternalSeedWalletOpenResult,
  ExternalSeedWalletClient,
  ExternalSeedWalletRequest,
  ListWalletDescriptorsRequest,
  ListWalletDescriptorsResult,
  FacadeMethod,
  OnchainHistory,
  OnchainTx,
  RuntimeConfig,
  WavelengthClient,
  SendQuoteStatus,
  VTXOInventory,
  WalletVTXO,
} from './index.ts';

const method: FacadeMethod = FACADE_METHODS[0];
const activityOptions: ActivityStreamOptions = { kinds: [EntryKindSend], cursor: 0 };
const acknowledgement: typeof FORCE_UNROLL_ACK = 'I_KNOW_WHAT_I_AM_DOING';
const subsystemDebugConfig: RuntimeConfig = { debugLevel: 'ROND=debug,info' };
const pickerDebugLevel: DebugLevel = 'info';
// @ts-expect-error subsystem expressions are runtime config, not picker levels.
const subsystemPickerLevel: DebugLevel = 'ROND=debug,info';

void method;
void activityOptions;
void acknowledgement;
void subsystemDebugConfig;
void pickerDebugLevel;
void subsystemPickerLevel;
void [
  EntryFailureCodeFailed,
  EntryPhaseSettling,
  EntryRequestTypeLightning,
  EntryStatusPending,
  ExitInfeasibilityReasonUneconomical,
  ExitJobStatusPending,
  ExitPathUnilateral,
  ListViewActivity,
  SendQuoteStatusComplete,
  SendRailLightning,
];
void (null as unknown as CreditPreview);
void (null as unknown as ExternalSeedWalletOpenResult);
void (null as unknown as ExternalSeedWalletClient);
void (null as unknown as ExternalSeedWalletRequest);
void (null as unknown as DescriptorWalletClient);
void (null as unknown as DescriptorWalletOpenResult);
void (null as unknown as DescriptorWalletRequest);
void (null as unknown as ListWalletDescriptorsRequest);
void (null as unknown as ListWalletDescriptorsResult);
void (null as unknown as EntryFailureCode);
void (null as unknown as EntryProgress);
void (null as unknown as EntryRequest);
void (null as unknown as EntryRequestType);
void (null as unknown as OnchainHistory);
void (null as unknown as OnchainTx);
void (null as unknown as SendQuoteStatus);
void (null as unknown as VTXOInventory);
void (null as unknown as WalletVTXO);
void (null as unknown as WavelengthClient);
const _fundable: (reason: ExitInfeasibilityReason) => boolean = isExitInfeasibilityFundable;
void _fundable;
void (null as unknown as ExitBatchEvent);
void (null as unknown as ExitBatchOptions);
void (null as unknown as ExitBatchResult);
void (null as unknown as ExitBatchStop);

// External-seed lifecycle remains additive: legacy structural implementations
// of WavelengthClient are not required to add the capability method.
const _legacyClientHasNoExternalSeedStart:
  'startExternalSeedWallet' extends keyof WavelengthClient ? false : true = true;
const _externalSeedClientIsLegacy: WavelengthClient =
  null as unknown as ExternalSeedWalletClient;
void _legacyClientHasNoExternalSeedStart;
void _externalSeedClientIsLegacy;

// Descriptor startup and export are additive too: the stable client contract
// must not grow them, so custom clients keep compiling.
const _legacyClientHasNoDescriptorStart:
  'startDescriptorWallet' extends keyof WavelengthClient ? false : true = true;
const _legacyClientHasNoDescriptorExport:
  'listWalletDescriptors' extends keyof WavelengthClient ? false : true = true;
const _descriptorClientIsLegacy: WavelengthClient =
  null as unknown as DescriptorWalletClient;
void _legacyClientHasNoDescriptorStart;
void _legacyClientHasNoDescriptorExport;
void _descriptorClientIsLegacy;
