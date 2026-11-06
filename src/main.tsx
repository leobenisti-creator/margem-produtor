import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { redirectToInicioOnBoot } from './state/bootRedirect'
import './styles/index.css'

// Every direct URL leads to Início (production only; see `gatesEnabled`).
redirectToInicioOnBoot()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
