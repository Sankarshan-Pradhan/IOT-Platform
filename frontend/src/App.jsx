import React, { useState, useEffect } from 'react';
import AuthScreen from './components/AuthScreen';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';
import { logout } from './api';

export default function App() {
  // Always lock to clean Enterprise Light Mode
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('iot_theme');
  }, []);

  // Use sessionStorage so any new browser session or fresh visit to http://localhost:3000 lands on Login Page
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const sessionUser = sessionStorage.getItem('iot_user');
      return sessionUser ? JSON.parse(sessionUser) : null;
    } catch (e) {
      return null;
    }
  });

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    sessionStorage.setItem('iot_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    logout();
    sessionStorage.removeItem('iot_user');
    sessionStorage.removeItem('iot_jwt_token');
    localStorage.removeItem('iot_user');
    localStorage.removeItem('iot_jwt_token');
    setCurrentUser(null);
  };

  // 1. If not authenticated -> ALWAYS show Login / Registration Page first
  if (!currentUser) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // 2. If Admin -> Route to dedicated Admin Page
  if (currentUser.role === 'admin') {
    return <AdminDashboard currentUser={currentUser} onLogout={handleLogout} />;
  }

  // 3. If Regular User -> Route to dedicated User Page
  return <UserDashboard currentUser={currentUser} onLogout={handleLogout} />;
}
