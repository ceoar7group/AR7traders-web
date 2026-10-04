import { useEffect, useReducer } from 'react';
import { onMachineryChange, isMachineryHydrated } from './machinery-data.js';

// Re-render when the CRM's machines land.
//
// Why this lives in its own file: src/machinery-data.js is imported by
// api/_machinery.js (for MACHINE_TYPES), so it runs inside a Vercel function
// and must stay free of React and the DOM. The subscription primitive
// (onMachineryChange) is therefore pure and lives there; this thin hook — the
// only piece that touches React — lives here, where both main.jsx and
// machinery.jsx can import it without a cycle.
//
// Without it, a page mounted before the fetch resolved would keep rendering
// the built-in fallback until the visitor navigated away and back.

export function useMachineryVersion() {
  const [, bump] = useReducer(n => n + 1, 0);
  useEffect(() => onMachineryChange(bump), []);
  return isMachineryHydrated();
}
