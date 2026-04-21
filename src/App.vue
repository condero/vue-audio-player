<script setup>
import { ref, watch } from 'vue'
import AudioPlayer from './components/AudioPlayer.vue'

const dark = ref(true)

watch(dark, (v) => {
  document.documentElement.setAttribute('data-bs-theme', v ? 'dark' : 'light')
}, { immediate: true })
</script>

<template>
  <div style="display:flex;flex-direction:column;align-items:center;gap:12px;width:100%">
    <button
      @click="dark = !dark"
      style="background:none;border:1px solid #555;color:inherit;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px"
    >
      {{ dark ? '☀ Light Mode' : '● Dark Mode' }}
    </button>
    <AudioPlayer src="/Abendsterne - The Colours Of Your Life.mp3" />
  </div>
</template>
