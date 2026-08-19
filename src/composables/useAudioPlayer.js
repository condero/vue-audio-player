import { ref, readonly, onUnmounted, watch } from 'vue'

export function useAudioPlayer() {
  const audio = new Audio()

  // The AudioContext is only needed to decode waveforms — create it lazily so
  // the default (no waveform) path never touches it.
  let audioCtx = null
  let decodeAbort = null
  let providedPeaks = null
  let currentSrc = null
  let metaLoaded = false
  let pendingSeek = null

  const isLoading = ref(true) // initial load only: load() -> first canplay
  const isBuffering = ref(false)
  const isSeeking = ref(false)
  const isPlaying = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const buffered = ref(0)
  const playbackRate = ref(1.0)
  const isRepeat = ref(false)
  const volume = ref(1.0)
  const loopA = ref(null)
  const loopB = ref(null)
  const waveformPeaks = ref(null)
  const error = ref(null)

  let rafId = null

  function startRafLoop() {
    stopRafLoop()
    function tick() {
      if (!isPlaying.value) return
      // Never fight an in-flight seek: while audio.seeking the element may
      // still report the pre-seek position.
      if (!audio.seeking) {
        currentTime.value = audio.currentTime
      }

      const t = audio.currentTime
      if (loopA.value !== null && loopB.value !== null) {
        if (t >= loopB.value) {
          audio.currentTime = loopA.value
          currentTime.value = loopA.value
        }
      }

      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  }

  function stopRafLoop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  audio.addEventListener('loadedmetadata', () => {
    duration.value = audio.duration
    metaLoaded = true
    if (pendingSeek !== null) {
      const time = pendingSeek
      pendingSeek = null
      applySeek(time)
    }
  })

  audio.addEventListener('canplay', () => {
    isLoading.value = false
    isBuffering.value = false
  })

  audio.addEventListener('waiting', () => {
    isBuffering.value = true
  })

  audio.addEventListener('playing', () => {
    isBuffering.value = false
    isSeeking.value = false
  })

  audio.addEventListener('seeking', () => {
    isSeeking.value = true
  })

  audio.addEventListener('seeked', () => {
    isSeeking.value = false
    if (!isPlaying.value) {
      currentTime.value = audio.currentTime
    }
  })

  audio.addEventListener('emptied', () => {
    isLoading.value = true
    isBuffering.value = false
    currentTime.value = 0
  })

  audio.addEventListener('timeupdate', () => {
    if (!isPlaying.value) {
      currentTime.value = audio.currentTime
    }
  })

  audio.addEventListener('progress', () => {
    if (audio.buffered.length > 0) {
      buffered.value = audio.buffered.end(audio.buffered.length - 1)
    }
  })

  audio.addEventListener('ended', () => {
    if (isRepeat.value) {
      audio.currentTime = 0
      play()
    } else {
      isPlaying.value = false
      stopRafLoop()
      currentTime.value = 0
    }
  })

  audio.addEventListener('play', () => {
    isPlaying.value = true
    startRafLoop()
  })

  audio.addEventListener('pause', () => {
    isPlaying.value = false
    isBuffering.value = false
    stopRafLoop()
  })

  audio.addEventListener('error', () => {
    error.value = new Error('Audio load error')
    isLoading.value = false
    isBuffering.value = false
  })

  watch(playbackRate, (rate) => {
    audio.playbackRate = rate
  })

  watch(volume, (v) => {
    audio.volume = v
  })

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    }
    return audioCtx
  }

  function normalizePeaks(input) {
    if (!input) return null
    const values = Array.isArray(input) ? input : Array.from(input)
    const peaks = new Float32Array(values.length)
    for (let i = 0; i < values.length; i++) {
      const v = Number(values[i])
      peaks[i] = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0
    }
    return peaks
  }

  function computePeaks(buffer, numSamples) {
    const channelData = buffer.getChannelData(0)
    const step = Math.floor(channelData.length / numSamples)
    const peaks = new Float32Array(numSamples)
    for (let i = 0; i < numSamples; i++) {
      let max = 0
      const start = i * step
      const end = Math.min(start + step, channelData.length)
      for (let j = start; j < end; j++) {
        const abs = Math.abs(channelData[j])
        if (abs > max) max = abs
      }
      peaks[i] = max
    }
    return peaks
  }

  // Opt-in only: downloads the whole file to decode it. Never blocks playback
  // (isLoading is not tied to it) and is aborted when the source changes.
  async function decodeWaveform(src, numSamples = 800) {
    decodeAbort?.abort()
    const controller = new AbortController()
    decodeAbort = controller
    try {
      const response = await fetch(src, { signal: controller.signal })
      const arrayBuffer = await response.arrayBuffer()
      if (controller.signal.aborted) return
      const buffer = await getAudioContext().decodeAudioData(arrayBuffer)
      if (controller.signal.aborted) return // a newer load won — drop it
      waveformPeaks.value = computePeaks(buffer, numSamples)
    } catch {
      if (!controller.signal.aborted) {
        waveformPeaks.value = null
      }
    }
  }

  function setPeaks(peaks) {
    providedPeaks = peaks ?? null
    // A parent may provide backend peaks after an opt-in decode has already
    // started. Those explicit values take precedence over stale decode work.
    if (providedPeaks) decodeAbort?.abort()
    waveformPeaks.value = normalizePeaks(providedPeaks)
  }

  function generateWaveform() {
    if (currentSrc && !providedPeaks) decodeWaveform(currentSrc)
  }

  function load(src, { waveform = false } = {}) {
    decodeAbort?.abort()
    audio.pause()
    metaLoaded = false
    pendingSeek = null
    audio.src = src
    audio.load()
    currentSrc = src
    isPlaying.value = false
    isLoading.value = true
    isBuffering.value = false
    isSeeking.value = false
    currentTime.value = 0
    duration.value = 0
    buffered.value = 0
    loopA.value = null
    loopB.value = null
    error.value = null
    waveformPeaks.value = normalizePeaks(providedPeaks)
    if (waveform && !providedPeaks) {
      decodeWaveform(src)
    }
  }

  function play() {
    const p = audio.play()
    if (p && typeof p.catch === 'function') {
      p.catch(() => {}) // autoplay-policy rejection: user taps play instead
    }
    return p
  }

  function pause() {
    audio.pause()
  }

  function togglePlay() {
    if (isPlaying.value) {
      pause()
    } else {
      play()
    }
  }

  function clampTime(time) {
    const t = Number(time)
    if (!Number.isFinite(t)) return null
    let clamped = Math.max(0, t)
    const d = duration.value
    if (Number.isFinite(d) && d > 0) {
      clamped = Math.min(clamped, d)
    }
    return clamped
  }

  function applySeek(time) {
    const t = clampTime(time)
    if (t === null) return
    try {
      audio.currentTime = t
    } catch {
      return
    }
    currentTime.value = t
  }

  function seek(time) {
    const t = clampTime(time)
    if (t === null) return
    if (!metaLoaded) {
      // No metadata yet: queue the seek and show it optimistically; it is
      // applied (clamped) as soon as loadedmetadata arrives.
      pendingSeek = t
      currentTime.value = t
      return
    }
    applySeek(t)
  }

  function seekByRatio(ratio) {
    const d = duration.value
    if (!Number.isFinite(d) || d <= 0) return // no metadata / live stream — no-op
    seek(ratio * d)
  }

  function setPlaybackRate(rate) {
    playbackRate.value = rate
  }

  function setVolume(v) {
    volume.value = v
  }

  function toggleRepeat() {
    isRepeat.value = !isRepeat.value
  }

  function setLoopA() {
    loopA.value = audio.currentTime
    if (loopB.value !== null && loopA.value >= loopB.value) {
      loopB.value = null
    }
  }

  function setLoopB() {
    loopB.value = audio.currentTime
    if (loopA.value !== null && loopB.value <= loopA.value) {
      loopA.value = null
    }
  }

  function clearLoop() {
    loopA.value = null
    loopB.value = null
  }

  onUnmounted(() => {
    decodeAbort?.abort()
    audio.pause()
    audio.src = ''
    stopRafLoop()
    if (audioCtx) audioCtx.close()
  })

  return {
    isLoading: readonly(isLoading),
    isBuffering: readonly(isBuffering),
    isSeeking: readonly(isSeeking),
    isPlaying: readonly(isPlaying),
    currentTime: readonly(currentTime),
    duration: readonly(duration),
    buffered: readonly(buffered),
    playbackRate: readonly(playbackRate),
    isRepeat: readonly(isRepeat),
    volume: readonly(volume),
    loopA: readonly(loopA),
    loopB: readonly(loopB),
    waveformPeaks: readonly(waveformPeaks),
    error: readonly(error),

    load,
    play,
    pause,
    togglePlay,
    seek,
    seekByRatio,
    setPlaybackRate,
    setVolume,
    toggleRepeat,
    setLoopA,
    setLoopB,
    clearLoop,
    setPeaks,
    generateWaveform,
  }
}
