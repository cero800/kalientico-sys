import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { iniciarRegistroErrores } from './services/logging';
import './index.css';

iniciarRegistroErrores();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
