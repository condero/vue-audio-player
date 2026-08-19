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

  it('surfaces load errors without leaving the player stuck in loading', () => {
    const [player] = setupPlayer()
    player.load('/dead.mp3')
    element.__error()

    expect(player.error.value).toBeInstanceOf(Error)
    expect(player.isLoading.value).toBe(false)
    expect(player.isBuffering.value).toBe(false)
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
