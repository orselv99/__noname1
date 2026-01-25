import './utils/polyfills';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { initChatOpListener } from './services/p2p/ChatOpListener';

// Initialize Global Listeners
initChatOpListener();

// Initialize Stores (Hydration from DB)
import { useAuthStore } from './stores/authStore';
import { useAlarmStore } from './stores/alarmStore';
import { useContentStore } from './stores/contentStore';

const initStores = async () => {
  await useAuthStore.getState().initialize();
  await useAlarmStore.getState().loadAlarms();
  await useContentStore.getState().fetchDocuments();
};

initStores();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
