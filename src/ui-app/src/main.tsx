import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Apply saved theme synchronously before first render to prevent flash
const savedTheme = localStorage.getItem('tota-theme') ?? 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

const root = document.getElementById('root');
if (!root) throw new Error('No root element found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
