import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './providers/queryClient'
import { AbilityContext, defineAbilityFor } from './security/ability'
import { ThemeProvider } from './context/ThemeContext'
import App from './App.tsx'
import './index.css'

const userRole = localStorage.getItem('user_role') || '';
let permissions = {};
try { permissions = JSON.parse(localStorage.getItem('user_permissions') || '{}'); } catch {}
const ability = defineAbilityFor(userRole, permissions);

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AbilityContext.Provider value={ability}>
        <ThemeProvider>
          <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App />
          </HashRouter>
        </ThemeProvider>
      </AbilityContext.Provider>
    </QueryClientProvider>
  </React.StrictMode>,
)
