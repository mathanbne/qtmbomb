import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import Player from './pages/Player'

// Players are on phones; keep the host, projector, board and poster code out of their download.
const Admin = lazy(() => import('./pages/Admin'))
const Screen = lazy(() => import('./pages/Screen'))
const Board = lazy(() => import('./pages/Board'))
const Poster = lazy(() => import('./pages/Poster'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Player />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/screen" element={<Screen />} />
          <Route path="/board" element={<Board />} />
          <Route path="/poster" element={<Poster />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
