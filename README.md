# @condero/vue-audio-player

Vue 3 audio player with optional waveform visualization, repeat, speed control and A/B looping.

## Features

- Progressive playback through the native audio element
- Optional client-side waveform visualization via Web Audio API (no external dependencies)
- Repeat — loop the entire track
- Speed — slow down playback in 10% steps (1.0x down to 0.5x)
- A/B Loop — mark two positions within a track and loop that section
- Dark/Light Mode — supports Bootstrap 5.3 theme variables and `prefers-color-scheme`
- Responsive — desktop and mobile (touch-friendly)
- Queue-friendly — events and exposed `play()`/`pause()` for playlist-driven hosts, with a `compact` variant and per-control switches for embedding in small bars

## Installation

```bash
npm install @condero/vue-audio-player
```

## Usage

```vue
<script setup>
import { AudioPlayer } from '@condero/vue-audio-player'
import '@condero/vue-audio-player/style.css'
</script>

<template>
  <AudioPlayer src="/path/to/file.mp3" />
</template>
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `src` | String | yes | URL to the audio file |
| `autoplay` | Boolean | no | Starts playback after the initial audio load. Browser autoplay policy may require a manual tap. |
| `playWhenReady` | Boolean | no | Defaults to `false`. Play intent that survives src swaps: while `true`, every load starts playing on `ready` — the initial one and every swap (unlike `autoplay`, which covers the initial load only). Reactive: flipping it to `false` before the next `ready` cancels the auto-play. **Gesture safety:** set it to `true` from a user gesture (e.g. the click that starts the queue) or the browser may reject the play; a rejection is logged as a warning and the player stays paused — if you need the rejection itself (`NotAllowedError`), sequence `play()` from `@ready` instead. |
| `waveform` | Boolean | no | Defaults to `false`. When enabled, fetches and decodes the complete file in the background to generate a waveform. |
| `peaks` | Array | no | Precomputed waveform values from `0` to `1`. Providing peaks avoids the waveform fetch. |
| `variant` | String | no | `'full'` (default) or `'compact'`. Compact shrinks the waveform bar, buttons and padding for embedding in small player bars (~76px tall with `times` hidden). Colors and Bootstrap 5.3 theming are unchanged. |
| `controls` | Object | no | Per-control visibility switches, all `true` by default: `{ play, volume, abLoop, repeat, times }` (`times` is the current-time/duration row). A partial object only hides what it names `false`, e.g. `:controls="{ abLoop: false }"`. |
| `speeds` | Array | no | Playback-rate presets for the speed select, treated as a set: rendered deduped, filtered to finite values > 0 and sorted ascending — the prop is a set, the component owns the order. Defaults to `0.5`–`1.2` in 10% steps plus the fine steps 1.05/1.1. If the active rate is no longer offered after a prop change, it snaps to the nearest preset. For choir practice a fine-grained ladder up to 2.0 works well, e.g. `:speeds="[0.5, 0.75, 0.95, 1, 1.05, 1.2, 1.3, 1.5, 1.75, 2]"`. |
| `preservesPitch` | Boolean | no | Defaults to `true`: the element stretches time when the rate differs from 1, so playback stays in tune (choir training at 0.6x keeps the pitch). `false` gives the cassette-style speed pitch shift. Applied to the element's standard `preservesPitch` and the legacy `webkitPreservesPitch`, and re-asserted after every load. |

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `ready` | `{ src }` | The current source can play: the first `canplay` after each (re)load. Sequence `play()` here when swapping `src` programmatically (mobile Safari requires it). A stall recovery does not re-fire it. The `src` echo lets queue hosts drop stale events after rapid swaps. |
| `ended` | `{ src }` | The current source finished naturally. Not emitted in repeat mode — the track loops silently. |
| `error` | `MediaError`, `{ src }` | The audio element failed. First payload is the native `MediaError` (code 4 = unsupported/forbidden source, 2 = network failure) or the raw error event when the element reports none — useful for detecting expired signed URLs. The second payload echoes the `src` that failed. |
| `playing` | — | Playback started — mirror of the element's `play` event, whether from the play button or a programmatic `play()`. |
| `paused` | — | Playback paused — mirror of the element's `pause` event. |
| `time` | `{ currentTime, duration, progress, rate }` | Emitted on the element's `timeupdate` (and when metadata arrive or a seek settles). `duration` is `null` while unknown (metadata pending or a live/rangeless stream); `progress` is the `0..1` ratio, `0` while `duration` is unknown; `rate` is the active playback rate. Feed it to a rate-aware `navigator.mediaSession.setPositionState()` so the lock-screen scrub position does not drift when the rate ≠ 1. |

Payload note: events that were payload-less may have gained payloads in 2.2.0 (`ready`/`ended` now carry `{ src }`, `error` gained a second argument); existing handlers that ignore arguments keep working.

## Exposed methods

```vue
<script setup>
import { ref } from 'vue'

const player = ref(null)
</script>

<template>
  <AudioPlayer
    ref="player"
    :src="currentSrc"
    @ended="advanceToNextTrack"
    @error="refetchSignedUrl"
    @ready="player.play()"
  />
</template>
```

- `play()` — starts playback and returns the audio element's `play()` promise unchanged, so an autoplay-policy rejection (`NotAllowedError`) reaches the caller.
- `pause()` — pauses playback.
- `seekTo(seconds)` — seeks to an absolute position. Clamped to `[0, duration]`; queued and applied after metadata arrive if they are not loaded yet (like timeline seeks, it never reloads the element).
- `seekBy(delta)` — relative seek for skip controls (e.g. MediaSession `seekforward`/`seekbackward` ±15s), clamped the same way. A no-op while duration is unknown, so hosts never track `currentTime` themselves.
- `position` — current playback position in seconds (read-only).
- `duration` — duration in seconds, or `null` while unknown (metadata pending or a live/rangeless stream) — same semantics as the `time` payload.
- `playbackRate` — the active playback rate (read-only; change it via the `speeds` select).

The raw audio element is intentionally not exposed; position, volume and rate stay owned by the component.

## Queue hosts

A playlist-driven host swaps `src` per track and keeps one long-lived player instance. With `playWhenReady`, the ready→play sequencing moves into the component:

```vue
<script setup>
import { ref } from 'vue'
import { AudioPlayer } from '@condero/vue-audio-player'
import '@condero/vue-audio-player/style.css'

const player = ref(null)
const currentSrc = ref(null)
const playWhenReady = ref(false)
const queue = [/* track urls */]

function startQueue() {
  // The first `true` must originate from a user gesture (autoplay policy).
  playWhenReady.value = true
  currentSrc.value = queue[0]
}

function advance({ src }) {
  if (src !== currentSrc.value) return // stale event from a rapid swap
  currentSrc.value = queue[queue.indexOf(src) + 1]
}
</script>

<template>
  <AudioPlayer
    ref="player"
    :src="currentSrc"
    :play-when-ready="playWhenReady"
    variant="compact"
    :controls="{ times: false, abLoop: false, repeat: false }"
    @ready="onReady"
    @ended="advance"
    @error="refetchSignedUrl"
    @time="onTime"
  />
</template>
```

- `playWhenReady` plays every load on `ready`, swaps included; flipping it to `false` before the next `ready` cancels the auto-play. A policy rejection is logged and the player stays paused — sequence `play()` from `@ready` instead if you need to handle `NotAllowedError` yourself (both patterns can be combined; the extra `play()` on a playing element is a harmless no-op).
- The `src` echo in `ready`/`ended`/`error` payloads lets you drop stale events after rapid swaps (see `advance` above).
- The `time` event feeds Media Session so the lock-screen scrub position tracks the queue:

```js
function onTime({ currentTime, duration, rate }) {
  if ('mediaSession' in navigator && duration !== null) {
    navigator.mediaSession.setPositionState({
      duration,
      position: Math.min(currentTime, duration),
      playbackRate: rate,
    })
  }
}
```

- MediaSession skip actions map to the exposed `seekBy()`: `navigator.mediaSession.setActionHandler('seekforward', () => player.value.seekBy(15))` and `setActionHandler('seekbackward', () => player.value.seekBy(-15))`.

`variant="compact"` plus hiding `times`, `abLoop` and `repeat` yields a bar that fits a ~76px container (waveform 28px, 32px play button, 6px padding); `controls` hides anything else the host drives itself (e.g. `play: false` when the host renders its own button and drives the exposed `play()`/`pause()`).

## Swapping sources

Changing the `src` prop loads the new source paused at `0:00` on the same audio element: position, buffered range, duration and A/B loop points reset, while volume, playback rate and repeat survive. `autoplay` applies to the initial load only — after a swap, either wait for `ready` and call the exposed `play()`, or set `playWhenReady` and let the component do the sequencing for every load.

## Player states

The composable distinguishes initial loading from later playback interruptions:

- `isLoading` is true only from `load()` until the first `canplay` event.
- `isBuffering` is true when an already-loaded track is waiting for more data.
- `isSeeking` is true while the media element is moving to a new position.
- `isPlaying` follows the media element's play and pause events.

Controls are disabled only during `isLoading`; buffering and seeking show a small non-blocking indicator.

## Streaming and seeking

By default, the player does not fetch or decode the audio file itself. The native audio element handles playback progressively, so playback can begin as soon as the browser has enough data. This works with any plain HTTP audio endpoint; endpoints that support HTTP Range requests (`206 Partial Content`) provide better seeking and buffering behavior.

The timeline seeks the existing audio element without replacing its `src` or calling `load()`. If duration metadata is not available yet, ratio-based timeline seeks are ignored; explicit time seeks are queued and applied after metadata arrives. Live or rangeless streams with an infinite duration do not support ratio-based seeking.

## Breaking changes in 2.0.0

Waveform decoding is no longer enabled by default. Set `waveform` to opt into the client-side full-file decode, or pass backend-precomputed `peaks`. The new `autoplay` prop replaces DOM-based play-button workarounds.

## Development

```bash
npm install
npm run dev      # Demo with theme toggle at localhost:5173
npm run build    # Build library (dist/)
npm test         # Run the unit tests
```

## Local usage without publishing

```bash
npm install ../path/to/vue-audio-player
```

After making changes: run `npm run build` in the player project, then reinstall in the target project.
