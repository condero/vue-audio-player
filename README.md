# @condero/vue-audio-player

Vue 3 Audio Player mit Waveform-Darstellung, Repeat, Geschwindigkeitskontrolle und A/B-Looping.

## Features

- Waveform-Visualisierung per Web Audio API (keine externen Dependencies)
- Repeat — ganzen Song in Schleife abspielen
- Geschwindigkeit — verlangsamt abspielen in 10%-Schritten (1.0x bis 0.5x)
- A/B Loop — zwei Positionen markieren und als Schleife abspielen
- Dark/Light Mode — unterstützt Bootstrap 5.3 Theme-Variablen und `prefers-color-scheme`
- Responsive — Desktop und Mobil (Touch-freundlich)

## Installation

```bash
npm install @condero/vue-audio-player
```

## Nutzung

```vue
<script setup>
import { AudioPlayer } from '@condero/vue-audio-player'
import '@condero/vue-audio-player/style.css'
</script>

<template>
  <AudioPlayer src="/pfad/zur/datei.mp3" />
</template>
```

## Props

| Prop | Typ | Pflicht | Beschreibung |
|------|-----|---------|-------------|
| `src` | String | ja | URL zur Audiodatei |

## Entwicklung

```bash
npm install
npm run dev      # Demo mit Theme-Toggle unter localhost:5173
npm run build    # Library bauen (dist/)
```

## Einbindung ohne npm-Veröffentlichung

```bash
npm install ../pfad/zum/vue-audio-player
```

Nach Änderungen am Player: `npm run build` im Player-Projekt, dann im Zielprojekt erneut `npm install` ausführen.
