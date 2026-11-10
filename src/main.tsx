import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { title } from './config';
import './styles.css';

document.title = title;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
