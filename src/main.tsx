import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {AnalyticsConsentBanner} from './components/common/AnalyticsConsentBanner.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <AnalyticsConsentBanner />
  </StrictMode>,
);
