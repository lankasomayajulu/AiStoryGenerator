import React from 'react';
import { Outlet } from 'react-router-dom';
import StatusBar from './StatusBar';
import './AppLayout.css';

const AppLayout = () => {
  return (
    <div className="app-layout">
      <main className="app-layout-content">
        <Outlet />
      </main>
      <StatusBar />
    </div>
  );
};

export default AppLayout;
