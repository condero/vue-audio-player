<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useAudioPlayer } from '../composables/useAudioPlayer'

const props = defineProps({
  src: { type: String, required: true },
})

const speeds = [1.2, 1.1, 1.05, 1.0, 0.9, 0.8, 0.7, 0.6, 0.5]

const {
  isLoading,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  isRepeat,
  volume,
  loopA,
  loopB,
  waveformPeaks,
  load,
  togglePlay,
  seekByRatio,
  setPlaybackRate,
  setVolume,
  toggleRepeat,
  setLoopA,
  setLoopB,
  clearLoop,
} = useAudioPlayer()

const waveformCanvas = ref(null)
const progressRef = ref(null)
const isDragging = ref(false)

const formattedTime = computed(() => formatTime(currentTime.value))
const formattedDuration = computed(() => formatTime(duration.value))
const progressRatio = computed(() => (duration.value ? currentTime.value / duration.value : 0))
const loopARatio = computed(() => (loopA.value != null && duration.value ? loopA.value / duration.value : null))
const loopBRatio = computed(() => (loopB.value != null && duration.value ? loopB.value / duration.value : null))
const hasABLoop = computed(() => loopA.value !== null && loopB.value !== null)

load(props.src)

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function getProgressRatio(e) {
  const rect = progressRef.value.getBoundingClientRect()
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
}

function onProgressDown(e) {
  isDragging.value = true
  seekByRatio(getProgressRatio(e))
}

function onProgressMove(e) {
  if (!isDragging.value) return
  e.preventDefault()
  seekByRatio(getProgressRatio(e))
}

function onProgressUp() {
  isDragging.value = false
}

function themeColor(varName, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback
}

function drawWaveform() {
  const canvas = waveformCanvas.value
  const peaks = waveformPeaks.value
  if (!canvas || !peaks || !peaks.length) return

  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  const w = rect.width
  const h = rect.height
  const mid = h / 2
  const barW = w / peaks.length
  const progress = progressRatio.value
  const aRatio = loopARatio.value
  const bRatio = loopBRatio.value

  const accent = themeColor('--bs-primary', '#6366f1')
  const muted = themeColor('--ap-wave-muted', themeColor('--bs-secondary-bg', '#3a3a5a'))
  const markerA = themeColor('--ap-marker-a', '#f43f5e')
  const markerB = themeColor('--ap-marker-b', '#22c55e')

  ctx.clearRect(0, 0, w, h)

  for (let i = 0; i < peaks.length; i++) {
    const x = i * barW
    const ratio = i / peaks.length
    const barH = Math.max(1, peaks[i] * mid * 0.9)

    if (aRatio !== null && bRatio !== null && ratio >= aRatio && ratio <= bRatio) {
      ctx.fillStyle = accent
    } else if (ratio <= progress) {
      ctx.fillStyle = accent
    } else {
      ctx.fillStyle = muted
    }

    ctx.fillRect(x, mid - barH, Math.max(1, barW - 0.5), barH * 2)
  }

  if (aRatio !== null) {
    const x = aRatio * w
    ctx.fillStyle = markerA
    ctx.fillRect(x - 1, 0, 2, h)
  }

  if (bRatio !== null) {
    const x = bRatio * w
    ctx.fillStyle = markerB
    ctx.fillRect(x - 1, 0, 2, h)
  }
}

watch([progressRatio, waveformPeaks, loopARatio, loopBRatio], drawWaveform)
onMounted(drawWaveform)
</script>

<template>
  <div class="player">
    <div class="row-top">
      <span class="time">{{ formattedTime }}</span>
      <span class="time">{{ formattedDuration }}</span>
    </div>

    <div
      ref="progressRef"
      class="waveform-bar"
      :class="{ disabled: isLoading }"
      @mousedown="!isLoading && onProgressDown($event)"
      @mousemove="onProgressMove"
      @mouseup="onProgressUp"
      @mouseleave="onProgressUp"
      @touchstart.prevent="!isLoading && onProgressDown($event)"
      @touchmove.prevent="onProgressMove"
      @touchend="onProgressUp"
    >
      <canvas ref="waveformCanvas" class="waveform-canvas" />
      <div class="fallback-progress" v-if="!waveformPeaks">
        <div class="fallback-fill" :style="{ width: progressRatio * 100 + '%' }" />
      </div>
      <div class="loading-overlay" v-if="isLoading">
        <div class="spinner" />
      </div>
    </div>

    <div class="row-controls">
      <button class="btn-icon" :class="{ active: isRepeat }" :disabled="isLoading" @click="toggleRepeat" title="Repeat">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      </button>

      <button
        class="btn-icon"
        :class="{ active: loopA !== null }"
        :disabled="isLoading"
        @click="setLoopA"
        :title="loopA !== null ? 'A: ' + formatTime(loopA) : 'Set A'"
      >A</button>

      <button
        class="btn-icon"
        :class="{ active: loopB !== null }"
        :disabled="isLoading"
        @click="setLoopB"
        :title="loopB !== null ? 'B: ' + formatTime(loopB) : 'Set B'"
      >B</button>

      <button v-if="hasABLoop" class="btn-icon" :disabled="isLoading" @click="clearLoop" title="Clear loop">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <button class="btn-play" :disabled="isLoading" @click="togglePlay">
        <svg v-if="!isPlaying" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
        </svg>
      </button>

      <select class="speed-select" :disabled="isLoading" :value="playbackRate" @change="setPlaybackRate(parseFloat($event.target.value))">
        <option v-for="s in speeds" :key="s" :value="s">{{ s }}x</option>
      </select>

      <div class="volume-group">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" v-if="volume > 0" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" v-if="volume > 0.5" />
        </svg>
        <input type="range" min="0" max="1" step="0.01" :value="volume" @input="setVolume(parseFloat($event.target.value))" class="volume-slider" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Light defaults */
.player {
  --ap-bg: var(--bs-tertiary-bg, #f8f9fa);
  --ap-surface: var(--bs-secondary-bg, #e9ecef);
  --ap-border: var(--bs-border-color, #dee2e6);
  --ap-text: var(--bs-body-color, #212529);
  --ap-muted: var(--bs-secondary-color, #6c757d);
  --ap-accent: var(--bs-primary, #0d6efd);
  --ap-accent-hover: var(--bs-primary-bg-subtle, #3d8bfd);
  --ap-thumb: var(--bs-emphasis-color, #212529);
  --ap-wave-muted: #ced4da;
  --ap-shadow: var(--bs-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.08));
}

/* Dark: system preference */
@media (prefers-color-scheme: dark) {
  .player {
    --ap-bg: var(--bs-tertiary-bg, #1a1a2e);
    --ap-surface: var(--bs-secondary-bg, #2a2a4a);
    --ap-border: var(--bs-border-color, #3a3a5a);
    --ap-text: var(--bs-body-color, #e0e0e0);
    --ap-muted: var(--bs-secondary-color, #8888aa);
    --ap-accent: var(--bs-primary, #6366f1);
    --ap-accent-hover: var(--bs-primary-bg-subtle, #818cf8);
    --ap-thumb: var(--bs-emphasis-color, #fff);
    --ap-wave-muted: #3a3a5a;
    --ap-shadow: var(--bs-box-shadow, 0 8px 32px rgba(0, 0, 0, 0.4));
  }
}

/* Dark: Bootstrap explicit */
:root[data-bs-theme="dark"] .player,
[data-bs-theme="dark"] .player {
  --ap-bg: var(--bs-tertiary-bg, #1a1a2e);
  --ap-surface: var(--bs-secondary-bg, #2a2a4a);
  --ap-border: var(--bs-border-color, #3a3a5a);
  --ap-text: var(--bs-body-color, #e0e0e0);
  --ap-muted: var(--bs-secondary-color, #8888aa);
  --ap-accent: var(--bs-primary, #6366f1);
  --ap-accent-hover: var(--bs-primary-bg-subtle, #818cf8);
  --ap-thumb: var(--bs-emphasis-color, #fff);
  --ap-wave-muted: #3a3a5a;
  --ap-shadow: var(--bs-box-shadow, 0 8px 32px rgba(0, 0, 0, 0.4));
}

/* Light: Bootstrap explicit (overrides system dark) */
:root[data-bs-theme="light"] .player,
[data-bs-theme="light"] .player {
  --ap-bg: var(--bs-tertiary-bg, #f8f9fa);
  --ap-surface: var(--bs-secondary-bg, #e9ecef);
  --ap-border: var(--bs-border-color, #dee2e6);
  --ap-text: var(--bs-body-color, #212529);
  --ap-muted: var(--bs-secondary-color, #6c757d);
  --ap-accent: var(--bs-primary, #0d6efd);
  --ap-accent-hover: var(--bs-primary-bg-subtle, #3d8bfd);
  --ap-thumb: var(--bs-emphasis-color, #212529);
  --ap-wave-muted: #ced4da;
  --ap-shadow: var(--bs-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.08));
}

.player {
  background: var(--ap-bg);
  border: 1px solid var(--ap-border);
  border-radius: 12px;
  padding: 12px 16px;
  width: 100%;
  max-width: 800px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: var(--ap-shadow);
}

.row-top {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--ap-muted);
  font-variant-numeric: tabular-nums;
}

/* Waveform / progress */
.waveform-bar {
  position: relative;
  height: 48px;
  cursor: pointer;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  border-radius: 6px;
  overflow: hidden;
}

.waveform-bar.disabled {
  cursor: not-allowed;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--ap-bg) 60%, transparent);
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2.5px solid var(--ap-border);
  border-top-color: var(--ap-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.waveform-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.fallback-progress {
  width: 100%;
  height: 100%;
  background: var(--ap-surface);
  border-radius: 6px;
}

.fallback-fill {
  height: 100%;
  background: var(--ap-accent);
  border-radius: 6px;
  transition: width 0.05s linear;
}

/* Controls row */
.row-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-icon {
  background: none;
  border: 1px solid transparent;
  color: var(--ap-muted);
  cursor: pointer;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
  transition: all 0.15s;
  flex-shrink: 0;
}

.btn-icon:hover:not(:disabled) {
  color: var(--ap-text);
  background: var(--ap-surface);
}

.btn-icon.active {
  color: var(--ap-accent);
  border-color: var(--ap-accent);
}

.btn-icon:disabled,
.btn-play:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.btn-play {
  background: var(--ap-accent);
  border: none;
  color: var(--ap-thumb);
  cursor: pointer;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.btn-play:hover:not(:disabled) {
  background: var(--ap-accent-hover);
}

.btn-play:active {
  transform: scale(0.93);
}

.speed-select {
  background: var(--ap-surface);
  border: 1px solid var(--ap-border);
  color: var(--ap-text);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  height: 32px;
  cursor: pointer;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.speed-select:focus {
  outline: none;
  border-color: var(--ap-accent);
}

.speed-select:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.volume-group {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--ap-muted);
  margin-left: auto;
}

.volume-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 70px;
  height: 3px;
  background: var(--ap-surface);
  border-radius: 2px;
  outline: none;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--ap-thumb);
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--ap-thumb);
  cursor: pointer;
  border: none;
}
</style>
