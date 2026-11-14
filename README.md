# Ground Truth

Load accounting for exercise under different gravities. From a session's parameters it models
**mechanical work in joules** and, except for the cycle ergometer, **peak force in newtons** under Earth,
Moon, Mars and ISS gravity, plus a daily skeletal load stimulus against the same day on Earth. From a wrist
trajectory read from a camera it estimates the work and peak force of a lifting set in the one gravity the
user enters. Every number carries a provenance tag and a stated source, and none has been validated
against a measurement; nothing here measures the body.

---

## Provenance — read this first

All dates in this section are in UTC−03:00 (São Paulo time).

- **Written before the hackathon.** The 57 commits made before this README update fall on three days:
  2026-09-23 (1 commit: the research brief), 2026-10-09 (47: the memo for Vocaid, the plans, the three
  packages, the demo script; in UTC the evening's commits fall on 2026-10-10) and 2026-10-11 (9: review
  fixes and the merge of pull requests #1 to #3). Nothing was committed between 2026-10-11 and this README
  update on the evening of 2026-11-13, which is already 2026-11-14 in UTC.
- **Why.** It was written to prepare for the NASA Space Apps Challenge 2026 challenge
  [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/),
  after the challenge summary was published (2026-09-17) and before the hackathon (2026-11-14/15).
- **Who.** One person, working with an AI coding assistant (Claude, by Anthropic). 53 of those 57 commits
  carry the assistant's `Co-Authored-By` trailer and the other 4 are merge commits; the commits of this
  README update carry the trailer too. The plans in [`docs/plans/`](docs/plans/) are written as
  instructions to the assistant and call the third-party `superpowers` skill set for Claude Code. No second
  human reviewer appears in the history.
- **What exists from before the hackathon.** The research brief ([`docs/strategy.md`](docs/strategy.md)),
  a Portuguese product memo for Vocaid drawn from that research
  ([`docs/consolidacao-vocaid.md`](docs/consolidacao-vocaid.md)), three implementation plans, the three
  packages below, the demo page, and a demo script written as the narration for a submission video
  ([`docs/demo-script.md`](docs/demo-script.md)).
- **Commercial context.** The author also works on Vocaid, a separate commercial product. The research
  brief was written with it in mind: its section 4 ("The existing stack") and the "existing roadmap items"
  in section 7 are Vocaid features, and section 2 cites "Vocaid's existing rule".
  `docs/consolidacao-vocaid.md` is a memo for Vocaid, committed on 2026-10-09. The packages here depend on
  no code from that product.
- **Published as it was.** The repository was private while this history was written and was made public
  only after this README was committed. None of the 57 commits made before 2026-11-13 was rewritten,
  squashed or re-dated.
- **Earlier README text.** Until 2026-11-13 this file also held two draft team descriptions written on
  2026-09-23. They described a product the code is not: "crew-facing health monitoring" that "measures"
  energy and load (the code estimates them from parameters or a camera), surrounded by vital signs
  (circadian drift, resting heart rate and HRV, blood pressure, SpO2, glucose, nutrition) that are not
  implemented. One also said that 45 minutes on the ISS cycle ergometer "burns real calories"; the code
  never computes kilocalories. They were removed on 2026-11-13; the git history keeps them.
- **The hackathon entry is separate.** Work done on 2026-11-14/15 will live in its own repository. If the
  entry uses anything from this repository (`@ground-truth/physics`, `@ground-truth/capture`, the demo page
  or the demo script), it will pin it to a commit of this repository as a vendored copy or a git submodule,
  and declare it as pre-existing work. Installing the packages by name from git has not been tested.

## What the code does

- **[`@ground-truth/physics`](packages/physics/README.md)** — pure TypeScript, no I/O. Mechanical work
  (positive, negative, net) and peak force from vertical position samples, with gravity and a constant
  device force as inputs: `F = m·(g_env + a) + F_device`. Simplified device models taken from the brief:
  ARED work and a peak force calibrated to one point quoted in the brief (an "up to" figure at the 600 lbf
  setting, from NTRS 20060028227); the CEVIS cycle-ergometer power correction (not claimed for FERGO, the
  ergometer on the ISS today); a static treadmill force with harness load. A daily load stimulus,
  `S = (Σ n·σ⁴)^¼` over n loading cycles at peak load σ, the factor of extra cycles needed at a lower peak,
  and a cumulative deficit against a baseline the caller supplies.
- **[`@ground-truth/capture`](packages/capture/README.md)** — pure TypeScript, no I/O. Turns a stream of
  wrist positions from a pose model into per-repetition work, peak force and range of motion, or refuses
  the recording with a stated reason (low frame rate, gaps, no complete repetition, and others).
- **[`@ground-truth/demo`](packages/demo/README.md)** — a single local web page: the same day of exercise
  under Earth, Moon, Mars and ISS gravity as two numbers (energy, and load against the same day recomputed
  on Earth), and a capture view that estimates the work and peak force of a lifting set from a camera or a
  video file (never run on a real person).

## What it does not do

- No health indicator other than exercise energy and load: no heart rate, HRV, sleep, circadian measure,
  blood pressure, SpO2, glucose, nutrition, radiation, CO2 or cognition.
- It never computes kilocalories; its only metabolic figure is a cross-check range in joules.
- It reads no astronaut data and no NASA dataset.
- It does not measure bone and does not predict bone loss.
- No stored sessions, accounts or server.

## What has not been validated

- **No real video.** The capture pipeline was checked only on synthetic sessions (seeded noise, ideal
  minimum-jerk motion). `VALIDATED_ON_REAL_VIDEO` is `false`
  ([`packages/capture/src/session.ts`](packages/capture/src/session.ts)), which caps every camera result at
  `MEDIUM` confidence. The real-video checks listed in the capture README are open.
- **No real person, no real device.** The pose model has never been run on a real person; the analysed
  path ran only with a substituted detector. No camera has been opened on any device, and phone frame timing
  is untested.
- **No force reference.** Peak force has never been compared with a force sensor. On synthetic 0.5 m lifts
  of about 1 s with white position noise of ±2 to ±5 mm and correct scale, the worst errors were about 1 %
  for work and range of motion and 3.4 % (±2 mm) to 9.4 % (±5 mm) for peak force. Fast lifts (0.4 s: work
  −8 %, peak −10.5 %), slow short movements (work down to −32 %), scale errors and departures from the
  capture protocol (up to +120 %) read worse, and real pose noise will be worse still.
- **One constant is still unchecked.** The stature scale uses an eye-to-ankle fraction of 0.897
  ([`packages/capture/src/scale.ts`](packages/capture/src/scale.ts)), not yet checked against its source.
- **Known limits of the model**, not yet fixed in the code (some were already stated in the package READMEs
  on 2026-10-09; a review on 2026-11-13 quantified them or added the rest):
  - The wrist stands in for the load. In a dumbbell curl the weight travels about 1.2–1.3 times as far as the
    wrist, so work and range read about 20 % low (peak force much less, since `m·g` dominates).
  - The ISS running decrement (Genc 2010) was measured as in-shoe force on earlier exercise devices (the
    TVIS treadmill and the iRED resistive device, with the CEVIS ergometer), not on today's T2 treadmill and
    ARED.
  - The ARED model holds the flywheel's effective mass constant across settings. The brief gives the
    inertial term only at the 600 lbf setting (the bar's maximum), while the NASA report it cites
    (NTRS 20060028227) describes the inertial load growing with the setting.
  - A constant device force is an ideal, lossless force: it leaves out ARED's flywheel inertia and eccentric
    loss.
  - Apart from the metabolic cross-check (a range in joules), results are point values; known errors are not
    yet reported as ranges.
- **The brief is out of date.** It was written from the one-paragraph challenge summary and was not
  re-read against the full statement (2026-10-28) or the judging and submission guides (2026-11-13). Where
  the code found its numbers wrong, the package READMEs say so:
  [physics](packages/physics/README.md#two-places-where-the-numbers-differ-from-the-briefs-prose) and
  [demo](packages/demo/README.md).

## Run the tests and the demo

```sh
npm install                              # once
npm test                                 # all three packages
npm run dev -w @ground-truth/demo        # http://localhost:5173
npm run dev:https -w @ground-truth/demo  # on a phone: HTTPS, self-signed certificate
```

## Third-party materials

| Material | Licence | Where |
|---|---|---|
| `@mediapipe/tasks-vision` 1.1.0 (JavaScript and WASM runtime) | Apache-2.0 | npm, pinned in `package-lock.json`; WASM copied from `node_modules` before every `dev`, `dev:https` and `build` npm script, not committed |
| MediaPipe Pose Landmarker lite model (BlazePose GHUM 3D, float16, v1) | Apache-2.0 ([model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf)) | committed unmodified at `packages/demo/public/models/pose_landmarker_lite.task`; SHA-256 checked by the same npm scripts; see its `NOTICE.md` |

As the model card asks, the model is cited as: V. Bazarevsky et al., "BlazePose: On-device Real-time Body
Pose tracking", CVPR Workshop on Computer Vision for Augmented and Virtual Reality, 2020 (arXiv:2006.10204);
and H. Xu et al., "GHUM & GHUML: Generative 3D Human Shape and Articulated Pose Models", CVPR 2020. The
model card also says the model is not for life-critical decisions. This project uses only the 2D vertical
position of one wrist.

Development tools (Vite, Vitest, TypeScript and their dependencies) are MIT, Apache-2.0, ISC, BSD-3-Clause
or MPL-2.0; only Vite's small build-time helpers (MIT) end up in the built page. The repository contains no
image, video or recorded pose of any person; all test data is synthetic.

## License

Apache License 2.0. See [`LICENSE`](LICENSE).
