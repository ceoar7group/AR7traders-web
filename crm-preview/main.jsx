// Standalone CRM entry point — used only for isolated UI/UX preview.
// Mounts the same CrmApp component the website serves at #crm, with no
// marketing site around it, so the CRM can be tested in its own tab.
import React from 'react';
import {createRoot} from 'react-dom/client';
import CrmApp from '../src/crm.jsx';
import '../src/styles.css';

createRoot(document.getElementById('root')).render(<CrmApp/>);
