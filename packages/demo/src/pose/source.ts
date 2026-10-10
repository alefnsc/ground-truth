/**
 * Camera or video file in, `{ tS, landmarks }` per video frame out. DOM and the pose library only:
 * the mapping to PoseFrame is in landmarks.ts, the arithmetic is nowhere in this file.
 *
 * Nothing here stores a frame or a video. The page contacts two hosts, both for the pose library: the
 * WASM runtime (cdn.jsdelivr.net) and the model (storage.googleapis.com), the two URLs below. The library
 * also tries to post usage metrics to Google (odml.pa.googleapis.com, every 60 s; per its own privacy notice,
 * "metrics about the performance and utilization of the APIs"). index.html blocks that with a
 * Content-Security-Policy that sets connect-src to the two hosts and 'self'; test/network.test.ts pins both.
 */

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "./landmarks";

/**
 * The pose model and the WASM runtime are fetched from these two URLs when a camera or a video file is opened.
 * AN OFFLINE BUILD MUST VENDOR BOTH: the model is a multi-megabyte binary and is deliberately not in this
 * repository. The WASM version below must equal the exact version of @mediapipe/tasks-vision in
 * packages/demo/package.json (pinned, no caret), so the JavaScript and the WASM it loads cannot drift apart.
 */
export const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
export const POSE_WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm";

// ---------------------------------------------------------------------------
// The pose model
// ---------------------------------------------------------------------------

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

/** Loads the model once; a failed load can be retried. */
export function loadLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(POSE_WASM_BASE)
      .then((fileset) =>
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL },
          runningMode: "VIDEO",
          numPoses: 1,
        }),
      )
      .catch((error: unknown) => {
        landmarkerPromise = null;
        throw error;
      });
  }
  return landmarkerPromise;
}

// ---------------------------------------------------------------------------
// Video sources
// ---------------------------------------------------------------------------

export interface VideoSource {
  kind: "camera" | "file";
  /** Stops the camera tracks and clears the video element, or revokes the file's object URL. */
  release(): void;
}

function prepare(video: HTMLVideoElement): void {
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
}

/** The rear camera if there is one. Needs a secure page (HTTPS or localhost). */
export async function openCamera(video: HTMLVideoElement): Promise<VideoSource> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This page cannot reach a camera. Phones only allow it on HTTPS (use npm run dev:https) or on localhost.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
  prepare(video);
  video.removeAttribute("src");
  video.srcObject = stream;
  await video.play();
  return {
    kind: "camera",
    release() {
      for (const track of stream.getTracks()) track.stop();
      video.pause();
      video.srcObject = null;
    },
  };
}

/** A video file chosen by the user. It is played from an object URL: it is never uploaded or stored. */
export async function openFile(video: HTMLVideoElement, file: File): Promise<VideoSource> {
  const url = URL.createObjectURL(file);
  prepare(video);
  video.srcObject = null;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("This browser cannot play that video file."));
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  video.onloadedmetadata = null;
  video.onerror = null;
  return {
    kind: "file",
    release() {
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    },
  };
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

export interface FrameSample {
  /** Seconds. The frame's own media time (see `Tracker.timing`). */
  tS: number;
  /** The first pose's landmarks, or undefined when nothing was detected. */
  landmarks: Landmark[] | undefined;
}

export interface Tracker {
  /**
   * "frame": the time of each sample is the video frame's own `mediaTime` (requestVideoFrameCallback), which
   * is what the capture package needs. "callback": this browser has no requestVideoFrameCallback, so the time is
   * `video.currentTime` read when an animation frame ran, which carries scheduling jitter that the pipeline cannot
   * tell from motion. The view says so.
   */
  timing: "frame" | "callback";
  stop(): void;
}

/** The pose model's clock must increase over the lifetime of the landmarker; every run starts after the last one ended. */
let clockOffsetMs = 0;
const RUN_GAP_MS = 1000;

/**
 * Delivers one sample per new video frame. A `mediaTime` is never processed twice and never out of order (a seek
 * backwards, a loop or a repeated callback is skipped), so every sample's `tS` is strictly increasing.
 */
export function track(video: HTMLVideoElement, landmarker: PoseLandmarker, onSample: (sample: FrameSample) => void, onError: (error: unknown) => void): Tracker {
  const hasFrameCallback = typeof video.requestVideoFrameCallback === "function";
  const runOffsetMs = clockOffsetMs + RUN_GAP_MS;
  let lastMediaS = Number.NEGATIVE_INFINITY;
  let stopped = false;
  let handle = 0;

  function process(mediaS: number): void {
    if (!(mediaS > lastMediaS)) return;
    lastMediaS = mediaS;
    const detectMs = runOffsetMs + mediaS * 1000;
    clockOffsetMs = Math.max(clockOffsetMs, detectMs);
    const result = landmarker.detectForVideo(video, detectMs);
    onSample({ tS: mediaS, landmarks: result.landmarks[0] });
  }

  function schedule(): void {
    if (stopped) return;
    if (hasFrameCallback) {
      handle = video.requestVideoFrameCallback((_now, metadata) => step(metadata.mediaTime));
    } else {
      handle = requestAnimationFrame(() => step(video.currentTime));
    }
  }

  function step(mediaS: number): void {
    if (stopped) return;
    try {
      process(mediaS);
    } catch (error) {
      stopped = true;
      onError(error);
      return;
    }
    schedule();
  }

  schedule();
  return {
    timing: hasFrameCallback ? "frame" : "callback",
    stop() {
      stopped = true;
      if (hasFrameCallback) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
    },
  };
}
