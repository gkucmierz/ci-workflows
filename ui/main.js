import { createApp } from 'vue'
import { initUrlCleaner } from 'vue-url-cleaner'
import { initTheme } from '@gkucmierz/nano-ui'
import '@gkucmierz/nano-ui/style.css'
import App from './App.vue'

// Initialize synchronous theme state
initTheme()

// Strip tracking query parameters (fbclid, gclid, utm_*, etc.) on boot & popstate
initUrlCleaner()

createApp(App).mount('#app')
