// Official brand glyphs.
//
// lucide's MessageCircle is a generic speech bubble — using it for WhatsApp
// makes the button look unofficial. This is WhatsApp's real mark: the rounded
// speech balloon with the notched tail and the handset inside.
//
// Drawn as a single filled path so it inherits `color` from CSS like a lucide
// icon does (fill:currentColor, no stroke), and scales cleanly at any size.
import React from 'react';

export function WhatsAppIcon({size = 24, ...rest}) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size}
         fill="currentColor" stroke="none" aria-hidden="true"
         focusable="false" {...rest}>
      <path d="M16.004 0h-.008C7.174 0 .002 7.174.002 16c0 3.5 1.128 6.744 3.046 9.376L1.05 31.34l6.17-1.972A15.9 15.9 0 0 0 16.004 32C24.83 32 32 24.826 32 16S24.83 0 16.004 0Zm9.31 22.594c-.386 1.09-1.918 1.994-3.14 2.258-.836.178-1.928.32-5.604-1.204-4.702-1.948-7.73-6.726-7.966-7.036-.226-.31-1.9-2.53-1.9-4.826s1.166-3.424 1.636-3.904c.386-.394.024-.618.792-.618.248 0 .47.012.67.022.47.02.706.048 1.016.79.386.93 1.326 3.226 1.438 3.462.114.236.228.556.068.866-.15.32-.282.462-.518.734-.236.272-.46.48-.696.772-.216.254-.46.526-.188.996.272.46 1.212 1.994 2.594 3.226 1.784 1.588 3.23 2.094 3.749 2.31.386.16.846.122 1.128-.178.358-.386.8-1.026 1.25-1.656.32-.452.724-.508 1.148-.348.432.15 2.718 1.28 3.188 1.514.47.236.78.348.894.546.112.198.112 1.132-.274 2.222Z"/>
    </svg>
  );
}
