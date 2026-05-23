import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { socket } from './api';
import Layout from './components/layout/Layout';
import ChatPage from './pages/Chat';
import DashboardPage from './pages/Dashboard';
import MemoryPage from './pages/Memory';
import SchedulerPage from './pages/Scheduler';
import SkillsPage from './pages/Skills';
import SettingsPage from './pages/Settings';
import LogsPage from './pages/Logs';
import IntegrationsPage from './pages/Integrations';

export default function App() {
  useEffect(() => {
    socket.connect();
    return () => socket.disconnect();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="memory" element={<MemoryPage />} />
          <Route path="scheduler" element={<SchedulerPage />} />
          <Route path="skills" element={<SkillsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
