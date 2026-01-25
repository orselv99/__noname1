import './utils/polyfills';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initChatOpListener } from './services/p2p/ChatOpListener';

// Initialize Global Listeners
initChatOpListener();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
