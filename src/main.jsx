import React from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import CovariatesPage from './pages/CovariatesPage'
import './styles.css'

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/covariates', element: <CovariatesPage /> },
])

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
