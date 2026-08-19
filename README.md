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
| `waveform` | Boolean | no | Defaults to `false`. When enabled, fetches and decodes the complete file in the background to generate a waveform. |
| `peaks` | Array | no | Precomputed waveform values from `0` to `1`. Providing peaks avoids the waveform fetch. |

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
