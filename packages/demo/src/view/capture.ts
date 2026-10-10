/**
 * The capture view: a camera or a video file, a scale, a weight, a recording, and the result. DOM only.
 * What a recording means is decided by captureFlow.ts; what a frame is, by landmarks.ts. Nothing here
 * stores a frame: the recorded wrist positions live in memory until the page is closed.
 */

import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { PoseFrame } from "@ground-truth/capture";
import { ENVS, type Quantity, type SessionResult } from "../model/scenarios";
import {
  CONFIDENCE_SENTENCE,
  SCALE_SENTENCE,
  analyseRecording,
  captureInputProblem,
  refusalSentences,
  scaleFrom,
  transition,
  type CaptureOutcome,
  type FlowEvent,
  type FlowState,
  type ScaleMethod,
} from "../model/captureFlow";
import { calibrationFromLandmarks, normalizedY, pickSide, toPoseFrame, wristOf, type Landmark, type Side } from "../pose/landmarks";
import { loadLandmarker, openCamera, openFile, track, type FrameSample, type Tracker, type VideoSource } from "../pose/source";
import { h, replace, svg, tagChip } from "./dom";
import { formatEnergy, formatForce, formatLength, formatQuantity, formatSeconds } from "./format";

const RECENT_SAMPLES = 30;
/** A file is played at half speed so that the pose model keeps up with every frame; the frame times are the video's own either way. */
const FILE_PLAYBACK_RATE = 0.5;
const WRIST_VISIBLE = 0.5;

const ENV_OPTIONS = [
  { value: "EARTH", label: "Earth" },
  { value: "MOON", label: "Moon" },
  { value: "MARS", label: "Mars" },
  { value: "ISS", label: "ISS" },
] as const;

export interface CaptureView {
  /** Stops any recording and releases the camera. Called when the view is left. */
  release(): void;
}

export function mountCapture(root: HTMLElement, onAdd: (session: SessionResult) => void): CaptureView {
  const s = {
    flow: "idle" as FlowState,
    source: null as VideoSource | null,
    landmarker: null as PoseLandmarker | null,
    tracker: null as Tracker | null,
    recent: [] as Landmark[][],
    last: undefined as Landmark[] | undefined,
    frozen: false,
    frozenLandmarks: undefined as Landmark[] | undefined,
    scale: null as { metersPerUnit: number; quantity: Quantity } | null,
    frames: [] as PoseFrame[],
    side: "LEFT" as Side,
    counter: 0,
    outcome: null as CaptureOutcome | null,
    added: false,
  };

  const go = (event: FlowEvent): void => {
    s.flow = transition(s.flow, event);
    render();
  };

  // ---- 1. protocol -----------------------------------------------------------------------------

  const protocol = h(
    "section",
    { class: "block card", "aria-labelledby": "h-protocol" },
    h("h2", { id: "h-protocol" }, "How to record"),
    h(
      "ol",
      { class: "steps" },
      h("li", null, "Stand side-on to the camera, with the whole movement in the frame."),
      h("li", null, "Hold the weight still for about a second before the first rep, and again before you put it down."),
      h("li", null, "Start and stop the recording while you are still."),
      h("li", null, "Rests between reps are fine, of any length."),
    ),
    h("p", { class: "note" }, "Nothing in this view has been validated on real video. The tracked wrist stands in for the weight; the movement must be side-on."),
  );

  // ---- 2. source and preview -------------------------------------------------------------------

  const status = h("p", { class: "status", role: "status", "aria-live": "polite" });
  const timingWarning = h("p", { class: "field-error", hidden: true }, "This browser does not report the time of each video frame, so the timestamps carry scheduling jitter that the analysis cannot tell from movement. Results will be less reliable.");
  const video = h("video", { class: "stage-video", playsinline: true, muted: true });
  const frozenCanvas = h("canvas", { class: "stage-frozen", hidden: true });
  const wristMark = svg("path", { d: "M-0.03 0H0.03M0 -0.03V0.03", class: "wrist-mark", "vector-effect": "non-scaling-stroke" });
  const wristGroup = svg("g", { visibility: "hidden" }, wristMark);
  const markerA = svg("line", { x1: 0, x2: 1, y1: 0.3, y2: 0.3, class: "marker", "vector-effect": "non-scaling-stroke" });
  const markerB = svg("line", { x1: 0, x2: 1, y1: 0.7, y2: 0.7, class: "marker", "vector-effect": "non-scaling-stroke" });
  const markerGroup = svg("g", { visibility: "hidden" }, markerA, markerB);
  const overlay = svg("svg", { viewBox: "0 0 1 1", preserveAspectRatio: "none", class: "stage-overlay", "aria-hidden": "true" }, wristGroup, markerGroup);
  const stage = h("div", { class: "stage", hidden: true }, video, frozenCanvas, overlay);

  const fileInput = h("input", { id: "cap-file", type: "file", accept: "video/*", class: "file-input" });
  const cameraButton = h("button", { type: "button", class: "primary" }, "Use camera");
  const fileLabel = h("label", { for: "cap-file", class: "button-like" }, "Open a video file", fileInput);

  const source = h(
    "section",
    { class: "block", "aria-labelledby": "h-source" },
    h("h2", { id: "h-source" }, "Source"),
    h(
      "p",
      { class: "note" },
      "Opening a source loads the pose model from cdn.jsdelivr.net and storage.googleapis.com. No frame or video leaves this page. The pose library also tries to send usage metrics to Google; this page blocks that with a Content-Security-Policy.",
    ),
    h("div", { class: "button-row" }, cameraButton, fileLabel),
    status,
    timingWarning,
    stage,
  );

  // ---- 3. scale --------------------------------------------------------------------------------

  const freezeButton = h("button", { type: "button" }, "Freeze the frame");
  const unfreezeButton = h("button", { type: "button", hidden: true }, "Unfreeze");
  const sliderA = h("input", { id: "cap-a", type: "range", min: 0, max: 1, step: 0.001, value: 0.3 });
  const sliderB = h("input", { id: "cap-b", type: "range", min: 0, max: 1, step: 0.001, value: 0.7 });
  const lengthInput = h("input", { id: "cap-length", type: "number", inputmode: "decimal", min: 0.05, max: 3, step: 0.01 });
  const statureInput = h("input", { id: "cap-stature", type: "number", inputmode: "decimal", min: 1, max: 2.5, step: 0.01 });
  const useLengthButton = h("button", { type: "button" }, "Use this length as the scale");
  const useStatureButton = h("button", { type: "button" }, "Read my eye and ankle from the frozen frame");
  const scaleResult = h("div", { class: "scale-result", "aria-live": "polite" });

  const methodLength = h("input", { type: "radio", name: "cap-method", id: "cap-method-length", value: "length", checked: true });
  const methodStature = h("input", { type: "radio", name: "cap-method", id: "cap-method-stature", value: "stature" });

  const lengthPanel = h(
    "div",
    { class: "method-panel" },
    h("p", { class: "explain" }, "Hold an object of known length vertically at your wrist, freeze the frame, then tap its two ends (or move the two sliders) and type its length."),
    h("div", { class: "field" }, h("label", { for: "cap-a" }, "Top end, from the top of the frame"), sliderA),
    h("div", { class: "field" }, h("label", { for: "cap-b" }, "Bottom end, from the top of the frame"), sliderB),
    h("div", { class: "field" }, h("label", { for: "cap-length" }, "Length of the object", h("span", { class: "unit" }, " (m)")), lengthInput),
    useLengthButton,
  );
  const staturePanel = h(
    "div",
    { class: "method-panel", hidden: true },
    h("p", { class: "explain" }, "Stand upright and side-on, with your whole body in the frame, freeze the frame, and type your height. Less accurate than a known length: it scales the middle of your body, not your wrist."),
    h("div", { class: "field" }, h("label", { for: "cap-stature" }, "Your height", h("span", { class: "unit" }, " (m)")), statureInput),
    useStatureButton,
  );

  const scale = h(
    "section",
    { class: "block", "aria-labelledby": "h-scale", hidden: true },
    h("h2", { id: "h-scale" }, "Scale"),
    h("p", { class: "explain" }, SCALE_SENTENCE),
    h("div", { class: "button-row" }, freezeButton, unfreezeButton),
    h(
      "fieldset",
      { class: "methods" },
      h("legend", null, "Method"),
      h("div", { class: "field field-check" }, methodLength, h("label", { for: "cap-method-length" }, "Known length (preferred)")),
      h("div", { class: "field field-check" }, methodStature, h("label", { for: "cap-method-stature" }, "Stature")),
    ),
    lengthPanel,
    staturePanel,
    scaleResult,
  );

  // ---- 4. load ---------------------------------------------------------------------------------

  const massInput = h("input", { id: "cap-mass", type: "number", inputmode: "decimal", min: 0.1, max: 500, step: 0.1 });
  const forceInput = h("input", { id: "cap-force", type: "number", inputmode: "decimal", min: 0, max: 10000, step: 10, value: 0 });
  const envSelect = h("select", { id: "cap-env" }, ...ENV_OPTIONS.map((o) => h("option", { value: o.value }, o.label)));
  const loadProblem = h("p", { class: "note", hidden: true });

  const load = h(
    "section",
    { class: "block", "aria-labelledby": "h-load", hidden: true },
    h("h2", { id: "h-load" }, "Load"),
    h("div", { class: "field" }, h("label", { for: "cap-mass" }, "Mass of the weight", h("span", { class: "unit" }, " (kg)")), massInput),
    h("div", { class: "field" }, h("label", { for: "cap-env" }, "Environment"), envSelect),
    h("div", { class: "field" }, h("label", { for: "cap-force" }, "Constant device force, optional", h("span", { class: "unit" }, " (N)")), forceInput),
    loadProblem,
  );

  // ---- 5. record -------------------------------------------------------------------------------

  const recordButton = h("button", { type: "button", class: "primary" }, "Start recording");
  const stopButton = h("button", { type: "button", hidden: true }, "Stop");
  const record = h("section", { class: "block", "aria-label": "Record", hidden: true }, h("div", { class: "button-row" }, recordButton, stopButton));

  // ---- 6. result -------------------------------------------------------------------------------

  const result = h("section", { class: "block", "aria-labelledby": "h-result", hidden: true }, h("h2", { id: "h-result" }, "Result"), h("div", { id: "cap-result" }));
  const resultBody = result.querySelector("#cap-result") as HTMLElement;

  // ---- behaviour: source -----------------------------------------------------------------------

  function say(text: string): void {
    replace(status, text);
  }

  function stopTracking(): void {
    s.tracker?.stop();
    s.tracker = null;
  }

  function closeSource(): void {
    stopTracking();
    s.source?.release();
    s.source = null;
    s.last = undefined;
    s.recent = [];
    setFrozen(false);
    wristGroup.setAttribute("visibility", "hidden");
  }

  function onTrackError(error: unknown): void {
    say(`The pose model stopped: ${error instanceof Error ? error.message : String(error)}`);
    if (s.flow === "recording") finishRecording();
  }

  function drawWrist(landmarks: Landmark[] | undefined): void {
    const wrist = wristOf(landmarks, s.side);
    if (!wrist || (wrist.visibility ?? 0) < WRIST_VISIBLE || s.frozen) {
      wristGroup.setAttribute("visibility", "hidden");
      return;
    }
    wristMark.setAttribute("transform", `translate(${wrist.x} ${wrist.y})`);
    wristGroup.setAttribute("visibility", "visible");
  }

  function onPreviewSample(sample: FrameSample): void {
    s.last = sample.landmarks;
    if (sample.landmarks) {
      s.recent.push(sample.landmarks);
      if (s.recent.length > RECENT_SAMPLES) s.recent.shift();
      s.side = pickSide(s.recent);
    }
    drawWrist(sample.landmarks);
  }

  function startPreview(): void {
    stopTracking();
    if (!s.source || !s.landmarker) return;
    s.tracker = track(video, s.landmarker, onPreviewSample, onTrackError);
    timingWarning.hidden = s.tracker.timing === "frame";
  }

  async function open(kind: "camera" | "file", file?: File): Promise<void> {
    closeSource();
    if (s.flow !== "idle") go("reset");
    s.outcome = null;
    s.scale = null;
    s.added = false;
    say(kind === "camera" ? "Opening the camera…" : "Opening the video…");
    try {
      const opened = kind === "camera" ? await openCamera(video) : await openFile(video, file as File);
      s.source = opened;
      stage.hidden = false;
      say("Loading the pose model (a one-off download of a few megabytes)…");
      s.landmarker = await loadLandmarker();
      go("openSource");
      say("Ready. Freeze a frame to set the scale, then record.");
      startPreview();
      if (opened.kind === "file") video.controls = true;
    } catch (error) {
      closeSource();
      stage.hidden = true;
      say(error instanceof Error ? error.message : String(error));
      if (s.flow !== "idle") go("reset");
      else render();
    }
  }

  cameraButton.addEventListener("click", () => void open("camera"));
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void open("file", file);
    fileInput.value = "";
  });
  // After a seek the preview must start a new run: the pose model's clock only moves forward.
  video.addEventListener("seeked", () => {
    if (s.flow === "calibrating" || s.flow === "ready") startPreview();
  });
  video.addEventListener("loadedmetadata", () => {
    stage.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  });
  video.addEventListener("ended", () => {
    if (s.flow === "recording") finishRecording();
  });

  // ---- behaviour: scale ------------------------------------------------------------------------

  function setFrozen(on: boolean): void {
    s.frozen = on;
    frozenCanvas.hidden = !on;
    markerGroup.setAttribute("visibility", on && methodLength.checked ? "visible" : "hidden");
    freezeButton.hidden = on;
    unfreezeButton.hidden = !on;
    if (on) wristGroup.setAttribute("visibility", "hidden");
  }

  freezeButton.addEventListener("click", () => {
    if (!s.source) return;
    frozenCanvas.width = video.videoWidth;
    frozenCanvas.height = video.videoHeight;
    frozenCanvas.getContext("2d")?.drawImage(video, 0, 0);
    s.frozenLandmarks = s.last;
    setFrozen(true);
  });
  unfreezeButton.addEventListener("click", () => setFrozen(false));

  function syncMarkers(): void {
    markerA.setAttribute("y1", sliderA.value);
    markerA.setAttribute("y2", sliderA.value);
    markerB.setAttribute("y1", sliderB.value);
    markerB.setAttribute("y2", sliderB.value);
  }
  sliderA.addEventListener("input", syncMarkers);
  sliderB.addEventListener("input", syncMarkers);

  // Tapping the frozen frame sets the nearer-unset end: first tap the top end, next the bottom end, then again.
  let nextEnd: "a" | "b" = "a";
  frozenCanvas.addEventListener("pointerdown", (event) => {
    const rect = frozenCanvas.getBoundingClientRect();
    const y = String(normalizedY(event.clientY, rect.top, rect.height));
    const slider = nextEnd === "a" ? sliderA : sliderB;
    slider.value = y;
    nextEnd = nextEnd === "a" ? "b" : "a";
    syncMarkers();
  });

  function selectMethod(): void {
    const length = methodLength.checked;
    lengthPanel.hidden = !length;
    staturePanel.hidden = length;
    markerGroup.setAttribute("visibility", s.frozen && length ? "visible" : "hidden");
  }
  methodLength.addEventListener("change", selectMethod);
  methodStature.addEventListener("change", selectMethod);

  function applyScale(method: ScaleMethod): void {
    const outcome = scaleFrom(method);
    if (!outcome.ok) {
      s.scale = null;
      replace(scaleResult, h("p", { class: "field-error" }, outcome.reason));
      if (s.flow === "ready") go("recalibrate");
    } else {
      s.scale = { metersPerUnit: outcome.metersPerUnit, quantity: outcome.quantity };
      replace(
        scaleResult,
        h("p", null, h("strong", null, formatQuantity(outcome.quantity)), " ", tagChip(outcome.quantity.tag)),
        h("p", { class: "note" }, outcome.quantity.note),
      );
      if (s.flow === "calibrating") go("calibrated");
    }
    render();
  }

  useLengthButton.addEventListener("click", () =>
    applyScale({ kind: "known-length", lengthM: lengthInput.valueAsNumber, yA: sliderA.valueAsNumber, yB: sliderB.valueAsNumber }),
  );
  useStatureButton.addEventListener("click", () => {
    const calibration = s.frozen && s.frozenLandmarks ? calibrationFromLandmarks(s.frozenLandmarks, s.side) : null;
    if (!calibration) {
      s.scale = null;
      if (s.flow === "ready") go("recalibrate");
      replace(
        scaleResult,
        h("p", { class: "field-error" }, s.frozen ? "Your eye and ankle are not both visible in the frozen frame. Step back so that your whole body is in the frame, stand side-on, and freeze again." : "Freeze a frame with your whole body in it first."),
      );
      render();
      return;
    }
    applyScale({ kind: "stature", statureM: statureInput.valueAsNumber, eyeY: calibration.eyeY, ankleY: calibration.ankleY });
  });

  // ---- behaviour: record -----------------------------------------------------------------------

  function inputs() {
    const force = forceInput.value.trim() === "" ? 0 : forceInput.valueAsNumber;
    return {
      massKg: massInput.valueAsNumber,
      gEnvMs2: ENVS[envSelect.value as keyof typeof ENVS].gEnvMs2,
      deviceForceN: force,
      metersPerUnit: s.scale?.metersPerUnit ?? null,
      scaleNote: s.scale?.quantity.note ?? "",
    };
  }

  function currentProblem(): string | null {
    return captureInputProblem(inputs());
  }

  recordButton.addEventListener("click", () => {
    if (s.flow !== "ready" || !s.source || !s.landmarker || s.scale === null || currentProblem()) return;
    stopTracking();
    s.frames = [];
    s.outcome = null;
    s.added = false;
    setFrozen(false);
    go("start");
    say("Recording…");
    if (s.source.kind === "file") {
      video.controls = false;
      video.currentTime = 0;
      video.playbackRate = FILE_PLAYBACK_RATE;
      void video.play();
    }
    s.tracker = track(
      video,
      s.landmarker,
      (sample) => {
        s.frames.push(toPoseFrame(sample.tS, sample.landmarks, s.side));
        drawWrist(sample.landmarks);
        if (s.frames.length % 15 === 0) say(`Recording… ${s.frames.length} frames`);
      },
      onTrackError,
    );
  });

  function finishRecording(): void {
    if (s.flow !== "recording") return;
    stopTracking();
    video.pause();
    const label = { id: `camera-${s.counter + 1}`, title: `Camera set ${s.counter + 1}` };
    const outcome = analyseRecording(s.frames, inputs(), label);
    s.outcome = outcome;
    if (outcome.kind === "analysed") s.counter += 1;
    // The camera is released as soon as recording stops: the tracks are stopped, and nothing was stored.
    closeSource();
    stage.hidden = true;
    say(`Recording stopped. ${s.frames.length} frames analysed on this page; no frame or video was uploaded or saved.`);
    go(outcome.kind === "analysed" ? "analysed" : "refused");
  }
  stopButton.addEventListener("click", finishRecording);

  // ---- rendering -------------------------------------------------------------------------------

  function renderResult(): void {
    const outcome = s.outcome;
    if (!outcome) {
      replace(resultBody);
      return;
    }
    if (outcome.kind === "refused") {
      replace(
        resultBody,
        h("p", { role: "alert" }, h("strong", null, "This recording was not analysed."), " No numbers are given, because they would not mean anything."),
        h("ul", null, ...refusalSentences(outcome.reasons.map((r) => r.code)).map((sentence) => h("li", null, sentence))),
        h("p", { class: "note" }, "Record again after fixing the cause."),
      );
      return;
    }
    const rows = outcome.reps.map((row) =>
      h(
        "tr",
        null,
        h("th", { scope: "row" }, `Rep ${row.index}`),
        h("td", null, formatEnergy(row.rep.positiveWorkJ)),
        h("td", null, formatForce(row.rep.peakForceN)),
        h("td", null, formatLength(row.rep.rangeOfMotionM)),
        h("td", null, formatSeconds(row.rep.liftDurationS)),
      ),
    );
    const flagged = outcome.reps.filter((row) => row.notes.length > 0);
    const addButton = h("button", { type: "button", class: "primary", disabled: s.added }, s.added ? "Added to Two currencies" : "Add to today");
    addButton.addEventListener("click", () => {
      onAdd(outcome.session);
      s.added = true;
      renderResult();
    });
    replace(
      resultBody,
      h(
        "table",
        { class: "reps" },
        h("caption", null, "Per repetition ", tagChip("MEASURED")),
        h("thead", null, h("tr", null, h("th", { scope: "col" }, "Rep"), h("th", { scope: "col" }, "Positive work"), h("th", { scope: "col" }, "Peak force"), h("th", { scope: "col" }, "Range of motion"), h("th", { scope: "col" }, "Lift time"))),
        h("tbody", null, ...rows),
      ),
      ...flagged.map((row) => h("p", { class: "flag" }, h("strong", null, `Rep ${row.index}: `), row.notes.join(" "))),
      h(
        "p",
        { class: "totals" },
        h("strong", null, "Set: "),
        `${formatEnergy(outcome.session.energy.value)} positive work, ${formatForce(outcome.session.peakLoad.value)} largest peak force. `,
        tagChip("MEASURED"),
      ),
      h("p", { class: "note" }, outcome.confidenceSentence),
      h("p", { class: "note" }, `${SCALE_SENTENCE} Peak force is the noisiest output: indicative only.`),
      addButton,
      h("p", { class: "note" }, "A set added to today is a record of a real lift: it is the same in every environment of the other view, not re-scaled."),
    );
  }

  function render(): void {
    const calibrating = s.flow === "calibrating" || s.flow === "ready";
    scale.hidden = !calibrating;
    load.hidden = !calibrating;
    record.hidden = !(calibrating || s.flow === "recording");
    stopButton.hidden = s.flow !== "recording";
    recordButton.hidden = s.flow === "recording";
    const problem = currentProblem();
    recordButton.disabled = !(s.flow === "ready" && s.scale !== null && problem === null);
    const reason = s.flow === "recording" ? null : s.scale === null ? "Set the scale first." : problem;
    loadProblem.hidden = reason === null;
    replace(loadProblem, reason ?? "");
    cameraButton.disabled = s.flow === "recording";
    fileInput.disabled = s.flow === "recording";
    result.hidden = !(s.flow === "analysed" || s.flow === "refused");
    renderResult();
  }

  for (const input of [massInput, forceInput]) input.addEventListener("input", render);
  envSelect.addEventListener("change", render);

  replace(root, protocol, source, scale, load, record, result);
  render();

  return {
    release(): void {
      if (s.flow === "recording") {
        stopTracking();
        video.pause();
        s.outcome = null;
        go("reset");
      }
      if (s.source) {
        closeSource();
        stage.hidden = true;
        say("The camera was released.");
        go("reset");
      }
    },
  };
}
