import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useThemeStore } from './stores/themeStore'
import { useLanguageStore } from './stores/languageStore'

useThemeStore.getState().initTheme()
useLanguageStore.getState().initLanguage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
