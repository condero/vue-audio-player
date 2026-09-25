# Changelog

## 2.2.0 — 2026-09-25

Queue-host support: position/duration exposure, a play-intent prop that survives src swaps, and supported compact-bar embedding. No breaking changes — payload-less events may carry payloads now, emit names are unchanged.

### Added

- `time` event on `<AudioPlayer>`: emitted on the element's `timeupdate` (and when metadata arrive or a seek settle) with `{ currentTime, duration, progress, rate }`. `duration` is `null` while unknown (metadata pending or a live/rangeless stream); `progress` is the `0..1` ratio, `0` while duration is unknown; `rate` carries the active playback rate for a rate-aware `navigator.mediaSession.setPositionState()`.
- Exposed via template ref: `seekTo(seconds)` (clamped, queued like timeline seeks, never reloads), `seekBy(delta)` (relative skip, clamped the same way, no-op while duration is unknown — made for MediaSession `seekforward`/`seekbackward`) and read-only `position`/`duration`/`playbackRate` getters (`duration` is `null` while unknown).
- `playWhenReady` prop (default `false`): play intent that survives src swaps — while `true`, every load plays on `ready`, the initial one and every swap (unlike `autoplay`, which stays initial-load-only). Reactive; a `false` flip before the next `ready` cancels the auto-play. Set the first `true` from a user gesture; a policy rejection is logged as a warning and the player stays paused (sequence `play()` from `ready` to handle the rejection yourself).
- `variant` prop: `'full'` (default) or `'compact'`. Compact shrinks the waveform bar, buttons and padding for small player bars (~76px tall with `times` hidden); colors and Bootstrap 5.3 theming are unchanged.
- `controls` prop: per-control visibility, all `true` by default — `{ play, volume, abLoop, repeat, times }`. Partial objects only hide what they name `false`.
- `speeds` prop: playback-rate presets for the speed select, treated as a set — rendered deduped, filtered to finite values > 0 and sorted ascending. Defaults to the standard `0.5`–`1.2` ladder; when the active rate is no longer offered after a prop change, it snaps to the nearest preset.
- `preservesPitch` prop (default `true`): keeps pitch constant when the rate differs from 1 — the element stretches time (choir training at 0.6x stays in tune); `false` gives the cassette-style speed pitch. Applied to the standard `preservesPitch` and the legacy `webkitPreservesPitch` element properties, re-asserted after every load. `useAudioPlayer` exposes `setPreservesPitch()` accordingly.
- `src` echo in event payloads: `ready`/`ended` now emit `{ src }`, `error` gained a second `{ src }` argument, so queue hosts can drop stale events after rapid src swaps. Handlers that ignore arguments keep working.
- `useAudioPlayer` accepts an optional `onTime` hook and now passes the current src to `onReady`, `onEnded` and `onError`.

## 2.1.0 — 2026-09-06

Queue-consumer hooks: the player can now drive an external playlist/queue — the host swaps `src` per track and reacts to events. No UI changes.

### Added

- Events on `<AudioPlayer>`:
  - `ready` — the current source can play: the first `canplay` after each (re)load. Sequence `play()` here when swapping `src` (required on mobile Safari). Stall-recovery canplays do not re-fire it.
  - `ended` — the current source finished naturally. Not emitted in repeat mode (the track loops silently).
  - `error` — payload is the native `MediaError` (code 4 = unsupported/forbidden source, 2 = network failure), or the raw error event when the element reports none. Use it to detect expired signed URLs.
  - `playing` / `paused` — mirror the element's `play`/`pause` events, whichever control triggered them.
- Exposed methods via template ref: `play()` returns the audio element's `play()` promise unchanged, so an autoplay-policy rejection (`NotAllowedError`) reaches the caller; `pause()` pauses. The raw element stays private.
- `useAudioPlayer` accepts optional callbacks: `onEnded`, `onError`, `onPlaying`, `onPaused`, `onReady`.

### Changed

- Changing the `src` prop loads the new source paused at `0:00` on the same audio element and never autoplays: position, buffered range, duration and A/B loop points reset; volume, playback rate and repeat survive. `autoplay` now applies to the initial load only.
- The composable's `error` ref holds the element's `MediaError` (or the raw error event) instead of a generic `Error('Audio load error')`.

## 2.0.0 — 2026-08-19

Stream playback and preserve seek position (#1). Playback starts before the full file is downloaded, waveform decoding never blocks playback, and seeking updates the existing element without restarting at zero. Waveform decoding is opt-in via the `waveform` prop (or pass `peaks`); the new `autoplay` prop replaces DOM-based play-button workarounds.

## 1.0.3 — 2026-04-21

Show the version number on player hover.

## 1.0.2 — 2026-04-21

Add playback speeds 1.05x, 1.1x and 1.2x.

## 1.0.1 — 2026-04-21

Exclude public assets from the library build.
