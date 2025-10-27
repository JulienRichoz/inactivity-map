// src/main.jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import CovariatesPage from './pages/CovariatesPage'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/covariates" element={<CovariatesPage />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>
)
