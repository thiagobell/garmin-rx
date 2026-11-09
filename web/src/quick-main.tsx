import React from 'react';
import ReactDOM from 'react-dom/client';
import { QuickAddPage } from './QuickAddPage';
import { I18nProvider } from './i18n';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <QuickAddPage />
    </I18nProvider>
  </React.StrictMode>
);
