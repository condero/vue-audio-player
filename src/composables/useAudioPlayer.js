import { ref, readonly, onUnmounted, watch } from 'vue'

// The on* hooks let a host component forward player events to its own
// consumers (a queue advances on `ended`, recovers on `error`, and sequences
// play() after `ready`) without ever touching the audio element itself.
// onReady/onEnded/onError receive the src the event belongs to, onTime a
// { currentTime, duration, progress } snapshot — queue hosts filter stale
// events after rapid src swaps and feed MediaSession from the time payload.
export function useAudioPlayer({ onEnded, onError, onPlaying, onPaused, onReady, onTime } = {}) {
  const audio = new Audio()

  // The AudioContext is only needed to decode waveforms — create it lazily so
  // the default (no waveform) path never touches it.
  let audioCtx = null
  let decodeAbort = null
  let providedPeaks = null
  let currentSrc = null
  let metaLoaded = false
  let pendingSeek = null
  let preservesPitch = true

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

  // Public position snapshot: duration is null while the element has no finite
  // length (metadata still pending or a live/rangeless stream), and the
  // progress ratio only exists alongside it. `rate` travels along so hosts
  // can feed a rate-aware navigator.mediaSession.setPositionState().
  function timeInfo() {
    const t = audio.currentTime
    const d = audio.duration
    const known = Number.isFinite(d) && d > 0
    return {
      currentTime: t,
      duration: known ? d : null,
      progress: known ? Math.min(1, Math.max(0, t / d)) : 0,
      rate: audio.playbackRate,
    }
  }

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
    onTime?.(timeInfo()) // position/duration become meaningful here
    if (pendingSeek !== null) {
      const time = pendingSeek
      pendingSeek = null
      applySeek(time)
    }
  })

  audio.addEventListener('canplay', () => {
    // One `ready` per (re)load: a stall-recovery canplay is not a new source
    // and must not re-trigger the consumer's play-after-ready sequencing.
    const firstAfterLoad = isLoading.value
    isLoading.value = false
    isBuffering.value = false
    if (firstAfterLoad) onReady?.(currentSrc)
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
    onTime?.(timeInfo()) // a settled seek is a position change consumers see
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
    onTime?.(timeInfo())
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
      onEnded?.(currentSrc) // repeat replays silently: no end event leaves the player
    }
  })

  audio.addEventListener('play', () => {
    isPlaying.value = true
    startRafLoop()
    onPlaying?.()
  })

  audio.addEventListener('pause', () => {
    isPlaying.value = false
    isBuffering.value = false
    stopRafLoop()
    onPaused?.()
  })

  audio.addEventListener('error', (event) => {
    // Forward the native MediaError so consumers can tell an expired or
    // forbidden signed URL (code 4) or a network failure (code 2) apart;
    // fall back to the raw event when the engine fires `error` without one.
    // The src travels along so queue hosts can drop stale failures.
    error.value = audio.error ?? event
    isLoading.value = false
    isBuffering.value = false
    onError?.(error.value, currentSrc)
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
    // Track the incoming src before touching the element: hooks that fire
    // during the load must already echo the source being loaded.
    currentSrc = src
    audio.pause()
    metaLoaded = false
    pendingSeek = null
    audio.src = src
    audio.load()
    applyPreservesPitch() // engines may reset it on source change — re-assert
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

  // Relative seek for skip controls (e.g. MediaSession seekforward/seekbackward
  // ±15s): clamped into [0, duration] by seek(); a no-op while duration is
  // unknown, so hosts never track currentTime themselves.
  function seekBy(delta) {
    const d = duration.value
    if (!Number.isFinite(d) || d <= 0) return // no metadata / live stream — no-op
    seek(currentTime.value + Number(delta))
  }

  function setPlaybackRate(rate) {
    playbackRate.value = rate
  }

  function setVolume(v) {
    volume.value = v
  }

  // Keep pitch constant while the rate differs from 1 (default): the element
  // stretches time instead of shifting pitch — choir practice at 0.6x stays
  // in tune. false = cassette-style speed pitch. Applied to the standard
  // property and the legacy WebKit alias, and re-asserted after each load()
  // because some engines reset it when the source changes.
  function setPreservesPitch(value) {
    preservesPitch = value !== false
    applyPreservesPitch()
  }

  function applyPreservesPitch() {
    audio.preservesPitch = preservesPitch
    audio.webkitPreservesPitch = preservesPitch // legacy WebKit alias
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
    seekBy,
    seekByRatio,
    setPlaybackRate,
    setVolume,
    setPreservesPitch,
    toggleRepeat,
    setLoopA,
    setLoopB,
    clearLoop,
    setPeaks,
    generateWaveform,
  }
}
