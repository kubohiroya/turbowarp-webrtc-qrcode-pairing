import definitions from './block-definitions.json';
import {extensionConfig} from './config';
import {featureFlags} from './config/feature-flags.js';
import {PairingController, type PairingControllerOptions} from './pairing/controller.js';

type BlockTypeName = 'COMMAND' | 'REPORTER' | 'BOOLEAN';
type ArgumentTypeName = 'STRING' | 'NUMBER';

interface DefinitionArgument {
  type: ArgumentTypeName;
  defaultValue: string | number;
}

interface BlockDefinition {
  opcode: string;
  blockType: BlockTypeName;
  text: string;
  description: string;
  arguments: Record<string, DefinitionArgument>;
}

const blockDefinitions = definitions.blocks as readonly BlockDefinition[];

export interface WebRtcQrCodePairingExtensionOptions extends PairingControllerOptions {
  readonly enabled?: boolean;
}

/**
 * Block facade.
 *
 * Every method casts its arguments and delegates. Pairing logic lives in
 * PairingController, which has no Scratch dependency and can be tested without
 * a runtime.
 */
export class WebRtcQrCodePairingExtension implements TurboWarpExtension {
  private readonly enabled: boolean;
  private readonly runtime: TurboWarpRuntime;
  private readonly pairing: PairingController;

  private readonly runStopListener = (): void => this.pairing.stopTransient();
  private readonly disposeListener = (): void => this.dispose();
  private readonly targetRemovedListener = (target: unknown): void => {
    if (isTarget(target)) this.pairing.handleTargetRemoved(target);
  };

  public constructor(options: WebRtcQrCodePairingExtensionOptions = {}) {
    this.enabled = options.enabled ?? featureFlags.qrCodePairing;
    this.runtime = options.runtime ?? Scratch.vm?.runtime ?? {};
    this.pairing = new PairingController({...options, runtime: this.runtime});
    this.runtime.on?.('PROJECT_RUN_STOP', this.runStopListener);
    this.runtime.on?.('PROJECT_STOP_ALL', this.runStopListener);
    this.runtime.on?.('PROJECT_LOADED', this.disposeListener);
    this.runtime.on?.('RUNTIME_DISPOSED', this.disposeListener);
    this.runtime.on?.('targetWasRemoved', this.targetRemovedListener);
  }

  public getInfo(): Record<string, unknown> {
    return {
      id: extensionConfig.id,
      name: Scratch.translate(definitions.extensionName),
      docsURI: extensionConfig.docsURI,
      blockIconURI: extensionConfig.blockIconURI,
      blocks: this.enabled ? blockDefinitions.map((block) => this.toScratchBlock(block)) : []
    };
  }

  // --- Starting an exchange ------------------------------------------------

  public async startOfferPairing(args: {
    SESSION: unknown;
    LOCAL_PEER: unknown;
    REMOTE_PEER: unknown;
  }): Promise<void> {
    await this.pairing.startOfferPairing({
      sessionKey: Scratch.Cast.toString(args.SESSION),
      localPeerId: Scratch.Cast.toString(args.LOCAL_PEER),
      remotePeerId: Scratch.Cast.toString(args.REMOTE_PEER)
    });
  }

  public startAnswerPairing(args: {SESSION: unknown; LOCAL_PEER: unknown}): void {
    this.pairing.startAnswerPairing({
      sessionKey: Scratch.Cast.toString(args.SESSION),
      expectedLocalPeerId: Scratch.Cast.toString(args.LOCAL_PEER)
    });
  }

  // --- Receiving -----------------------------------------------------------

  public async ingestPairingQrText(args: {TEXT: unknown; SESSION: unknown}): Promise<void> {
    await this.pairing.ingestQrText(
      Scratch.Cast.toString(args.SESSION),
      Scratch.Cast.toString(args.TEXT)
    );
  }

  public async scanPairingQrFromCamera(args: {
    SESSION: unknown;
    CAMERA_ID: unknown;
  }): Promise<void> {
    await this.pairing.scanFromCamera(
      Scratch.Cast.toString(args.SESSION),
      Scratch.Cast.toString(args.CAMERA_ID)
    );
  }

  public pairingReceivedParts(args: {SESSION: unknown}): number {
    return this.progress(args).receivedParts;
  }

  public pairingRequiredParts(args: {SESSION: unknown}): number {
    return this.progress(args).requiredParts;
  }

  public pairingMissingParts(args: {SESSION: unknown}): string {
    return this.progress(args).missingParts.join(',');
  }

  // --- Display -------------------------------------------------------------

  public showPairingQrPart(
    args: {INDEX: unknown; SESSION: unknown},
    util?: TurboWarpBlockUtility
  ): void {
    this.pairing.showPart(
      Scratch.Cast.toString(args.SESSION),
      Scratch.Cast.toNumber(args.INDEX),
      util?.target
    );
  }

  public showNextPairingQrPart(
    args: {SESSION: unknown},
    util?: TurboWarpBlockUtility
  ): void {
    this.pairing.showNextPart(Scratch.Cast.toString(args.SESSION), util?.target);
  }

  public pairingQrPartCount(args: {SESSION: unknown}): number {
    return this.progress(args).outgoingPartCount;
  }

  public pairingQrCurrentPart(args: {SESSION: unknown}): number {
    return this.progress(args).outgoingCurrentPart;
  }

  public pairingQrPartSvg(args: {INDEX: unknown; SESSION: unknown}): string {
    return this.partSvg(args);
  }

  public pairingQrPartDataUri(args: {INDEX: unknown; SESSION: unknown}): string {
    const svg = this.partSvg(args);
    return svg === '' ? '' : `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  public endPairingQrDisplay(args: {SESSION: unknown}): void {
    this.pairing.endDisplay(Scratch.Cast.toString(args.SESSION));
  }

  // --- Progress and diagnostics --------------------------------------------

  public pairingPhase(args: {SESSION: unknown}): string {
    return this.progress(args).phase;
  }

  public pairingConnectionState(args: {SESSION: unknown}): string {
    return this.progress(args).connectionState;
  }

  public isPairingConnected(args: {SESSION: unknown}): boolean {
    return this.pairing.isConnected(Scratch.Cast.toString(args.SESSION));
  }

  public async waitUntilPairingConnected(args: {SESSION: unknown}): Promise<void> {
    await this.pairing.waitUntilConnected(Scratch.Cast.toString(args.SESSION));
  }

  public pairingError(args: {SESSION: unknown}): string {
    return this.progress(args).errorCode;
  }

  public pairingErrorMessage(args: {SESSION: unknown}): string {
    return this.progress(args).errorMessage;
  }

  public pairingLocalPeer(args: {SESSION: unknown}): string {
    return this.progress(args).localPeerId;
  }

  public pairingRemotePeer(args: {SESSION: unknown}): string {
    return this.progress(args).remotePeerId;
  }

  public pairingExchangeId(args: {SESSION: unknown}): string {
    return this.progress(args).exchangeId;
  }

  public pairingRemainingSeconds(args: {SESSION: unknown}): number {
    return this.progress(args).remainingSeconds;
  }

  public pairingSessions(): string {
    return this.pairing.sessionKeys().join(',');
  }

  // --- Control -------------------------------------------------------------

  public cancelPairing(args: {SESSION: unknown}): void {
    this.pairing.cancelPairing(Scratch.Cast.toString(args.SESSION));
  }

  public async retryPairing(args: {SESSION: unknown}): Promise<void> {
    await this.pairing.retryPairing(Scratch.Cast.toString(args.SESSION));
  }

  public setPairingTimeout(args: {SESSION: unknown; SECONDS: unknown}): void {
    this.pairing.setTimeoutSeconds(
      Scratch.Cast.toString(args.SESSION),
      Scratch.Cast.toNumber(args.SECONDS)
    );
  }

  public dispose(): void {
    this.pairing.dispose();
    this.runtime.off?.('PROJECT_RUN_STOP', this.runStopListener);
    this.runtime.off?.('PROJECT_STOP_ALL', this.runStopListener);
    this.runtime.off?.('PROJECT_LOADED', this.disposeListener);
    this.runtime.off?.('RUNTIME_DISPOSED', this.disposeListener);
    this.runtime.off?.('targetWasRemoved', this.targetRemovedListener);
  }

  private progress(args: {SESSION: unknown}): ReturnType<PairingController['progress']> {
    return this.pairing.progress(Scratch.Cast.toString(args.SESSION));
  }

  /** Reporters report; they never stop a script, so an unknown session is an empty string. */
  private partSvg(args: {INDEX: unknown; SESSION: unknown}): string {
    try {
      return this.pairing.partSvg(
        Scratch.Cast.toString(args.SESSION),
        Scratch.Cast.toNumber(args.INDEX)
      );
    } catch {
      return '';
    }
  }

  private toScratchBlock(block: BlockDefinition): Record<string, unknown> {
    return {
      opcode: block.opcode,
      blockType: Scratch.BlockType[block.blockType],
      text: Scratch.translate(block.text),
      arguments: Object.fromEntries(
        Object.entries(block.arguments).map(([name, argument]) => [
          name,
          {
            type: Scratch.ArgumentType[argument.type],
            defaultValue: argument.defaultValue
          }
        ])
      )
    };
  }
}

function isTarget(value: unknown): value is TurboWarpTarget {
  return typeof value === 'object' && value !== null;
}
