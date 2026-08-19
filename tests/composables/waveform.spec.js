import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { useAudioPlayer } from '../../src/composables/useAudioPlayer'
import {
  installFakeAudio,
  installFakeAudioContext,
  installFakeFetch,
} from '../helpers/fakeAudio'
import { withSetup } from '../helpers/withSetup'

let element
let fetchMock
let ctxConstructed
let ctx

beforeEach(() => {
  ;({ element } = installFakeAudio())
  ;({ context: ctx, constructed: ctxConstructed } = installFakeAudioContext())
  fetchMock = installFakeFetch()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('waveform generation (opt-in)', () => {
  it('does nothing by default — only with waveform: true', async () => {
    const [player] = withSetup(useAudioPlayer)
    player.load('/audio.mp3')
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(player.waveformPeaks.value).toBeNull()
  })

  it('fetches once (no Range header), decodes once, produces peaks', async () => {
    const [player] = withSetup(useAudioPlayer)
    player.load('/audio.mp3', { waveform: true })
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/audio.mp3')
    // Documents the opt-in cost: a plain GET, nothing smarter.
    expect(fetchMock.mock.calls[0][1]).toEqual({ signal: expect.any(AbortSignal) })
    expect(ctxConstructed()).toBe(1)
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1)

    const peaks = player.waveformPeaks.value
    expect(peaks).toBeInstanceOf(Float32Array)
    expect(peaks).toHaveLength(800)
    expect(peaks[0]).toBeGreaterThan(0)
    expect(peaks[0]).toBeLessThanOrEqual(1)
  })

  it('aborts the in-flight fetch when the source changes; stale decodes never write peaks', async () => {
    let resolveFetch
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )

    const [player] = withSetup(useAudioPlayer)
    player.load('/a.mp3', { waveform: true })
    const signal = fetchMock.mock.calls[0][1].signal

    player.load('/b.mp3') // source switch aborts the pending decode
    expect(signal.aborted).toBe(true)

    // The stale response finally arrives — its result must be dropped.
    resolveFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })
    await flushPromises()

    expect(player.waveformPeaks.value).toBeNull()
    expect(ctxConstructed()).toBe(0) // aborted before decodeAudioData
  })

  it('setPeaks accepts precomputed data: normalized, no fetch, survives loads', async () => {
    const [player] = withSetup(useAudioPlayer)
    player.setPeaks([0.1, '0.5', 2, NaN])
    await flushPromises()

    expect(player.waveformPeaks.value).toBeInstanceOf(Float32Array)
    const normalized = [...player.waveformPeaks.value]
    expect(normalized).toHaveLength(4)
    expect(normalized[0]).toBeCloseTo(0.1) // Float32 rounding
    expect(normalized[1]).toBe(0.5)
    expect(normalized[2]).toBe(1)
    expect(normalized[3]).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ctxConstructed()).toBe(0)

    player.load('/next.mp3') // provided peaks are re-applied, not lost
    expect([...player.waveformPeaks.value].slice(1)).toEqual([0.5, 1, 0])

    player.setPeaks(null)
    expect(player.waveformPeaks.value).toBeNull()
  })

  it('provided peaks suppress the fetch even with waveform: true', async () => {
    const [player] = withSetup(useAudioPlayer)
    player.setPeaks([0.5, 0.25])
    player.load('/audio.mp3', { waveform: true })
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps late-provided peaks when an opt-in decode is still pending', async () => {
    let resolveFetch
    fetchMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFetch = resolve }),
    )

    const [player] = withSetup(useAudioPlayer)
    player.load('/audio.mp3', { waveform: true })
    player.setPeaks([0.2, 0.8])

    resolveFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) })
    await flushPromises()

    expect([...player.waveformPeaks.value]).toEqual([0.20000000298023224, 0.800000011920929])
    expect(ctxConstructed()).toBe(0)
  })

  it('generateWaveform() decodes the current source on demand', async () => {
    const [player] = withSetup(useAudioPlayer)
    player.load('/audio.mp3')
    await flushPromises()
    expect(fetchMock).not.toHaveBeenCalled()

    player.generateWaveform()
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(player.waveformPeaks.value).not.toBeNull()
  })

  it('closes the AudioContext on unmount only if one was created', async () => {
    const [playerA, unmountA] = withSetup(useAudioPlayer)
    playerA.load('/a.mp3', { waveform: true })
    await flushPromises()
    unmountA()
    expect(ctx.close).toHaveBeenCalledTimes(1)

    const [, unmountB] = withSetup(useAudioPlayer)
    unmountB()
    expect(ctx.close).toHaveBeenCalledTimes(1) // unchanged
  })
})
