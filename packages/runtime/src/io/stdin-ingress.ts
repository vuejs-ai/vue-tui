import { createInputParser, type InputEvent } from "./input-parser.ts";
import { normalizeInputEvent, type NormalizedInputFact } from "./normalized-input.ts";

const ESC = "\x1b";
const FLUSH_DELAY = 20;
const KITTY_QUERY_TIMEOUT = 200;

export interface SharedStdinSubscription {
  setActive(active: boolean): void;
  /** Invalidate framing units that began in an earlier application lifetime. */
  invalidate(options?: { readonly retainPending?: boolean }): void;
  dispose(): void;
}

export interface SharedStdinIngress {
  subscribe<Context>(
    capture: () => Context,
    listener: (event: NormalizedInputFact, context: Context) => void,
  ): SharedStdinSubscription;
  startKittyQueryResponseDetection(
    onResult: (supported: boolean) => void,
    owner?: SharedStdinSubscription,
  ): (options?: { readonly discard?: boolean }) => void;
}

interface Subscriber {
  readonly capture: () => unknown;
  readonly listener: (event: NormalizedInputFact, context: unknown) => void;
  requestedActive: boolean;
  disposed: boolean;
  generation: number;
}

interface Recipient {
  readonly subscriber: Subscriber;
  readonly generation: number;
  readonly context: unknown;
}

interface RecipientSnapshot {
  readonly recipients: readonly Recipient[];
}

interface KittyQueryDetection {
  onResult: (supported: boolean) => void;
  readonly owner: Subscriber | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
  pending: boolean;
  notify: boolean;
}

interface QueuedChunk {
  readonly chunk: Uint8Array | string;
  readonly recipients: RecipientSnapshot;
}

interface ContextualByte {
  readonly byte: number;
  readonly recipients: RecipientSnapshot;
}

interface DecodedSegment {
  text: string;
  readonly recipients: RecipientSnapshot;
}

const ingressRegistry = new WeakMap<NodeJS.ReadStream, SharedStdinIngress>();

function isPartialKittyQueryResponse(value: string): boolean {
  return (
    value === ESC || value === `${ESC}[` || value === `${ESC}[?` || /^\x1b\[\?\d+$/.test(value)
  );
}

function expectedUtf8Length(leadingByte: number): number {
  if (leadingByte <= 0x7f) return 1;
  if (leadingByte >= 0xc2 && leadingByte <= 0xdf) return 2;
  if (leadingByte >= 0xe0 && leadingByte <= 0xef) return 3;
  if (leadingByte >= 0xf0 && leadingByte <= 0xf4) return 4;
  return 1;
}

function isContinuationByte(byte: number): boolean {
  return byte >= 0x80 && byte <= 0xbf;
}

function isValidUtf8SecondByte(leadingByte: number, secondByte: number): boolean {
  if (!isContinuationByte(secondByte)) return false;
  if (leadingByte === 0xe0) return secondByte >= 0xa0;
  if (leadingByte === 0xed) return secondByte <= 0x9f;
  if (leadingByte === 0xf0) return secondByte >= 0x90;
  if (leadingByte === 0xf4) return secondByte <= 0x8f;
  return true;
}

function createSharedStdinIngress(stdin: NodeJS.ReadStream): SharedStdinIngress {
  const subscribers = new Set<Subscriber>();
  const subscriptionOwners = new WeakMap<SharedStdinSubscription, Subscriber>();
  const detections = new Set<KittyQueryDetection>();
  const chunkQueue: QueuedChunk[] = [];
  const afterCurrentChunk: Array<() => void> = [];
  const pendingBytes: ContextualByte[] = [];
  const retainedFramingSnapshots = new Map<RecipientSnapshot, Set<Subscriber>>();
  const inputParser = createInputParser();
  let pendingInputRecipients: RecipientSnapshot | undefined;
  let pendingFlushTimer: ReturnType<typeof setTimeout> | undefined;
  let inputListenerAttached = false;
  let inputAttachmentEpoch = 0;
  let inputDemandEpoch = 0;
  let flowOwnedByIngress = false;
  let reconcilingFlow = false;
  let flowReconcileRequested = false;
  let processing = false;
  let firstProcessingError: unknown;

  function snapshotActiveRecipients(): RecipientSnapshot {
    const recipients: Recipient[] = [];
    for (const subscriber of subscribers) {
      if (!subscriber.requestedActive || subscriber.disposed) continue;
      recipients.push({
        subscriber,
        generation: subscriber.generation,
        context: subscriber.capture(),
      });
    }
    return { recipients };
  }

  function hasActiveSubscriber(): boolean {
    for (const subscriber of subscribers) {
      if (subscriber.requestedActive && !subscriber.disposed) return true;
    }
    return false;
  }

  function hasActiveDetection(): boolean {
    for (const detection of detections) {
      if (detection.pending) return true;
    }
    return false;
  }

  function hasNotifyingDetection(): boolean {
    for (const detection of detections) {
      if (detection.pending && detection.notify) return true;
    }
    return false;
  }

  function detectionKeepsPartialFraming(value: string): boolean {
    if (!hasActiveDetection() || !isPartialKittyQueryResponse(value)) return false;
    if (hasNotifyingDetection()) return true;
    // A cancelled query still owns its possible reply for the remainder of
    // the finite FIFO window. Keep prefixes that have become specifically
    // query-shaped, while lone ESC and ESC[ retain the ordinary 20ms key
    // boundary so an abandoned detector does not delay Escape/CSI input.
    return value === `${ESC}[?` || /^\x1b\[\?\d+$/.test(value);
  }

  function clearPendingFlush(): void {
    if (pendingFlushTimer === undefined) return;
    clearTimeout(pendingFlushTimer);
    pendingFlushTimer = undefined;
  }

  function currentFramingSnapshot(): RecipientSnapshot | undefined {
    if (inputParser.peekPending() !== "") return pendingInputRecipients;
    return pendingBytes[0]?.recipients;
  }

  function framingInProgress(): boolean {
    return inputParser.peekPending() !== "" || pendingBytes.length > 0;
  }

  function snapshotHasLiveRecipient(snapshot: RecipientSnapshot | undefined): boolean {
    if (!snapshot) return false;
    return snapshot.recipients.some(
      ({ subscriber, generation }) => !subscriber.disposed && subscriber.generation === generation,
    );
  }

  function snapshotKeepsFraming(snapshot: RecipientSnapshot | undefined): boolean {
    return (
      snapshotHasLiveRecipient(snapshot) ||
      (snapshot !== undefined && (retainedFramingSnapshots.get(snapshot)?.size ?? 0) > 0)
    );
  }

  function dropFinishedRetainedSnapshots(): void {
    const current = currentFramingSnapshot();
    for (const snapshot of retainedFramingSnapshots.keys()) {
      if (snapshot !== current) retainedFramingSnapshots.delete(snapshot);
    }
  }

  function releaseSubscriberRetentions(subscriber: Subscriber): void {
    for (const [snapshot, owners] of retainedFramingSnapshots) {
      owners.delete(subscriber);
      if (owners.size === 0) retainedFramingSnapshots.delete(snapshot);
    }
  }

  function resetPendingFraming(): void {
    clearPendingFlush();
    inputParser.reset();
    pendingInputRecipients = undefined;
    pendingBytes.length = 0;
    retainedFramingSnapshots.clear();
  }

  function discardOrphanedPendingFraming(): void {
    if (!framingInProgress()) {
      retainedFramingSnapshots.clear();
      return;
    }
    const pending = inputParser.peekPending();
    const detectionKeepsFraming = detectionKeepsPartialFraming(pending);
    if (detectionKeepsFraming || snapshotKeepsFraming(currentFramingSnapshot())) return;
    resetPendingFraming();
  }

  function resetFramingState(): void {
    resetPendingFraming();
    chunkQueue.length = 0;
    afterCurrentChunk.length = 0;
  }

  function externalDataListenerCount(): number {
    let frameworkListeners = 0;
    for (const listener of stdin.listeners("data")) {
      if (listener === handleData) frameworkListeners++;
    }
    return Math.max(0, stdin.listenerCount("data") - frameworkListeners);
  }

  function reconcileOwnedFlow(): void {
    if (!("readableFlowing" in stdin)) return;
    if (reconcilingFlow) {
      flowReconcileRequested = true;
      return;
    }

    reconcilingFlow = true;
    let firstError: unknown;
    try {
      while (true) {
        if (firstError !== undefined && !flowReconcileRequested) break;
        flowReconcileRequested = false;
        const externalListeners = externalDataListenerCount();
        if (externalListeners > 0) {
          // An external data owner controls its own paused/flowing state. Merely
          // observing a paused stream is not evidence that the framework caused
          // it, so relinquish ownership without calling resume().
          flowOwnedByIngress = false;
          break;
        }

        if (!flowOwnedByIngress) {
          if (!inputListenerAttached || stdin.readableFlowing === true) break;
          // No external data owner existed when the framework started this
          // non-flowing stream, so it must restore the paused state on detach.
          flowOwnedByIngress = true;
        }

        const shouldFlow = inputListenerAttached;
        const isFlowing = stdin.readableFlowing === true;
        if (shouldFlow === isFlowing) {
          if (!flowReconcileRequested) break;
          continue;
        }

        const before = stdin.readableFlowing;
        try {
          if (shouldFlow && typeof stdin.resume === "function") stdin.resume();
          else if (!shouldFlow && typeof stdin.pause === "function") {
            const externalBeforePause = externalDataListenerCount();
            stdin.pause();
            if (
              externalBeforePause === 0 &&
              externalDataListenerCount() > 0 &&
              stdin.readableFlowing !== true &&
              typeof stdin.resume === "function"
            ) {
              // An external listener joined re-entrantly before our pause took
              // effect. Undo this specific framework transition, then relinquish
              // ownership; do not generalize this to externally paused streams.
              flowOwnedByIngress = false;
              stdin.resume();
            }
          } else break;
        } catch (error) {
          firstError ??= error;
        }
        if (firstError !== undefined && flowReconcileRequested) {
          continue;
        }
        if (firstError !== undefined) break;
        // A non-Node custom stream may expose readableFlowing without updating
        // it. Do not spin forever when the host call made no observable progress.
        if (stdin.readableFlowing === before && !flowReconcileRequested) break;
      }
    } finally {
      reconcilingFlow = false;
    }
    if (firstError !== undefined) throw firstError;
  }

  function attachInputListener(): void {
    if (inputListenerAttached) return;
    const attachDemandEpoch = inputDemandEpoch;
    const canObserveFlow = "readableFlowing" in stdin;
    if (
      canObserveFlow &&
      flowOwnedByIngress &&
      !reconcilingFlow &&
      stdin.listenerCount("data") === 0 &&
      stdin.readableFlowing === true
    ) {
      // While detached, outside code resumed the stream and then removed its
      // own listener. That changes the baseline: the framework must no longer
      // restore its older paused state after this new attachment lifetime.
      flowOwnedByIngress = false;
    }
    const startsFlow =
      canObserveFlow && stdin.readableFlowing !== true && stdin.listenerCount("data") === 0;
    if (startsFlow) flowOwnedByIngress = true;
    // Record ownership before calling an arbitrary stream. Its on() method may
    // synchronously emit data or may attach and then throw.
    inputListenerAttached = true;
    const attachEpoch = ++inputAttachmentEpoch;
    try {
      stdin.on("data", handleData);
      reconcileOwnedFlow();
    } catch (error) {
      try {
        stdin.off("data", handleData);
      } catch {
        // Preserve the acquisition error; listener rollback is best-effort.
      }
      inputListenerAttached = stdin.listeners("data").includes(handleData);
      try {
        reconcileOwnedFlow();
      } catch {
        // Preserve the listener/resume acquisition error below.
      }
      const hasNewerAttachment = inputAttachmentEpoch !== attachEpoch;
      const hasNewerDemand = inputDemandEpoch !== attachDemandEpoch;
      if (!hasNewerAttachment && !hasNewerDemand) {
        resetFramingState();
      } else {
        discardOrphanedPendingFraming();
        reconcilePendingFlush();
      }
      const shouldReattach =
        hasActiveSubscriber() ||
        hasActiveDetection() ||
        (framingInProgress() && snapshotKeepsFraming(currentFramingSnapshot()));
      if ((hasNewerAttachment || hasNewerDemand) && shouldReattach && !inputListenerAttached) {
        try {
          attachInputListener();
        } catch {
          // Preserve the outer acquisition error.
        }
      }
      throw error;
    }
  }

  function reconcileInputListener(): void {
    discardOrphanedPendingFraming();
    const shouldAttach =
      hasActiveSubscriber() ||
      hasActiveDetection() ||
      (framingInProgress() && snapshotKeepsFraming(currentFramingSnapshot()));
    if (shouldAttach) {
      attachInputListener();
      return;
    }
    if (!inputListenerAttached || processing) return;
    const detachEpoch = inputAttachmentEpoch;
    inputListenerAttached = false;
    let detachError: unknown;
    try {
      stdin.off("data", handleData);
    } catch (error) {
      detachError = error;
      try {
        stdin.off("data", handleData);
      } catch {
        // Preserve the first detach error after one best-effort retry.
      }
    }
    inputListenerAttached = stdin.listeners("data").includes(handleData);
    try {
      reconcileOwnedFlow();
    } catch (error) {
      detachError ??= error;
    }
    if (inputAttachmentEpoch === detachEpoch) {
      resetFramingState();
    } else {
      // A hostile off() can synchronously activate another recipient whose on()
      // immediately supplies the start of a new event. The old detach must not
      // erase framing that belongs to that newer attachment lifetime.
      discardOrphanedPendingFraming();
      reconcilePendingFlush();
    }
    const shouldReattach =
      hasActiveSubscriber() ||
      hasActiveDetection() ||
      (framingInProgress() && snapshotKeepsFraming(currentFramingSnapshot()));
    if (shouldReattach && !inputListenerAttached) {
      try {
        attachInputListener();
      } catch (error) {
        detachError ??= error;
      }
    }
    if (detachError !== undefined) throw detachError;
  }

  function recordError(error: unknown): void {
    firstProcessingError ??= error;
  }

  function deliver(
    event: NormalizedInputFact,
    recipients: RecipientSnapshot | undefined,
    excluded?: Subscriber,
  ): void {
    if (!recipients) return;
    for (const recipient of recipients.recipients) {
      const subscriber = recipient.subscriber;
      if (
        subscriber.disposed ||
        subscriber === excluded ||
        subscriber.generation !== recipient.generation
      ) {
        continue;
      }
      try {
        subscriber.listener(event, recipient.context);
      } catch (error) {
        recordError(error);
      }
    }
  }

  function normalizeAndDeliver(
    event: InputEvent,
    recipients: RecipientSnapshot | undefined,
    excluded?: Subscriber,
  ): void {
    const fact = normalizeInputEvent(event);
    if (fact) deliver(fact, recipients, excluded);
  }

  function appendDecodedSegment(
    segments: DecodedSegment[],
    text: string,
    recipients: RecipientSnapshot,
  ): void {
    if (text === "") return;
    const previous = segments.at(-1);
    if (previous?.recipients === recipients) previous.text += text;
    else segments.push({ text, recipients });
  }

  function decodeChunk(chunk: QueuedChunk): DecodedSegment[] {
    if (typeof chunk.chunk === "string") {
      const segments: DecodedSegment[] = [];
      if (pendingBytes.length > 0) {
        const first = pendingBytes[0]!;
        const bytes = pendingBytes.splice(0).map((entry) => entry.byte);
        appendDecodedSegment(segments, Buffer.from(bytes).toString("utf8"), first.recipients);
      }
      appendDecodedSegment(segments, chunk.chunk, chunk.recipients);
      return segments;
    }

    for (const byte of chunk.chunk) pendingBytes.push({ byte, recipients: chunk.recipients });
    const segments: DecodedSegment[] = [];
    while (pendingBytes.length > 0) {
      const leading = pendingBytes[0]!;
      const length = expectedUtf8Length(leading.byte);
      let invalidAt: number | undefined;
      const availableLength = Math.min(length, pendingBytes.length);
      for (let index = 1; index < availableLength; index++) {
        const byte = pendingBytes[index]!.byte;
        if (
          (index === 1 && !isValidUtf8SecondByte(leading.byte, byte)) ||
          (index > 1 && !isContinuationByte(byte))
        ) {
          invalidAt = index;
          break;
        }
      }

      if (length > 1 && invalidAt === undefined && pendingBytes.length < length) break;
      // WHATWG/Node maximal-subpart behavior: a bad second byte replaces only
      // the lead; a bad later byte replaces the already-valid prefix once and
      // is then reprocessed as the start of the next scalar.
      const consumedLength = invalidAt ?? length;
      const bytes = pendingBytes.splice(0, consumedLength).map((entry) => entry.byte);
      appendDecodedSegment(segments, Buffer.from(bytes).toString("utf8"), leading.recipients);
    }
    return segments;
  }

  function nextDetection(
    completedDetections: ReadonlySet<KittyQueryDetection>,
  ): KittyQueryDetection | undefined {
    for (const detection of detections) {
      if (detection.pending && !completedDetections.has(detection)) return detection;
    }
    return undefined;
  }

  function processInputEvent(
    event: InputEvent,
    recipients: RecipientSnapshot | undefined,
    completedDetections: KittyQueryDetection[],
    completedDetectionSet: Set<KittyQueryDetection>,
  ): void {
    if (typeof event === "string") {
      const responseMatch = /^(.*)(\x1b\[\?\d+u)$/s.exec(event);
      if (responseMatch) {
        const prefix = responseMatch[1]!;
        if (prefix !== "") normalizeAndDeliver(prefix, recipients);
        const detection = nextDetection(completedDetectionSet);
        if (detection) {
          completedDetections.push(detection);
          completedDetectionSet.add(detection);
          return;
        }
        if (prefix !== "") {
          normalizeAndDeliver(responseMatch[2]!, recipients);
          return;
        }
      }
    }
    normalizeAndDeliver(event, recipients);
  }

  function feedDecodedSegment(
    segment: DecodedSegment,
    completedDetections: KittyQueryDetection[],
    completedDetectionSet: Set<KittyQueryDetection>,
  ): void {
    const hadPendingInput = inputParser.peekPending() !== "";
    const inheritedRecipients = pendingInputRecipients;
    const events = inputParser.push(segment.text);

    // Commit the trailing unit's event-start context before invoking any user
    // handler from the completed prefix. A handler may suspend or replace its
    // route synchronously; invalidate({ retainPending: true }) must already be
    // able to see the partial CSI/paste that follows it in the same chunk.
    if (inputParser.peekPending() === "") {
      pendingInputRecipients = undefined;
    } else if (!hadPendingInput || events.length > 0) {
      pendingInputRecipients = segment.recipients;
    }
    dropFinishedRetainedSnapshots();

    for (let index = 0; index < events.length; index++) {
      const recipients = index === 0 && hadPendingInput ? inheritedRecipients : segment.recipients;
      processInputEvent(events[index]!, recipients, completedDetections, completedDetectionSet);
    }
  }

  function finishDetections(completedDetections: readonly KittyQueryDetection[]): void {
    const settledDetections: KittyQueryDetection[] = [];
    for (const detection of completedDetections) {
      if (!detection.pending) continue;
      detection.pending = false;
      detections.delete(detection);
      inputDemandEpoch++;
      if (detection.timer !== undefined) clearTimeout(detection.timer);
      detection.timer = undefined;
      if (detection.notify) settledDetections.push(detection);
    }
    for (const detection of settledDetections) {
      try {
        detection.onResult(true);
      } catch (error) {
        recordError(error);
      }
    }
  }

  function releasePendingQueryPrefix(excluded?: Subscriber): void {
    if (hasActiveDetection()) return;
    const pending = inputParser.peekPending();
    if (!isPartialKittyQueryResponse(pending)) return;
    const recipients = pendingInputRecipients;
    const released = inputParser.flushPendingEscape();
    pendingInputRecipients = undefined;
    dropFinishedRetainedSnapshots();
    if (released && !/^\x1b\[\?\d+$/.test(released)) {
      normalizeAndDeliver(released, recipients, excluded);
    }
  }

  function reconcilePendingFlush(): void {
    clearPendingFlush();
    const pending = inputParser.peekPending();
    if (pending === "") return;
    if (detectionKeepsPartialFraming(pending)) return;
    if (retainedFramingSnapshots.has(currentFramingSnapshot()!)) return;
    if (!inputParser.hasPendingEscape()) return;
    pendingFlushTimer = setTimeout(() => {
      pendingFlushTimer = undefined;
      runInputTransaction(() => {
        const recipients = pendingInputRecipients;
        const released = inputParser.flushPendingEscape();
        pendingInputRecipients = undefined;
        dropFinishedRetainedSnapshots();
        if (released) normalizeAndDeliver(released, recipients);
      });
    }, FLUSH_DELAY);
  }

  function drainAfterCurrentChunk(): void {
    while (afterCurrentChunk.length > 0) {
      const operation = afterCurrentChunk.shift()!;
      try {
        operation();
      } catch (error) {
        recordError(error);
      }
    }
  }

  function processChunk(chunk: QueuedChunk): void {
    clearPendingFlush();
    const completedDetections: KittyQueryDetection[] = [];
    const completedDetectionSet = new Set<KittyQueryDetection>();
    for (const segment of decodeChunk(chunk)) {
      feedDecodedSegment(segment, completedDetections, completedDetectionSet);
    }

    // Lifecycle operations requested by an application handler take effect only
    // after every earlier fact from this physical chunk has finished broadcasting.
    drainAfterCurrentChunk();
    finishDetections(completedDetections);
    drainAfterCurrentChunk();
    reconcilePendingFlush();
  }

  function runInputTransaction(operation: () => void): void {
    if (processing) {
      afterCurrentChunk.push(operation);
      return;
    }

    processing = true;
    firstProcessingError = undefined;
    try {
      try {
        operation();
      } catch (error) {
        recordError(error);
      }
      while (chunkQueue.length > 0 || afterCurrentChunk.length > 0) {
        if (afterCurrentChunk.length > 0) drainAfterCurrentChunk();
        const chunk = chunkQueue.shift();
        if (chunk) {
          try {
            processChunk(chunk);
          } catch (error) {
            recordError(error);
          }
        }
      }
    } finally {
      processing = false;
      try {
        reconcileInputListener();
      } catch (error) {
        recordError(error);
      }
    }

    if (firstProcessingError !== undefined) {
      const error = firstProcessingError;
      firstProcessingError = undefined;
      throw error;
    }
  }

  function handleData(chunk: Uint8Array | string): void {
    chunkQueue.push({
      chunk: typeof chunk === "string" ? chunk : Uint8Array.from(chunk),
      recipients: snapshotActiveRecipients(),
    });
    if (!processing) runInputTransaction(() => {});
  }

  function timeoutDetection(detection: KittyQueryDetection): void {
    if (!detection.pending) return;
    detection.pending = false;
    detections.delete(detection);
    inputDemandEpoch++;
    detection.timer = undefined;
    runInputTransaction(() => {
      releasePendingQueryPrefix();
      if (detection.notify) {
        try {
          detection.onResult(false);
        } catch (error) {
          recordError(error);
        }
      }
      reconcilePendingFlush();
    });
  }

  function armDetectionTimeout(detection: KittyQueryDetection): void {
    if (detection.timer !== undefined) clearTimeout(detection.timer);
    detection.timer = setTimeout(() => timeoutDetection(detection), KITTY_QUERY_TIMEOUT);
    detection.timer.unref?.();
  }

  function cancelDetection(detection: KittyQueryDetection): void {
    if (!detection.pending || !detection.notify) return;
    // A query already written to the terminal has no request id. Keep its FIFO
    // slot as a short-lived tombstone so a late reply cannot settle a newer
    // app's query or leak into application input. Cancellation suppresses the
    // callback. Query-shaped partial replies remain owned for that window;
    // lone ESC and ESC[ retain the ordinary 20ms input boundary.
    detection.notify = false;
    inputDemandEpoch++;
    reconcilePendingFlush();
    reconcileInputListener();
  }

  function abortDetection(detection: KittyQueryDetection): void {
    if (!detection.pending) return;
    detection.pending = false;
    detection.notify = false;
    detections.delete(detection);
    inputDemandEpoch++;
    if (detection.timer !== undefined) clearTimeout(detection.timer);
    detection.timer = undefined;
    const release = () => {
      releasePendingQueryPrefix(detection.owner);
      reconcilePendingFlush();
      reconcileInputListener();
    };
    if (processing) afterCurrentChunk.push(release);
    else runInputTransaction(release);
  }

  const ingress: SharedStdinIngress = {
    subscribe<Context>(
      capture: () => Context,
      listener: (event: NormalizedInputFact, context: Context) => void,
    ) {
      const subscriber: Subscriber = {
        capture,
        listener: (event, context) => listener(event, context as Context),
        requestedActive: false,
        disposed: false,
        generation: 0,
      };
      subscribers.add(subscriber);
      const subscription: SharedStdinSubscription = {
        setActive(active) {
          if (subscriber.disposed || subscriber.requestedActive === active) return;
          subscriber.requestedActive = active;
          inputDemandEpoch++;
          reconcileInputListener();
        },
        invalidate(options) {
          if (subscriber.disposed) return;
          inputDemandEpoch++;
          const framingSnapshot = currentFramingSnapshot();
          const pendingText = inputParser.peekPending();
          if (
            options?.retainPending &&
            // A lone ESC is both a complete Escape key and a possible prefix.
            // Do not let suspension turn the first post-resume key into an old
            // Alt chord. Definite CSI/paste framing and partial UTF-8 are kept.
            (pendingText !== ESC || pendingBytes.length > 0) &&
            framingSnapshot?.recipients.some(
              (recipient) =>
                recipient.subscriber === subscriber &&
                recipient.generation === subscriber.generation,
            )
          ) {
            let owners = retainedFramingSnapshots.get(framingSnapshot);
            if (!owners) {
              owners = new Set();
              retainedFramingSnapshots.set(framingSnapshot, owners);
            }
            owners.add(subscriber);
          } else if (!options?.retainPending) {
            releaseSubscriberRetentions(subscriber);
          }
          subscriber.generation++;
          discardOrphanedPendingFraming();
          reconcilePendingFlush();
          reconcileInputListener();
        },
        dispose() {
          if (subscriber.disposed) return;
          inputDemandEpoch++;
          subscriber.disposed = true;
          subscriber.requestedActive = false;
          subscriber.generation++;
          subscribers.delete(subscriber);
          releaseSubscriberRetentions(subscriber);
          discardOrphanedPendingFraming();
          reconcilePendingFlush();
          reconcileInputListener();
        },
      };
      subscriptionOwners.set(subscription, subscriber);
      return subscription;
    },
    startKittyQueryResponseDetection(onResult, owner) {
      const ownerSubscriber = owner ? subscriptionOwners.get(owner) : undefined;
      if (ownerSubscriber) {
        for (const detection of detections) {
          if (detection.pending && !detection.notify && detection.owner === ownerSubscriber) {
            // suspend/resume reuses the owner's unresolved FIFO slot. The
            // resumed controller may write a fresh query, but one reply can now
            // settle it instead of being swallowed by its own old tombstone.
            detection.onResult = onResult;
            detection.notify = true;
            inputDemandEpoch++;
            armDetectionTimeout(detection);
            reconcileInputListener();
            reconcilePendingFlush();
            return (options) =>
              options?.discard ? abortDetection(detection) : cancelDetection(detection);
          }
        }
      }
      const detection: KittyQueryDetection = {
        onResult,
        owner: ownerSubscriber,
        timer: undefined,
        pending: true,
        notify: true,
      };
      detections.add(detection);
      inputDemandEpoch++;
      try {
        reconcileInputListener();
        reconcilePendingFlush();
      } catch (error) {
        detection.pending = false;
        detections.delete(detection);
        try {
          reconcileInputListener();
        } catch {
          // Preserve the first acquisition error.
        }
        throw error;
      }
      if (detection.pending) {
        armDetectionTimeout(detection);
      }
      return (options) =>
        options?.discard ? abortDetection(detection) : cancelDetection(detection);
    },
  };

  return ingress;
}

export function getSharedStdinIngress(stdin: NodeJS.ReadStream): SharedStdinIngress {
  let ingress = ingressRegistry.get(stdin);
  if (!ingress) {
    ingress = createSharedStdinIngress(stdin);
    ingressRegistry.set(stdin, ingress);
  }
  return ingress;
}
