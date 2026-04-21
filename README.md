# @condero/vue-audio-player

Vue 3 audio player with waveform visualization, repeat, speed control and A/B looping.

## Features

- Waveform visualization via Web Audio API (no external dependencies)
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

## Development

```bash
npm install
npm run dev      # Demo with theme toggle at localhost:5173
npm run build    # Build library (dist/)
```

## Local usage without publishing

```bash
npm install ../path/to/vue-audio-player
```

After making changes: run `npm run build` in the player project, then reinstall in the target project.
