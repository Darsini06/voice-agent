import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

console.log('1. main.tsx is running');
const rootElement = document.getElementById('root');
console.log('2. Root element:', rootElement);

if (rootElement) {
  console.log('3. Creating root');
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  console.log('4. Render called');
} else {
  console.error('Root element not found!');
}