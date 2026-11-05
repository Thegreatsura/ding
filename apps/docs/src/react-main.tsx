import { createRoot } from 'react-dom/client';
import { Toaster } from 'ding-react';
import { mountSite } from './site';

mountSite(document.getElementById('site')!, 'react');
createRoot(document.getElementById('app')!).render(<Toaster />);
