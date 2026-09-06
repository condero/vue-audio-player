import { vi } from 'vitest'

export class FakeTimeRanges {
  constructor(ranges = []) {
    this.ranges = ranges // [[start, end], ...]
  }
  get length() {
    return this.ranges.length
  }
  start(i) {
    return this.ranges[i][0]
  }
  end(i) {
    return this.ranges[i][1]
  }
}

export function createFakeAudioElement() {
  const listeners = {}
  let currentTime = 0
  const el = {
    src: '',
    preload: 'auto',
    duration: NaN,
    volume: 1,
    playbackRate: 1,
    seeking: false,
    paused: true,
    ended: false,
    error: null, // MediaError slot, set via __error() like a real element
    buffered: new FakeTimeRanges(),
    currentTimeSets: [], // every currentTime assignment, for seek assertions
    // Like real elements: play/pause only fire their events on a state change.
    play: vi.fn(() => {
      const wasPaused = el.paused
      el.paused = false
      if (wasPaused) emit('play')
      return Promise.resolve()
    }),
    pause: vi.fn(() => {
      if (!el.paused) {
        el.paused = true
        emit('pause')
      }
    }),
    load: vi.fn(() => {
      el.error = null // a fresh load clears the previous failure
      emit('emptied')
    }),
    addEventListener: (type, fn) => {
      ;(listeners[type] ||= []).push(fn)
    },
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn)
    },
    // Test-driven browser simulation:
    __setMetadata: (d) => {
      el.duration = d
      emit('loadedmetadata')
    },
    __canPlay: () => emit('canplay'),
    __waiting: () => emit('waiting'),
    __playing: () => emit('playing'),
    __startSeek: (t) => {
      currentTime = t
      el.seeking = true
      emit('seeking')
    },
    __endSeek: (t) => {
      currentTime = t
      el.seeking = false
      emit('seeked')
      emit('timeupdate')
    },
    __progress: (end) => {
      el.buffered = new FakeTimeRanges([[0, end]])
      emit('progress')
    },
    __tick: (t) => {
      currentTime = t
      emit('timeupdate')
    },
    __ended: () => {
      el.ended = true
      // Reaching the end pauses the element first (pause, then ended).
      const wasPlaying = !el.paused
      el.paused = true
      if (wasPlaying) emit('pause')
      emit('ended')
    },
    // Mirrors a real failure: the element reports the MediaError, then fires.
    __error: (mediaError) => {
      if (mediaError) el.error = mediaError
      emit('error')
    },
  }
  Object.defineProperty(el, 'currentTime', {
    get: () => currentTime,
    set: (t) => {
      el.currentTimeSets.push(t)
      currentTime = t
    },
  })
  function emit(type) {
    ;(listeners[type] || []).slice().forEach((fn) => fn({ type, target: el }))
  }
  return el
}

// Replaces global Audio so every construction returns the same fake element.
// Returns the element plus a counter to assert the composable never recreates it.
export function installFakeAudio() {
  const element = createFakeAudioElement()
  let constructed = 0
  vi.stubGlobal('Audio', class {
    constructor() {
      constructed++
      return element
    }
  })
  return { element, constructed: () => constructed }
}

// Deterministic requestAnimationFrame: callbacks queue up until flushed.
export function installFakeRaf() {
  const queue = new Map()
  let nextId = 1
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    const id = nextId++
    queue.set(id, cb)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id) => {
    queue.delete(id)
  })
  return {
    // Drain one generation of callbacks (each callback may schedule the next).
    flush: (generations = 1) => {
      for (let g = 0; g < generations; g++) {
        const cbs = [...queue.values()]
        queue.clear()
        cbs.forEach((cb) => cb(performance.now()))
      }
    },
    pending: () => queue.size,
  }
}

export function installFakeAudioContext() {
  let constructed = 0
  const ctx = {
    state: 'running',
    resume: vi.fn(),
    close: vi.fn(),
    decodeAudioData: vi.fn(async (arrayBuffer) => {
      // Deterministic pattern: 8 samples of one full block per channel sample
      const data = new Float32Array(8000)
      for (let i = 0; i < data.length; i++) data[i] = (i % 8) / 7
      return { getChannelData: () => data }
    }),
  }
  vi.stubGlobal('AudioContext', class {
    constructor() {
      constructed++
      return ctx
    }
  })
  vi.stubGlobal('webkitAudioContext', undefined)
  return { context: ctx, constructed: () => constructed }
}

export function installFakeFetch() {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
