# Ground Truth

Health monitoring for where there is no ground.

**NASA Space Apps Challenge 2026** — [Create Health Monitoring Software for
Astronauts on Space
Missions](https://www.spaceappschallenge.org/2026/challenges/create-health-monitoring-software-for-astronauts-on-space-missions/)

---

## Team description — short (for the registration field)

> Every fitness tracker confuses two different things: energy spent and load
> applied. On Earth gravity keeps them in step; in orbit it doesn't — 45 minutes
> on the ISS cycle ergometer burns real calories and loads the skeleton
> essentially not at all. We build crew-facing health monitoring that measures
> both currencies separately, with gravity and device-applied force as
> first-class properties of every session.

## Team description — fuller (if the field allows it)

> Every fitness tracker confuses two different things: energy spent and load
> applied. On Earth gravity keeps them in step; in orbit it doesn't — 45 minutes
> on the ISS cycle ergometer burns real calories and loads the skeleton
> essentially not at all. And bone is the one system a crew cannot measure in
> flight, so the only way to track it is to model its input.
>
> We build crew-facing health monitoring that treats gravity and device-applied
> force as first-class properties of every recorded session, and reports two
> separate currencies: mechanical work in joules, and a cumulative skeletal load
> stimulus against the Earth-equivalent baseline. Around that sits what the crew
> must read for themselves — circadian drift, overnight resting heart rate and
> HRV, blood pressure, SpO2, glucose, and nutrition down to the micronutrients
> bone depends on — every number labelled with the instrument that produced it.

---

## Run the demo

```sh
npm install                              # once
npm run dev -w @ground-truth/demo        # http://localhost:5173
npm run dev:https -w @ground-truth/demo  # on a phone: HTTPS, self-signed certificate
```

A single page with two views: the same day of exercise under Earth, Moon, Mars and ISS gravity, as two
separate numbers (energy and load); and a capture view that measures a lifting set from a camera or a video
file. See [`packages/demo/README.md`](packages/demo/README.md), including what has not been verified: the camera
on a real phone and a real lifting video have not been tried.

## The strategy

[`docs/strategy.md`](docs/strategy.md) — the verified brief this build executes
from: the thesis, the physics, what transfers from the existing wearable stack,
what breaks, what data exists, and the demo.

## License

Apache License 2.0. See [`LICENSE`](LICENSE).
