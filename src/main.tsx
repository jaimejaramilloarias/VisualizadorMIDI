import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('No se encontró el contenedor principal de la aplicación.');
}

createRoot(root).render(<App />);
