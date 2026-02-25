import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import axios from "axios";
import ReservationPage from './ReservationPage';
import BackupPage from './pages/BackupPage';
import BlacklistAdmin from './components/BlacklistAdmin';
import PassengerReport from './components/PassengerReport';
import AdminPage from './pages/AdminPage';
import ReportsPage from './pages/ReportsPage';
import RouteEditorPage from './pages/RouteEditorPage';
import PeopleList from './pages/PeopleList';
import LoginPage from './pages/LoginPage';
import TerminalSelectPage from './pages/TerminalSelectPage';

import AuditLog from './pages/AuditLog';
import ReservationDetails from './components/ReservationDetails.jsx';
import AgentChatPopup from './components/AgentChatPopup.jsx';
import InviteAcceptPage from './pages/InviteAcceptPage';
import { initChatSocket, stopChatSocket } from "./utils/chatSocket";


//const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
//const API_URL = '';

const API_URL = import.meta.env.VITE_API_URL ?? ''; // default gol
//if (url.startsWith('/api/')) url = API_URL + url; // cu VITE_API_URL ne-setat => rămâne doar '/api/...'

// axios: toate /api/* să meargă la API_URL
axios.defaults.baseURL = API_URL;
axios.defaults.withCredentials = true;


function getCookie(name) {
  const v = document.cookie.split('; ').find(x => x.startsWith(name + '='));
  return v ? decodeURIComponent(v.split('=').slice(1).join('=')) : null;
}

// Trimite automat CSRF token pe cererile care modifică date
axios.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase();
  const needsCsrf = ['post', 'put', 'patch', 'delete'].includes(method);

  if (needsCsrf) {
    const token = getCookie('csrf_token');
    if (token) {
      config.headers = config.headers || {};
      config.headers['X-CSRF-Token'] = token;
    }
  }

  return config;
});




function App() {


  useEffect(() => {
    if (window.__apiPatched) return;
    window.__apiPatched = true;

    const origFetch = window.fetch.bind(window);

    window.fetch = (input, init = {}) => {
      let url, baseInit = {};

      if (typeof input === 'string') {
        url = input;
        baseInit = {};
      } else if (input && typeof input === 'object' && 'url' in input) {
        // input e un Request
        url = input.url;
        baseInit = {
          method: input.method,
          headers: input.headers,
          body: input.body,
          mode: input.mode,
          credentials: input.credentials,
          cache: input.cache,
          redirect: input.redirect,
          referrer: input.referrer,
          referrerPolicy: input.referrerPolicy,
          integrity: input.integrity,
          keepalive: input.keepalive,
          signal: input.signal,
        };
      } else {
        url = '';
      }

      if (url.startsWith('/api/')) url = API_URL + url;

      // setează credentials doar dacă nu sunt deja setate
      const finalInit = { credentials: 'include', ...baseInit, ...init };
      if (init && 'credentials' in init) {
        finalInit.credentials = init.credentials;
      } else if (baseInit && 'credentials' in baseInit) {
        finalInit.credentials = baseInit.credentials;
      }

      return origFetch(url, finalInit);
    };
  }, []);


  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null); // 'admin' | 'operator_admin' | 'agent' | 'driver' | 'guest'
  const [loadingRole, setLoadingRole] = useState(true);

  useEffect(() => {
    const loadRole = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setUser(data?.user || null);
          setUserRole(data?.user?.role || 'guest');
        } else {
          setUser(null);
          setUserRole('guest');
        }
      } catch {
        setUser(null);
        setUserRole('guest');
      } finally {
        setLoadingRole(false);
      }
    };
    loadRole();
  }, []);

  useEffect(() => {
    // pornește chat socket DOAR după ce știm sigur cine e userul
    if (!loadingRole && user) {
      initChatSocket();
    }

    // oprește socket-ul la logout
    if (!loadingRole && !user) {
      stopChatSocket();
    }
  }, [loadingRole, user]);


  const canSee = (roles) => roles.includes(userRole);

  const Guard = ({ allow, children }) => {
    if (loadingRole) return <div className="p-4">Se încarcă...</div>;
    // dacă nu are voie:
    if (!canSee(allow)) {
      // neautentificat (guest) -> redirect la login
      if (!userRole || userRole === 'guest') return <Navigate to="/login" replace />;
      // autentificat dar rol greșit -> mesaj
      return <div className="p-4 text-red-600">Acces interzis.</div>;
    }
    return children;
  };

  // === Bara de navigație (ascunsă pe /login). FĂRĂ afișare rol. Logout ca link.
  const NavBar = () => {
    const { pathname } = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
      setIsMenuOpen(false);
    }, [pathname]);

    if (pathname === '/login' || pathname.startsWith('/invita')) return null; // pe login și invitații nu afișăm nimic

    const navLinks = (
      <>
        {canSee(['admin', 'operator_admin', 'agent']) && (
          <>
            <Link to="/" className="text-blue-600 hover:underline">Rezervări</Link>
            <Link to="/backup" className="text-blue-600 hover:underline">Backupuri</Link>
            <Link to="/admin/blacklist" className="text-blue-600 hover:underline">Blacklist</Link>
            <Link to="/pasageri" className="text-blue-600 hover:underline">Pasageri</Link>
          </>
        )}
        {canSee(['admin', 'operator_admin', 'agent']) && (
          <Link to="/admin" className="text-blue-600 hover:underline">Administrare</Link>
        )}
        {canSee(['admin', 'operator_admin']) && (
          <>
            <Link to="/admin/reports" className="text-blue-600 hover:underline">Rapoarte</Link>
            <Link to="/admin/log" className="text-blue-600 hover:underline">Log</Link>
          </>
        )}
      </>
    );

    return (
      <div className="sticky top-0 z-50 border-b border-gray-200 bg-gray-100/95 backdrop-blur">
        <div className="p-4 flex items-center gap-4">
          <button
            type="button"
            className="inline-flex md:hidden items-center justify-center rounded-md border border-gray-300 bg-white px-2.5 py-2 text-gray-700"
            aria-label="Deschide meniul"
            onClick={() => setIsMenuOpen((prev) => !prev)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="hidden md:flex gap-6 items-center">
            {navLinks}
          </div>

          {/* Logout ca link, doar când e autentificat */}
          {userRole && userRole !== 'guest' && (
            <button
              onClick={async () => {
                try {
                  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                } catch { }
                setUser(null);
                setUserRole('guest');
                window.location.href = '/login';
              }}
              className="ml-auto text-blue-600 hover:underline"
            >
              Logout
            </button>
          )}
        </div>

        <div className={`px-4 pb-4 md:hidden ${isMenuOpen ? 'block' : 'hidden'}`}>
          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            {navLinks}
          </div>
        </div>
      </div>
    );
  };





  const ChatWrapper = () => {
    const { pathname } = useLocation();
    if (pathname === '/login' || pathname.startsWith('/invita')) return null;
    return <AgentChatPopup user={user} />;
  };

  return (
    <Router>
      <NavBar />
      <ChatWrapper />

      <Routes>
        <Route
          path="/terminal"
          element={
            <Guard allow={['admin', 'operator_admin', 'agent']}>
              <TerminalSelectPage
                onSelected={(info) => {
                  setUser(info);
                  setUserRole(info?.role || 'guest');
                }}
              />
            </Guard>
          }
        />


        {/* Rezervări (prima pagină) – PROTEJATĂ */}
        <Route
          path="/"
          element={
            <Guard allow={['admin', 'operator_admin', 'agent']}>
              <ReservationPage userRole={userRole} user={user} />
            </Guard>
          }
        />

        {/* Backup – PROTEJAT */}
        <Route
          path="/backup"
          element={
            <Guard allow={['admin', 'operator_admin', 'agent']}>
              <BackupPage />
            </Guard>
          }
        />

        {/* Blacklist – PROTEJAT */}
        <Route
          path="/admin/blacklist"
          element={
            <Guard allow={['admin', 'operator_admin', 'agent']}>
              <BlacklistAdmin />
            </Guard>
          }
        />

        {/* Raport pasager – PROTEJAT */}
        <Route
          path="/raport/:personId"
          element={
            <Guard allow={['admin', 'operator_admin', 'agent']}>
              <PassengerReport />
            </Guard>
          }
        />

        {/* Administrare – PROTEJAT */}
        <Route
          path="/admin"
          element={
            <Guard allow={['admin', 'operator_admin', 'agent']}>
              <AdminPage />
            </Guard>
          }
        />

        {/* Rapoarte – PROTEJAT */}
        <Route
          path="/admin/reports"
          element={
            <Guard allow={['admin', 'operator_admin']}>
              <ReportsPage user={user} />
            </Guard>
          }
        />

        {/* Editor traseu – PROTEJAT DOAR ADMIN */}
        <Route
          path="/admin/routes/:id/edit"
          element={
            <Guard allow={['admin']}>
              <RouteEditorPage />
            </Guard>
          }
        />

        {/* Lista persoane – PROTEJAT */}
        <Route
          path="/pasageri"
          element={
            <Guard allow={['admin', 'operator_admin', 'agent']}>
              <PeopleList />
            </Guard>
          }
        />

        {/* Login – PUBLIC */}
        <Route
          path="/login"
          element={<LoginPage onLoggedIn={(info) => {
            setUser(info);
            setUserRole(info?.role || 'guest');
          }} />}
        />
        <Route path="/invita" element={<InviteAcceptPage />} />
        <Route path="/invita/:token" element={<InviteAcceptPage />} />
        {/* Log global – doar admin/operator_admin */}
        <Route
          path="/admin/log"
          element={
            <Guard allow={['admin', 'operator_admin']}>
              <AuditLog />
            </Guard>
          }

        />
        <Route path="/rezervare/:id" element={<ReservationDetails />} />
      </Routes>
    </Router>
  );
}

export default App;
