import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { RequireAuth } from './RequireAuth'
import { ExchangePanel } from './ExchangePanel'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import ProfilePage from './pages/ProfilePage'
import SecurePage from './pages/SecurePage'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route element={<RequireAuth />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/secure" element={<SecurePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ExchangePanel />
    </>
  )
}

export default App
