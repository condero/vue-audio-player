import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAudioPlayer } from '../../src/composables/useAudioPlayer'
import {
  installFakeAudio,
  installFakeAudioContext,
  installFakeFetch,
  installFakeRaf,
} from '../helpers/fakeAudio'
import { withSetup } from '../helpers/withSetup'

let element
let constructed
let ctxConstructed

function setupPlayer() {
  return withSetup(useAudioPlayer)
}

beforeEach(() => {
  ;({ element, constructed } = installFakeAudio())
  ;({ constructed: ctxConstructed } = installFakeAudioContext())
  installFakeFetch()
  installFakeRaf()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAudioPlayer — streaming (issue #1)', () => {
  it('starts playback without fetching the file: no fetch, no AudioContext', () => {
    const [player] = setupPlayer()
    player.load('/audio.mp3')

    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(ctxConstructed()).toBe(0) // no AudioContext on the default path
    expect(constructed()).toBe(1)

    element.__canPlay()
    expect(player.isLoading.value).toBe(false)
    expect(player.isBuffering.value).toBe(false)
  })

  it('seeking updates the existing element: no load(), no src change, no recreation', () => {
    const [player] = setupPlayer()
    player.load('/audio.mp3')
    element.__setMetadata(120)
    element.__canPlay()

    player.seek(60)
    element.__endSeek(60)

    expect(player.currentTime.value).toBe(60)
    expect(element.src).toBe('/audio.mp3')
    expect(element.load).toHaveBeenCalledTimes(1) // the initial load only
    expect(constructed()).toBe(1)
  })

  it('repeated forward/backward skips retain the requested position', () => {
    const [player] = setupPlayer()
    player.load('/audio.mp3')
    element.__setMetadata(120)
    element.__canPlay()

    player.seek(90)
    player.seek(30)
    player.seekByRatio(0.75) // -> 90
    element.__endSeek(90)

    expect(element.currentTimeSets).toEqual([90, 30, 90])
    expect(player.currentTime.value).toBe(90)
  })

  it('seeks before metadata are queued, not applied to the element', () => {
    const [player] = setupPlayer()
    player.load('/audio.mp3')
    // no loadedmetadata yet: duration unknown

    player.seekByRatio(0.5) // must be a no-op (duration 0, not seek(0))
    expect(element.currentTimeSets).toEqual([])

    player.seek(70) // queued, optimistic UI only
    expect(element.currentTimeSets).toEqual([])
    expect(player.currentTime.value).toBe(70)

    element.__setMetadata(100) // flushes the pending seek (clamped)
    expect(element.currentTimeSets).toEqual([70])
    expect(player.currentTime.value).toBe(70)
  })

  it('source changes reset state; position changes never reload', () => {
    const [player] = setupPlayer()
    player.load('/a.mp3')
    element.__setMetadata(120)
    element.__canPlay()
    player.seek(50)

    expect(element.load).toHaveBeenCalledTimes(1)
    player.seek(80)
    expect(element.load).toHaveBeenCalledTimes(1) // still no reload

    player.load('/b.mp3') // intentional reset
    expect(element.src).toBe('/b.mp3')
    expect(element.load).toHaveBeenCalledTimes(2)
    expect(player.currentTime.value).toBe(0)
    expect(player.duration.value).toBe(0)
    expect(player.isLoading.value).toBe(true)
  })

  it('keeps loading, buffering, seeking and playing distinguishable', () => {
    const [player] = setupPlayer()
    player.load('/audio.mp3')

    expect(player.isLoading.value).toBe(true)
    element.__canPlay()
    expect(player.isLoading.value).toBe(false)

    element.__waiting()
    expect(player.isBuffering.value).toBe(true)
    expect(player.isLoading.value).toBe(false) // rebuffering is NOT a reload

    element.__canPlay()
    expect(player.isBuffering.value).toBe(false)

    element.__startSeek(40)
    expect(player.isSeeking.value).toBe(true)
    element.__endSeek(40)
    expect(player.isSeeking.value).toBe(false)

    element.play()
    expect(player.isPlaying.value).toBe(true)
  })
})

describe('useAudioPlayer — RAF loop vs seeks', () => {
  it('does not overwrite the position while the element is seeking', () => {
    const raf = installFakeRaf()
    const [player] = setupPlayer()
    player.load('/audio.mp3')
    element.__setMetadata(120)
    element.__canPlay()

    element.play()
    raf.flush(1)
    expect(player.currentTime.value).toBe(0)

    element.seeking = true // in-flight seek: element still reports old time
    element.__tick(99) // timeupdate while playing must not clobber either
    raf.flush(2)
    expect(player.currentTime.value).toBe(0)

    element.__endSeek(50)
    raf.flush(1)
    expect(player.currentTime.value).toBe(50)
  })
})

describe('useAudioPlayer — guards and regressions', () => {
  it('seekByRatio is a no-op for non-finite durations (rangeless streams)', () => {
    const [player] = setupPlayer()
    player.load('/live')
    element.__setMetadata(Infinity)
    element.__canPlay()

    player.seekByRatio(0.5)
    expect(element.currentTimeSets).toEqual([])
  })

  it('clamps seeks into [0, duration]', () => {
    const [player] = setupPlayer()
    player.load('/audio.mp3')
    element.__setMetadata(100)

    player.seek(500)
    expect(element.currentTimeSets).toEqual([100])

    player.seek(-3)
    expect(element.currentTimeSets).toEqual([100, 0])
  })

  it('ignores non-finite seek input', () => {
    const [player] = setupPlayer()
    player.load('/audio.mp3')
    element.__setMetadata(100)

    player.seek(NaN)
    player.seek(Infinity)
    expect(element.currentTimeSets).toEqual([])
  })

  it('surfaces the MediaError without leaving the player stuck in loading', () => {
    const [player] = setupPlayer()
    player.load('/dead.mp3')
    const mediaError = { code: 4, message: 'MEDIA_ERR_SRC_NOT_SUPPORTED' }
    element.__error(mediaError)

    expect(player.error.value).toStrictEqual(mediaError) // ref wraps objects in a reactive proxy
    expect(player.isLoading.value).toBe(false)
    expect(player.isBuffering.value).toBe(false)

    player.load('/b.mp3')
    element.__error() // no element-level MediaError: the raw event is surfaced
    expect(player.error.value).toMatchObject({ type: 'error', target: element })
  })

  it('ended without repeat stops at zero; with repeat it replays', () => {
    const [player] = setupPlayer()
    player.load('/audio.mp3')
    element.__setMetadata(100)
    element.__canPlay()

    element.__ended()
    expect(player.isPlaying.value).toBe(false)
    expect(player.currentTime.value).toBe(0)

    player.toggleRepeat()
    element.play()
    element.__ended()
    expect(element.currentTimeSets).toEqual([0])
    expect(element.play).toHaveBeenCalled()
  })

  it('maps the progress buffer', () => {
    const [player] = setupPlayer()
    player.load('/audio.mp3')
    element.__progress(42.5)
    expect(player.buffered.value).toBe(42.5)
  })
})

describe('useAudioPlayer — consumer hooks', () => {
  it('fires onReady once per load, not on stall-recovery canplays', () => {
    const onReady = vi.fn()
    const [player] = withSetup(() => useAudioPlayer({ onReady }))
    player.load('/audio.mp3')

    element.__canPlay()
    element.__canPlay() // buffering recovered — not a new source
    expect(onReady).toHaveBeenCalledTimes(1)

    player.load('/b.mp3')
    element.__canPlay()
    expect(onReady).toHaveBeenCalledTimes(2)
  })

  it('forwards the native play/pause events as onPlaying/onPaused', () => {
    const onPlaying = vi.fn()
    const onPaused = vi.fn()
    const [player] = withSetup(() => useAudioPlayer({ onPlaying, onPaused }))
    player.load('/audio.mp3')
    element.__canPlay()

    expect(onPaused).not.toHaveBeenCalled() // loading pauses an already-paused element

    element.play()
    expect(onPlaying).toHaveBeenCalledTimes(1)

    element.pause()
    expect(onPaused).toHaveBeenCalledTimes(1)
  })

  it('fires onEnded on natural end only; repeat mode replays silently', () => {
    const onEnded = vi.fn()
    const [player] = withSetup(() => useAudioPlayer({ onEnded }))
    player.load('/audio.mp3')
    element.__setMetadata(100)
    element.__canPlay()

    element.play()
    element.__ended()
    expect(onEnded).toHaveBeenCalledTimes(1)

    player.toggleRepeat()
    element.__ended()
    expect(onEnded).toHaveBeenCalledTimes(1) // nothing leaves the player
    expect(element.currentTimeSets).toEqual([0]) // ...but the track restarted
  })

  it('hands the MediaError to onError, falling back to the raw event', () => {
    const onError = vi.fn()
    const [player] = withSetup(() => useAudioPlayer({ onError }))
    player.load('/dead.mp3')

    const mediaError = { code: 4, message: 'MEDIA_ERR_SRC_NOT_SUPPORTED' }
    element.__error(mediaError)
    expect(onError).toHaveBeenCalledWith(mediaError, '/dead.mp3')
  })
})

describe('useAudioPlayer — onTime hook (2.2.0)', () => {
  it('reports { currentTime, duration, progress, rate } on timeupdate', () => {
    const onTime = vi.fn()
    const [player] = withSetup(() => useAudioPlayer({ onTime }))
    player.load('/audio.mp3')
    element.__setMetadata(120)
    element.__canPlay()

    element.__tick(30)
    expect(onTime).toHaveBeenLastCalledWith({ currentTime: 30, duration: 120, progress: 0.25, rate: 1 })

    element.__tick(240) // past the end: the ratio clamps, never exceeds 1
    expect(onTime).toHaveBeenLastCalledWith({ currentTime: 240, duration: 120, progress: 1, rate: 1 })
  })

  it('duration is null while metadata are pending and for rangeless streams', () => {
    const onTime = vi.fn()
    const [player] = withSetup(() => useAudioPlayer({ onTime }))
    player.load('/audio.mp3')

    element.__tick(0) // no metadata yet
    expect(onTime).toHaveBeenLastCalledWith({ currentTime: 0, duration: null, progress: 0, rate: 1 })

    element.__setMetadata(Infinity) // live / rangeless stream
    element.__tick(5)
    expect(onTime).toHaveBeenLastCalledWith({ currentTime: 5, duration: null, progress: 0, rate: 1 })
  })

  it('also fires when metadata arrive and when a seek settles', () => {
    const onTime = vi.fn()
    const [player] = withSetup(() => useAudioPlayer({ onTime }))
    player.load('/audio.mp3')

    element.__setMetadata(100)
    expect(onTime).toHaveBeenLastCalledWith({ currentTime: 0, duration: 100, progress: 0, rate: 1 })

    element.__endSeek(40)
    expect(onTime).toHaveBeenLastCalledWith({ currentTime: 40, duration: 100, progress: 0.4, rate: 1 })
  })
})

describe('useAudioPlayer — seekBy (2.2.0)', () => {
  it('seeks relative to the current position, clamped into [0, duration]', () => {
    const [player] = setupPlayer()
    player.load('/audio.mp3')
    element.__setMetadata(120)
    element.__canPlay()

    player.seek(60)
    player.seekBy(15)
    expect(element.currentTimeSets).toEqual([60, 75])

    player.seekBy(-100)
    expect(element.currentTimeSets).toEqual([60, 75, 0])

    player.seekBy(500)
    expect(element.currentTimeSets).toEqual([60, 75, 0, 120])
  })

  it('is a no-op while duration is unknown (metadata pending or live stream)', () => {
    const [player] = setupPlayer()
    player.load('/audio.mp3')

    player.seekBy(15) // metadata pending
    expect(element.currentTimeSets).toEqual([])

    element.__setMetadata(Infinity) // live stream: no reference frame
    player.seekBy(15)
    expect(element.currentTimeSets).toEqual([])
  })
})

describe('useAudioPlayer — preservesPitch (2.2.0)', () => {
  it('applies the standard and legacy WebKit property, defaulting to true', () => {
    const [player] = setupPlayer()
    player.load('/audio.mp3')

    expect(element.preservesPitch).toBe(true)
    expect(element.webkitPreservesPitch).toBe(true)
  })

  it('keeps the setting across a src swap', () => {
    const [player] = setupPlayer()
    player.setPreservesPitch(false)
    player.load('/a.mp3')

    expect(element.preservesPitch).toBe(false)
    expect(element.webkitPreservesPitch).toBe(false)

    player.load('/b.mp3')
    expect(element.preservesPitch).toBe(false)
    expect(element.webkitPreservesPitch).toBe(false)
  })
})

describe('useAudioPlayer — src echo on consumer hooks (2.2.0)', () => {
  it('hands the current src to onReady/onEnded/onError for stale-event filtering', () => {
    const onReady = vi.fn()
    const onEnded = vi.fn()
    const onError = vi.fn()
    const [player] = withSetup(() => useAudioPlayer({ onReady, onEnded, onError }))

    player.load('/a.mp3')
    element.__canPlay()
    expect(onReady).toHaveBeenCalledWith('/a.mp3')

    element.play()
    element.__ended()
    expect(onEnded).toHaveBeenCalledWith('/a.mp3')

    const mediaError = { code: 2, message: 'NETWORK_ERR' }
    element.__error(mediaError)
    expect(onError).toHaveBeenCalledWith(mediaError, '/a.mp3')

    player.load('/b.mp3') // the echo follows the incoming src, not the old one
    element.__canPlay()
    expect(onReady).toHaveBeenCalledWith('/b.mp3')
  })
})
