import ReactDOM from 'react-dom/client'
import { installMockApi } from '../lib/mockApi'
import { App } from './App'
import './character.css'

installMockApi()

// No StrictMode here: it double-invokes effects in dev, which would
// create/destroy the WebGL (pixi/Live2D) context twice and churn the model
// load. A single mount matches production behaviour.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
