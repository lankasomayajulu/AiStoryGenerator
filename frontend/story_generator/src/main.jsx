import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { StatusBarProvider } from './context/StatusBarContext'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <StatusBarProvider>
        <App />
      </StatusBarProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

