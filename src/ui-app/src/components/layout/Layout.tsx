import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  MessageSquare, LayoutDashboard, Brain, Clock, Zap,
  Settings, ScrollText, Plug, Sun, Moon, Menu, X,
  PanelLeftClose, PanelLeft, Network,
} from 'lucide-react';

const nav = [
  { to: '/chat',         label: 'Chat',         Icon: MessageSquare },
  { to: '/agents',       label: 'Agents',       Icon: Network },
  { to: '/dashboard',   label: 'Dashboard',    Icon: LayoutDashboard },
  { to: '/memory',      label: 'Memory',       Icon: Brain },
  { to: '/scheduler',   label: 'Scheduler',    Icon: Clock },
  { to: '/skills',      label: 'Skills',       Icon: Zap },
  { to: '/integrations',label: 'Integrations', Icon: Plug },
  { to: '/logs',        label: 'Logs',         Icon: ScrollText },
  { to: '/settings',    label: 'Settings',     Icon: Settings },
];

const pageTitles: Record<string, string> = {
  '/chat': 'Chat', '/agents': 'Agents', '/dashboard': 'Dashboard', '/memory': 'Memory',
  '/scheduler': 'Scheduler', '/skills': 'Skills',
  '/integrations': 'Integrations', '/logs': 'Logs', '/settings': 'Settings',
};

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('tota-theme') as 'dark' | 'light') ?? 'dark'
  );
  const location = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('tota-theme', theme);
  }, [theme]);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <div
      className={[
        'shell',
        collapsed ? 'shell--collapsed' : '',
        mobileOpen ? 'shell--mobile-open' : '',
      ].filter(Boolean).join(' ')}
    >
      {mobileOpen && (
        <div className="mobile-overlay" onClick={() => setMobileOpen(false)} />
      )}

      <aside className="shell-nav">
        <div className="nav-logo">
          {!collapsed && (
            <div className="logo-full">
              <img src="/tota-agent.png" alt="tota" className="logo-img-icon" />
              <span className="logo-wordmark">to<span className="logo-wordmark-accent">ta</span></span>
            </div>
          )}
          <button
            className="nav-collapse-btn"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>

        <nav className="nav-links">
          {nav.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <Icon size={16} />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {!collapsed && <div className="nav-footer">tota agent · v1.2.0</div>}
      </aside>

      <header className="topbar">
        <button
          className="btn btn--icon mobile-menu-btn"
          onClick={() => setMobileOpen(m => !m)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={16} /> : <Menu size={16} />}
        </button>

        <span className="topbar-title">
          {pageTitles[location.pathname] ?? 'tota'}
        </span>

        <div className="topbar-right">
          <button
            className="btn btn--icon"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <div className="agent-badge">
            <span className="status-dot status-dot--ok" />
            <span>tota agent</span>
          </div>
        </div>
      </header>

      <main className="shell-content">
        <Outlet />
      </main>
    </div>
  );
}
