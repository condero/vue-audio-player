import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AudioPlayer from '../../src/components/AudioPlayer.vue'
import {
  installFakeAudio,
  installFakeAudioContext,
  installFakeFetch,
} from '../helpers/fakeAudio'

let element
let constructed
let ctxConstructed
let fetchMock

const mountPlayer = (props = {}) =>
  mount(AudioPlayer, { props: { src: '/audio.mp3', ...props } })

beforeEach(() => {
  ;({ element, constructed } = installFakeAudio())
  ;({ constructed: ctxConstructed } = installFakeAudioContext())
  fetchMock = installFakeFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AudioPlayer — streaming (issue #1)', () => {
  it('mounts without fetching the file or creating an AudioContext', () => {
    const wrapper = mountPlayer()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(ctxConstructed()).toBe(0)
    expect(constructed()).toBe(1)
    expect(wrapper.find('.fallback-progress').exists()).toBe(true)
    expect(wrapper.find('.loading-overlay').exists()).toBe(true)
  })

  it('enables the play button once canplay fires and plays on click', async () => {
    const wrapper = mountPlayer()
    element.__canPlay()
    await nextTick()

    const playButton = wrapper.find('.btn-play')
    expect(playButton.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.loading-overlay').exists()).toBe(false)

    await playButton.trigger('click')
    expect(element.play).toHaveBeenCalledTimes(1)
  })

  it('autoplays once when loaded; a policy rejection is swallowed, not fatal', async () => {
    element.play.mockImplementationOnce(() =>
      Promise.reject(new DOMException('play() failed', 'NotAllowedError')),
    )
    const wrapper = mountPlayer({ autoplay: true })

    element.__canPlay()
    await nextTick()
    expect(element.play).toHaveBeenCalledTimes(1)

    element.__canPlay() // later transitions must not re-trigger
    await nextTick()
    expect(element.play).toHaveBeenCalledTimes(1)

    const playButton = wrapper.find('.btn-play')
    expect(playButton.attributes('disabled')).toBeUndefined()
    await playButton.trigger('click') // manual tap still works
    expect(element.play).toHaveBeenCalledTimes(2)
  })

  it('does not autoplay by default', async () => {
    mountPlayer()
    element.__canPlay()
    await nextTick()
    expect(element.play).not.toHaveBeenCalled()
  })

  it('reloads when the src prop changes (intentional reset)', async () => {
    const wrapper = mountPlayer()
    expect(element.src).toBe('/audio.mp3')
    expect(element.load).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ src: '/other.mp3' })
    expect(element.src).toBe('/other.mp3')
    expect(element.load).toHaveBeenCalledTimes(2)
  })

  it('timeline clicks seek the existing element and never reload', async () => {
    const wrapper = mountPlayer()
    element.__setMetadata(120)
    element.__canPlay()
    await nextTick()

    const bar = wrapper.find('.waveform-bar')
    bar.element.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 200,
      bottom: 48,
      width: 200,
      height: 48,
    })
    await bar.trigger('mousedown', { clientX: 100, button: 0 })

    expect(element.currentTimeSets).toEqual([60]) // 0.5 * 120s
    expect(element.load).toHaveBeenCalledTimes(1)
    expect(constructed()).toBe(1)
    expect(element.src).toBe('/audio.mp3')
  })

  it('keeps controls interactive while buffering (spinner, no disabling)', async () => {
    const wrapper = mountPlayer()
    element.__setMetadata(120)
    element.__canPlay()
    await nextTick()

    element.__waiting()
    await nextTick()

    expect(wrapper.find('.state-indicator').exists()).toBe(true)
    expect(wrapper.find('.loading-overlay').exists()).toBe(false)
    expect(wrapper.find('.btn-play').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.waveform-bar').classes()).not.toContain('disabled')

    element.__canPlay()
    await nextTick()
    expect(wrapper.find('.state-indicator').exists()).toBe(false)
  })

  it('shows the state indicator while seeking', async () => {
    const wrapper = mountPlayer()
    element.__setMetadata(120)
    element.__canPlay()
    await nextTick()

    element.__startSeek(30)
    await nextTick()
    expect(wrapper.find('.state-indicator').exists()).toBe(true)

    element.__endSeek(30)
    await nextTick()
    expect(wrapper.find('.state-indicator').exists()).toBe(false)
    expect(wrapper.find('.time').text()).toBe('0:30')
  })
})

describe('AudioPlayer — waveform props', () => {
  it('peaks prop renders the waveform without any fetch', async () => {
    const wrapper = mountPlayer({ peaks: [0.1, 0.4, 0.9, 0.2] })
    element.__canPlay()
    await nextTick()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(ctxConstructed()).toBe(0)
    expect(wrapper.find('.fallback-progress').exists()).toBe(false)
  })

  it('waveform prop opts into the one background fetch', async () => {
    mountPlayer({ waveform: true })
    await nextTick()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/audio.mp3')
  })
})

describe('AudioPlayer — queue-consumer hooks', () => {
  it('emits ready once per load: on mount and after each src swap', async () => {
    const wrapper = mountPlayer()
    expect(wrapper.emitted('ready')).toBeUndefined()

    element.__canPlay()
    await nextTick()
    expect(wrapper.emitted('ready').length).toBe(1)

    element.__canPlay() // stall recovery is not a reload
    await nextTick()
    expect(wrapper.emitted('ready').length).toBe(1)

    await wrapper.setProps({ src: '/other.mp3' })
    expect(wrapper.emitted('ready').length).toBe(1) // not ready until canplay
    element.__canPlay()
    await nextTick()
    expect(wrapper.emitted('ready').length).toBe(2)
  })

  it('emits ended on natural end, nothing in repeat mode', async () => {
    const wrapper = mountPlayer()
    element.__canPlay()
    await nextTick()
    await wrapper.find('.btn-play').trigger('click')

    element.__ended()
    await nextTick()
    expect(wrapper.emitted('ended').length).toBe(1)

    await wrapper.find('button[title="Repeat"]').trigger('click')
    element.__ended()
    await nextTick()
    expect(wrapper.emitted('ended').length).toBe(1) // the loop replays silently
    expect(element.play).toHaveBeenCalledTimes(2) // ...and the replay started
  })

  it('emits error with the MediaError, falling back to the raw event', async () => {
    const wrapper = mountPlayer()
    const mediaError = { code: 4, message: 'MEDIA_ERR_SRC_NOT_SUPPORTED' }
    element.__error(mediaError)
    await nextTick()
    expect(wrapper.emitted('error').length).toBe(1)
    expect(wrapper.emitted('error')[0][0]).toStrictEqual(mediaError)

    await wrapper.setProps({ src: '/other.mp3' }) // fresh load clears the failure
    element.__error() // engine fired without an element-level MediaError
    await nextTick()
    expect(wrapper.emitted('error').length).toBe(2)
    expect(wrapper.emitted('error')[1][0]).toMatchObject({ type: 'error', target: element })
  })

  it('emits playing/paused for the internal button and programmatic control', async () => {
    const wrapper = mountPlayer()
    element.__canPlay()
    await nextTick()
    expect(wrapper.emitted('paused')).toBeUndefined() // loading pauses an already-paused element

    await wrapper.find('.btn-play').trigger('click')
    expect(wrapper.emitted('playing').length).toBe(1)

    await wrapper.find('.btn-play').trigger('click')
    expect(wrapper.emitted('paused').length).toBe(1)

    wrapper.vm.play()
    expect(wrapper.emitted('playing').length).toBe(2)
    wrapper.vm.pause()
    expect(wrapper.emitted('paused').length).toBe(2)
  })

  it('exposed play() returns the element promise: NotAllowedError reaches the caller', async () => {
    const wrapper = mountPlayer()
    element.__canPlay()
    await nextTick()
    element.play.mockImplementationOnce(() =>
      Promise.reject(new DOMException('play() failed', 'NotAllowedError')),
    )

    await expect(wrapper.vm.play()).rejects.toMatchObject({ name: 'NotAllowedError' })
  })

  it('a src swap reloads paused at position zero on the same element, keeping volume, rate and repeat', async () => {
    const wrapper = mountPlayer()
    element.__setMetadata(120)
    element.__canPlay()
    await nextTick()

    await wrapper.find('.volume-slider').setValue('0.5')
    await wrapper.find('.speed-select').setValue('0.5')
    await wrapper.find('button[title="Repeat"]').trigger('click')
    element.__endSeek(45) // drift away from 0 while paused
    await nextTick()
    expect(wrapper.findAll('.time')[0].text()).toBe('0:45')
    await wrapper.find('.btn-play').trigger('click')

    await wrapper.setProps({ src: '/other.mp3' })
    await nextTick()

    expect(element.src).toBe('/other.mp3')
    expect(element.load).toHaveBeenCalledTimes(2)
    expect(constructed()).toBe(1) // same element instance, never recreated
    expect(element.paused).toBe(true) // swap ends in PAUSED...
    expect(element.play).toHaveBeenCalledTimes(1) // ...without autoplaying
    expect(element.volume).toBe(0.5) // volume survived
    expect(element.playbackRate).toBe(0.5) // playback rate survived
    expect(wrapper.find('button[title="Repeat"]').classes()).toContain('active')
    expect(wrapper.findAll('.time')[0].text()).toBe('0:00') // position reset
    expect(wrapper.emitted('ready').length).toBe(1) // next ready waits for canplay
  })

  it('autoplay applies to the initial load only, never after a src swap', async () => {
    const wrapper = mountPlayer({ autoplay: true })
    element.__canPlay()
    await nextTick()
    expect(element.play).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ src: '/other.mp3' })
    element.__canPlay()
    await nextTick()
    expect(element.play).toHaveBeenCalledTimes(1) // the consumer sequences play()

    wrapper.vm.play()
    expect(element.play).toHaveBeenCalledTimes(2)
  })

  it('programmatic queue flow: play -> ended -> swap -> ready -> play resolves', async () => {
    const wrapper = mountPlayer()
    element.__canPlay()
    await nextTick()
    expect(wrapper.emitted('ready').length).toBe(1)

    await wrapper.vm.play()
    expect(wrapper.emitted('playing').length).toBe(1)

    element.__ended()
    expect(wrapper.emitted('ended').length).toBe(1)

    await wrapper.setProps({ src: '/track-2.mp3' })
    element.__canPlay()
    await nextTick()
    expect(wrapper.emitted('ready').length).toBe(2)

    await expect(wrapper.vm.play()).resolves.toBeUndefined()
    expect(element.src).toBe('/track-2.mp3')
  })
})

describe('AudioPlayer — time event (2.2.0)', () => {
  it('emits time on timeupdate with currentTime, duration and progress', async () => {
    const wrapper = mountPlayer()
    element.__setMetadata(120) // metadata arrival already emits once
    element.__canPlay()
    await nextTick()

    element.__tick(30)
    await nextTick()
    expect(wrapper.emitted('time').length).toBe(2)
    expect(wrapper.emitted('time')[1][0]).toEqual({ currentTime: 30, duration: 120, progress: 0.25, rate: 1 })
  })

  it('reports duration null and progress 0 while duration is unknown', async () => {
    const wrapper = mountPlayer()
    element.__canPlay() // ready without metadata: duration still unknown
    await nextTick()

    element.__tick(0)
    await nextTick()
    expect(wrapper.emitted('time')[0][0]).toEqual({ currentTime: 0, duration: null, progress: 0, rate: 1 })
  })

  it('also emits when metadata arrive and when a seek settles', async () => {
    const wrapper = mountPlayer()

    element.__setMetadata(100)
    await nextTick()
    expect(wrapper.emitted('time').length).toBe(1)
    expect(wrapper.emitted('time')[0][0]).toEqual({ currentTime: 0, duration: 100, progress: 0, rate: 1 })

    element.__endSeek(40) // seeked + timeupdate both carry the new position
    await nextTick()
    expect(wrapper.emitted('time').length).toBe(3)
    expect(wrapper.emitted('time')[2][0]).toEqual({ currentTime: 40, duration: 100, progress: 0.4, rate: 1 })
  })

  it('feeds MediaSession-style position state after a src swap', async () => {
    const wrapper = mountPlayer()
    element.__setMetadata(120)
    element.__canPlay()
    await nextTick()

    await wrapper.setProps({ src: '/track-2.mp3' })
    element.__setMetadata(200)
    element.__canPlay()
    await nextTick()

    element.__tick(50)
    await nextTick()
    expect(wrapper.emitted('time').at(-1)[0]).toEqual({
      currentTime: 50,
      duration: 200,
      progress: 0.25,
      rate: 1,
    })
  })
})

describe('AudioPlayer — playWhenReady (2.2.0)', () => {
  it('plays on ready for every load, src swaps included', async () => {
    const wrapper = mountPlayer({ playWhenReady: true })
    element.__canPlay()
    await nextTick()
    expect(element.play).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ src: '/track-2.mp3' })
    element.__canPlay()
    await nextTick()
    expect(element.play).toHaveBeenCalledTimes(2)

    element.__canPlay() // stall recovery: no new ready, no replay
    await nextTick()
    expect(element.play).toHaveBeenCalledTimes(2)
  })

  it('is off by default and respects a false flip mid-load', async () => {
    const wrapper = mountPlayer()
    element.__canPlay()
    await nextTick()
    expect(element.play).not.toHaveBeenCalled()

    await wrapper.setProps({ src: '/track-2.mp3', playWhenReady: true })
    await wrapper.setProps({ playWhenReady: false }) // flip before canplay
    element.__canPlay()
    await nextTick()
    expect(element.play).not.toHaveBeenCalled()
  })

  it('a policy rejection is not fatal: the player stays paused and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    element.play.mockImplementationOnce(() =>
      Promise.reject(new DOMException('play() failed', 'NotAllowedError')),
    )
    const wrapper = mountPlayer({ playWhenReady: true })

    element.__canPlay()
    await nextTick()
    expect(warn).toHaveBeenCalled()
    expect(element.paused).toBe(true)
    warn.mockRestore()
  })
})

describe('AudioPlayer — control toggles and compact variant (2.2.0)', () => {
  it('control-toggle props remove the corresponding controls, the rest stay', async () => {
    const wrapper = mountPlayer({
      controls: { times: false, repeat: false, abLoop: false, volume: false },
    })

    expect(wrapper.find('.row-top').exists()).toBe(false)
    expect(wrapper.find('button[title="Repeat"]').exists()).toBe(false)
    expect(wrapper.find('button[title="Set A"]').exists()).toBe(false)
    expect(wrapper.find('button[title="Set B"]').exists()).toBe(false)
    expect(wrapper.find('.volume-group').exists()).toBe(false)
    expect(wrapper.find('.btn-play').exists()).toBe(true) // partial object: play stays
    expect(wrapper.find('.speed-select').exists()).toBe(true)
  })

  it('play can be hidden too, and defaults keep everything visible', () => {
    const wrapper = mountPlayer({ controls: { play: false } })
    expect(wrapper.find('.btn-play').exists()).toBe(false)
    expect(wrapper.find('.volume-group').exists()).toBe(true)

    const full = mountPlayer()
    expect(full.find('.btn-play').exists()).toBe(true)
    expect(full.find('.row-top').exists()).toBe(true)
    expect(full.find('button[title="Repeat"]').exists()).toBe(true)
    expect(full.find('button[title="Set A"]').exists()).toBe(true)
    expect(full.find('.volume-group').exists()).toBe(true)
  })

  it('compact variant applies its layout class without touching fallback rendering', async () => {
    const wrapper = mountPlayer({ variant: 'compact' }) // peaks stay null -> fallback bar
    element.__canPlay()
    await nextTick()

    expect(wrapper.find('.player').classes()).toContain('player--compact')
    expect(wrapper.find('.fallback-progress').exists()).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled() // compact never implies a waveform fetch
  })
})

describe('AudioPlayer — src echo in payloads (2.2.0)', () => {
  it('ready and ended carry their src, so stale events are detectable after a swap', async () => {
    const wrapper = mountPlayer()
    element.__canPlay()
    await nextTick()
    expect(wrapper.emitted('ready')[0][0]).toEqual({ src: '/audio.mp3' })

    await wrapper.find('.btn-play').trigger('click')
    element.__ended()
    await nextTick()
    expect(wrapper.emitted('ended')[0][0]).toEqual({ src: '/audio.mp3' })

    await wrapper.setProps({ src: '/track-2.mp3' })
    element.__canPlay()
    await nextTick()
    expect(wrapper.emitted('ready')[1][0]).toEqual({ src: '/track-2.mp3' })
  })

  it('error keeps the MediaError first and appends the src', async () => {
    const wrapper = mountPlayer()
    const mediaError = { code: 4, message: 'MEDIA_ERR_SRC_NOT_SUPPORTED' }

    element.__error(mediaError)
    await nextTick()
    expect(wrapper.emitted('error')[0][0]).toStrictEqual(mediaError)
    expect(wrapper.emitted('error')[0][1]).toEqual({ src: '/audio.mp3' })
  })
})

describe('AudioPlayer — exposed position/duration/seekTo (2.2.0)', () => {
  it('seekTo seeks the element; position and duration are readable', async () => {
    const wrapper = mountPlayer()
    element.__setMetadata(120)
    element.__canPlay()
    await nextTick()

    expect(wrapper.vm.duration).toBe(120)
    expect(wrapper.vm.position).toBe(0)

    wrapper.vm.seekTo(30)
    expect(element.currentTimeSets).toEqual([30])
    expect(wrapper.vm.position).toBe(30)
    expect(element.load).toHaveBeenCalledTimes(1) // a seek never reloads
  })

  it('duration is null while unknown; seekTo before metadata queues the seek', () => {
    const wrapper = mountPlayer()
    expect(wrapper.vm.duration).toBeNull()
    expect(wrapper.vm.position).toBe(0)

    wrapper.vm.seekTo(70) // no metadata yet: queued, shown optimistically
    expect(element.currentTimeSets).toEqual([])
    expect(wrapper.vm.position).toBe(70)

    element.__setMetadata(100)
    expect(element.currentTimeSets).toEqual([70])
    expect(wrapper.vm.duration).toBe(100)
  })
})

describe('AudioPlayer — speeds prop (2.2.0)', () => {
  it('renders the default ladder ascending', () => {
    const wrapper = mountPlayer()

    const options = wrapper.findAll('.speed-select option')
    expect(options.length).toBe(9)
    expect(options[0].text()).toBe('0.5x')
    expect(options.at(-1).text()).toBe('1.2x')
    expect(options.map((o) => o.text())).toEqual([
      '0.5x', '0.6x', '0.7x', '0.8x', '0.9x', '1x', '1.05x', '1.1x', '1.2x',
    ])
  })

  it('dedupes, filters and sorts a custom prop regardless of order', () => {
    const wrapper = mountPlayer({
      speeds: [2, 0.5, 1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.05],
    })

    expect(wrapper.findAll('.speed-select option').map((o) => o.text()))
      .toEqual(['0.5x', '1x', '1.05x', '2x'])
  })

  it('falls back to the default ladder when nothing survives the filter', () => {
    const wrapper = mountPlayer({ speeds: [0, -1, Number.NaN] })

    expect(wrapper.findAll('.speed-select option').length).toBe(9)
  })

  it('keeps the active rate on prop change while it is still offered', async () => {
    const wrapper = mountPlayer()
    element.__canPlay()
    await nextTick()

    await wrapper.setProps({ speeds: [0.5, 1.0, 2.0] })
    expect(wrapper.vm.playbackRate).toBe(1)
    expect(element.playbackRate).toBe(1)
  })

  it('snaps the active rate to the nearest preset when it is removed', async () => {
    const wrapper = mountPlayer()
    element.__canPlay()
    await nextTick()

    await wrapper.setProps({ speeds: [0.5, 2.0] }) // 1.0 gone: |0.5-1| = |2-1|... snap
    expect(wrapper.vm.playbackRate).toBe(0.5) // tie -> first (lower) preset wins
    expect(element.playbackRate).toBe(0.5)

    await wrapper.setProps({ speeds: [0.5, 1.0, 2.0] }) // 0.5 still offered
    expect(wrapper.vm.playbackRate).toBe(0.5)
  })
})

describe('AudioPlayer — playbackRate exposure (2.2.0)', () => {
  it('exposed getter follows the speed select and the element', async () => {
    const wrapper = mountPlayer()
    element.__setMetadata(120)
    element.__canPlay()
    await nextTick()

    expect(wrapper.vm.playbackRate).toBe(1)

    await wrapper.find('.speed-select').setValue('0.5')
    expect(wrapper.vm.playbackRate).toBe(0.5)
    expect(element.playbackRate).toBe(0.5)

    await wrapper.find('.speed-select').setValue('1.2')
    expect(wrapper.vm.playbackRate).toBe(1.2)
    expect(element.playbackRate).toBe(1.2)
  })

  it('rate travels in the time payload after a speed change', async () => {
    const wrapper = mountPlayer()
    element.__setMetadata(120)
    element.__canPlay()
    await nextTick()

    await wrapper.find('.speed-select').setValue('0.5')
    element.__tick(30)
    await nextTick()

    expect(wrapper.emitted('time').at(-1)[0]).toEqual({
      currentTime: 30,
      duration: 120,
      progress: 0.25,
      rate: 0.5,
    })
  })
})

describe('AudioPlayer — preservesPitch prop (2.2.0)', () => {
  it('defaults to true on the element, standard and legacy WebKit property', () => {
    mountPlayer()
    expect(element.preservesPitch).toBe(true)
    expect(element.webkitPreservesPitch).toBe(true)
  })

  it('applies false and survives a src swap and a reactive flip', async () => {
    const wrapper = mountPlayer({ preservesPitch: false })
    expect(element.preservesPitch).toBe(false)
    expect(element.webkitPreservesPitch).toBe(false)

    await wrapper.setProps({ src: '/other.mp3' })
    expect(element.preservesPitch).toBe(false)
    expect(element.webkitPreservesPitch).toBe(false)

    await wrapper.setProps({ preservesPitch: true })
    expect(element.preservesPitch).toBe(true)
    expect(element.webkitPreservesPitch).toBe(true)
  })
})

describe('AudioPlayer — exposed seekBy (2.2.0)', () => {
  it('skips relative to the current position, clamped into [0, duration]', async () => {
    const wrapper = mountPlayer()
    element.__setMetadata(120)
    element.__canPlay()
    await nextTick()

    wrapper.vm.seekBy(15)
    expect(element.currentTimeSets).toEqual([15])
    expect(wrapper.vm.position).toBe(15)

    wrapper.vm.seekBy(-100)
    expect(element.currentTimeSets).toEqual([15, 0])

    wrapper.vm.seekBy(500)
    expect(element.currentTimeSets).toEqual([15, 0, 120])
  })

  it('is a no-op while duration is unknown', () => {
    const wrapper = mountPlayer()

    wrapper.vm.seekBy(15)
    expect(element.currentTimeSets).toEqual([])
  })
})
