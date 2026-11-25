import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ClubAppearanceProvider } from './ClubAppearance.jsx'
import './ClubAppearance.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClubAppearanceProvider><App /></ClubAppearanceProvider>
  </StrictMode>,
)
