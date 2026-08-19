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
