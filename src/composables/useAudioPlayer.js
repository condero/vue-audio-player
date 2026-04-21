import { ref, readonly, onUnmounted, watch } from 'vue'

export function useAudioPlayer() {
  const audio = new Audio()
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)()

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

  let rafId = null

  function startRafLoop() {
    stopRafLoop()
    function tick() {
      if (!isPlaying.value) return
      const t = audio.currentTime
      currentTime.value = t

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
      audio.play()
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
    stopRafLoop()
  })

  watch(playbackRate, (rate) => {
    audio.playbackRate = rate
  })

  watch(volume, (v) => {
    audio.volume = v
  })

  async function decodeWaveform(src, numSamples = 800) {
    try {
      const response = await fetch(src)
      const arrayBuffer = await response.arrayBuffer()
      const buffer = await audioCtx.decodeAudioData(arrayBuffer)
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
      waveformPeaks.value = peaks
    } catch (e) {
      waveformPeaks.value = null
    }
  }

  function load(src) {
    audio.pause()
    audio.currentTime = 0
    audio.src = src
    audio.load()
    isPlaying.value = false
    currentTime.value = 0
    duration.value = 0
    buffered.value = 0
    loopA.value = null
    loopB.value = null
    waveformPeaks.value = null
    decodeWaveform(src)
  }

  function play() {
    if (audioCtx.state === 'suspended') audioCtx.resume()
    audio.play()
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

  function seek(time) {
    audio.currentTime = time
    currentTime.value = time
  }

  function seekByRatio(ratio) {
    seek(ratio * duration.value)
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
    audio.pause()
    audio.src = ''
    stopRafLoop()
    audioCtx.close()
  })

  return {
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
  }
}
