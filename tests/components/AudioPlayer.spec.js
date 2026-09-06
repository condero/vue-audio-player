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
