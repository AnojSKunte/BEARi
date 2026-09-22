import React from 'react'
import ReactDOM from 'react-dom/client'
import { installMockApi } from '../lib/mockApi'
import { App } from './App'
import './dashboard.css'

installMockApi()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
