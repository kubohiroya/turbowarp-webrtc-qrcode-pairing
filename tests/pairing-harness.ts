import {vi} from 'vitest';
import type {MonotonicClock} from '../src/clock.js';
import type {StructuredAppendSymbol} from '@kubohiroya/qrcode-structured-append';
import type {PairingController} from '../src/pairing/controller.js';
import type {QrRead} from '../src/ports/qr-scan.js';
import type {WebRtcPairingPort} from '../src/ports/webrtc.js';

/**
 * Stand-in for turbowarp-webrtc.
 *
 * It records the local peer key each call used, which is what proves the two
 * ends never need matching identifiers.
 */
export class FakeWebRtc implements WebRtcPairingPort {
  public readonly version = 3;
  public readonly acceptedOffers: {peer: string; code: string}[] = [];
  public readonly acceptedAnswers: {peer: string; code: string}[] = [];
  public readonly closed: string[] = [];
  public createOfferCalls = 0;

  private readonly offers = new Map<string, string>();
  private readonly answers = new Map<string, string>();
  private readonly states = new Map<string, string>();
  private gate: Promise<void> | undefined;
  private openGate: (() => void) | undefined;

  public constructor(
    private readonly label: string,
    private readonly codeLength = 48
  ) {}

  public async createOffer(peer: string): Promise<string> {
    this.createOfferCalls += 1;
    if (this.gate) await this.gate;
    const code = this.makeCode('offer', peer);
    this.offers.set(peer, code);
    this.states.set(peer, 'new');
    return code;
  }

  public getOffer(peer: string): string {
    return this.offers.get(peer) ?? '';
  }

  public async acceptOffer(peer: string, code: string): Promise<string> {
    this.acceptedOffers.push({peer, code});
    if (this.gate) await this.gate;
    const answer = this.makeCode('answer', peer);
    this.answers.set(peer, answer);
    this.states.set(peer, 'new');
    return answer;
  }

  public getAnswer(peer: string): string {
    return this.answers.get(peer) ?? '';
  }

  public async acceptAnswer(peer: string, code: string): Promise<void> {
    this.acceptedAnswers.push({peer, code});
    if (this.gate) await this.gate;
  }

  public connectionState(peer: string): string {
    return this.states.get(peer) ?? 'closed';
  }

  public closePeer(peer: string): void {
    this.closed.push(peer);
    this.states.set(peer, 'closed');
  }

  /** Simulates the browser reporting an established connection. */
  public connect(peer: string): void {
    this.states.set(peer, 'connected');
  }

  public fail(peer: string): void {
    this.states.set(peer, 'failed');
  }

  /** Makes later calls hang until `release` is called, to test stale results. */
  public hold(): void {
    this.gate = new Promise<void>((resolve) => {
      this.openGate = resolve;
    });
  }

  public release(): void {
    this.openGate?.();
    this.openGate = undefined;
    this.gate = undefined;
  }

  private makeCode(kind: string, peer: string): string {
    const head = `${kind}.${this.label}.${peer}.`;
    return head + 'A'.repeat(Math.max(1, this.codeLength - head.length));
  }
}

export interface ClockHarness {
  readonly clock: MonotonicClock;
  /** Advances the monotonic clock and the fake timers together. */
  advance(milliseconds: number): Promise<void>;
}

export function createClock(): ClockHarness {
  let monotonic = 0;
  return {
    clock: {nowMilliseconds: () => monotonic},
    advance: async (milliseconds: number) => {
      monotonic += milliseconds;
      await vi.advanceTimersByTimeAsync(milliseconds);
    }
  };
}

/** A decoded Structured Append code, as turbowarp-jsqr's `readFrame` reports it. */
export function symbolRead(symbol: StructuredAppendSymbol): QrRead {
  let text = '';
  for (const byte of symbol.bytes) text += String.fromCharCode(byte);
  return {
    text,
    bytes: symbol.bytes,
    structuredAppend: {index: symbol.index, count: symbol.count, parity: symbol.parity}
  };
}

/** A decoded QR code that is not part of a Structured Append sequence. */
export function loneRead(text: string): QrRead {
  return {text, bytes: new TextEncoder().encode(text), structuredAppend: null};
}

export function outgoingReads(controller: PairingController, sessionKey: string): QrRead[] {
  return controller.outgoingSymbols(sessionKey).map(symbolRead);
}

export function readAt(reads: readonly QrRead[], index: number): QrRead {
  const read = reads[index];
  if (!read) throw new Error(`No code at ${index}.`);
  return read;
}

/** Carries every code, in the given order, the way a camera would read them. */
export async function carry(
  controller: PairingController,
  sessionKey: string,
  reads: readonly QrRead[]
): Promise<void> {
  for (const read of reads) await controller.ingestQrRead(sessionKey, read);
}
