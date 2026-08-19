import { createApp, defineComponent, h } from 'vue'

// Runs a composable inside a real component instance so lifecycle hooks
// (onUnmounted) register properly. Returns [result, unmount].
export function withSetup(composable) {
  let result
  const App = defineComponent({
    setup() {
      result = composable()
      return () => h('div')
    },
  })
  const el = document.createElement('div')
  const app = createApp(App)
  app.mount(el)
  return [result, () => app.unmount()]
}
