import { createRoot } from 'react-dom/client';
import '@fontsource/playfair-display/latin-600.css';
import '@fontsource/playfair-display/latin-800.css';
import '@fontsource/playfair-display/latin-600-italic.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/caveat/latin-500.css';
import '@fontsource/caveat/latin-700.css';
import './styles/base.css';
import './styles/screens.css';
import { App } from './App';
import { installTextures } from './art/textures';
import { reducedMotion } from './env';

installTextures();
if (reducedMotion()) document.documentElement.classList.add('reduced-motion');
createRoot(document.getElementById('root')!).render(<App />);
