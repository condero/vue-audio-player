<script setup>
import { ref, watch } from 'vue'
import AudioPlayer from './components/AudioPlayer.vue'

const dark = ref(true)
watch(dark, (v) => {
  document.documentElement.setAttribute('data-bs-theme', v ? 'dark' : 'light')
}, { immediate: true })

const track = '/Abendsterne - The Colours Of Your Life.mp3'

// Pretend these were precomputed by a backend (values 0..1): rendered as-is,
// the player never fetches the file for a waveform.
const demoPeaks = Array.from({ length: 120 }, (_, i) =>
  0.3 + 0.6 * Math.abs(Math.sin(i / 9) * Math.cos(i / 3.5)),
)
</script>

<template>
  <div style="display:flex;flex-direction:column;align-items:center;gap:12px;width:100%">
    <button
      @click="dark = !dark"
      style="background:none;border:1px solid #555;color:inherit;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px"
    >
      {{ dark ? '☀ Light Mode' : '● Dark Mode' }}
    </button>

    <label style="font-size:13px;color:#888">
      default — streams via the audio element, slim progress bar, nothing fetched for a waveform
    </label>
    <AudioPlayer :src="track" />

    <label style="font-size:13px;color:#888">
      autoplay + precomputed peaks — still no waveform fetch
    </label>
    <AudioPlayer :src="track" autoplay :peaks="demoPeaks" />

    <label style="font-size:13px;color:#888">
      waveform — opts into the client-side full-file decode (non-blocking)
    </label>
    <AudioPlayer :src="track" waveform />
  </div>
</template>
