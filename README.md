# Ground Truth

Load accounting for exercise under different gravities. Given a session's parameters, or a wrist
trajectory read from a camera, it computes **mechanical work in joules** and **peak force in newtons**
under Earth, Moon, Mars and ISS gravity, plus a daily skeletal load stimulus against an Earth baseline.
Every number is an estimate with a stated source; nothing here measures the body.

---

## Provenance — read this first

- **Written before the hackathon.** All 57 commits fall on three days: 2026-09-23 (the research brief),
  2026-10-09 (plans, the three packages, the demo script) and 2026-10-11 (review fixes and the merge of
  pull requests #1 to #3). Nothing was committed between 2026-10-11 and this README update on 2026-11-13.
- **Why.** It was written to prepare for the NASA Space Apps Challenge 2026 challenge
  [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/),
  after the challenge summary was published (2026-09-17) and before the hackathon (2026-11-14/15).
- **Who.** One person, working with an AI coding assistant (Claude, by Anthropic). 53 of the 57 commits
  carry the assistant's `Co-Authored-By` trailer; the other 4 are merge commits. The plans in
  [`docs/plans/`](docs/plans/) are written as instructions to the assistant. No second human reviewer
  appears in the history.
- **What exists from before the hackathon.** The research brief ([`docs/strategy.md`](docs/strategy.md)),
  a Portuguese summary of that research ([`docs/consolidacao-vocaid.md`](docs/consolidacao-vocaid.md)),
  three implementation plans, the three packages below, the demo page, and a demo script
  ([`docs/demo-script.md`](docs/demo-script.md)).
- **Commercial context.** The author also works on a commercial consumer-health product. The research brief
  informed it, and `docs/consolidacao-vocaid.md` is a memo written for it on 2026-10-09. The packages
  here depend on no code from that product.
- **Published as it was.** The repository was private until it was made public on 2026-11-13. The history
  is unchanged: no commit was rewritten, squashed or re-dated.
- **Earlier README text.** Until 2026-11-13 this file also held two draft team descriptions written on
  2026-09-23. They claimed things the code never did: that a cycle ergometer "burns real calories" (the code
  never outputs calories), and a list of vital signs (circadian drift, resting heart rate and HRV, blood
  pressure, SpO2, glucose, nutrition) that is not implemented. They were removed on 2026-11-13; the git
  history keeps them.
- **The hackathon entry is separate.** Anything built on 2026-11-14/15 lives in its own repository. If it
  uses `@ground-truth/physics` or `@ground-truth/capture`, it pins them to commit `db56a70` and declares
  them as pre-existing work.

## What the code does

- **[`@ground-truth/physics`](packages/physics/README.md)** — pure TypeScript, no I/O. Mechanical work
  (positive, negative, net) and peak force from vertical position samples, with gravity and a constant
  device force as inputs: `F = m·(g_env + a) + F_device`. Device models for the ISS exercise hardware
  (the ARED resistive device, the cycle ergometer, a treadmill with harness load), and a daily skeletal load stimulus compared with the same session at 1 g.
- **[`@ground-truth/capture`](packages/capture/README.md)** — pure TypeScript, no I/O. Turns a stream of
  wrist positions from a pose model into per-repetition work, peak force and range of motion, or refuses
  the recording with a stated reason (low frame rate, gaps, no complete repetition, and others).
- **[`@ground-truth/demo`](packages/demo/README.md)** — a single local web page: the same day of exercise
  under Earth, Moon, Mars and ISS gravity as two numbers (energy and load), and a capture view that measures
  a lifting set from a camera or a video file.

## What it does not do

- No health indicator other than exercise energy and load: no heart rate, HRV, sleep, circadian measure,
  blood pressure, SpO2, glucose, nutrition, radiation, CO2 or cognition.
- It reads no astronaut data and no NASA dataset.
- It does not measure bone and does not predict bone loss.
- No stored sessions, accounts or server.

## What has not been validated

- **No real video.** The capture pipeline was checked only on synthetic sessions (seeded noise, ideal
  minimum-jerk motion). `VALIDATED_ON_REAL_VIDEO` is `false`
  ([`packages/capture/src/session.ts`](packages/capture/src/session.ts)), which caps every camera result at
  `MEDIUM` confidence. The real-video checks listed in the capture README are open.
- **No real device.** The camera was never opened on a real phone.
- **One constant is still unchecked.** The stature scale uses an eye-to-ankle fraction of 0.897
  ([`packages/capture/src/scale.ts`](packages/capture/src/scale.ts)), not yet checked against its source.
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
| `@mediapipe/tasks-vision` 1.1.0 (JavaScript and WASM runtime) | Apache-2.0 | npm, pinned in `package-lock.json`; WASM copied from `node_modules` at build time, not committed |
| MediaPipe Pose Landmarker lite model (BlazePose GHUM 3D, float16, v1) | Apache-2.0 ([model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf)) | committed unmodified at `packages/demo/public/models/pose_landmarker_lite.task`, SHA-256 checked before every build; see its `NOTICE.md` |

The model card asks users to cite the BlazePose paper (CVPR Workshop on Computer Vision for AR/VR, 2020)
and the GHUM & GHUML paper (CVPR 2020), and says the model is not for life-critical decisions. This project
uses only the 2D vertical position of one wrist. Development tools (Vite, Vitest, TypeScript and their
dependencies) are MIT, Apache-2.0, ISC, BSD-3-Clause or MPL-2.0; none ships in the page. The repository
contains no image, video or recorded pose of any person; all test data is synthetic.

## License

Apache License 2.0. See [`LICENSE`](LICENSE).
