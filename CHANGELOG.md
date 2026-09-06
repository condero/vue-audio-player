# Changelog

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
