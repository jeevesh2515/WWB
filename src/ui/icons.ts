// World War B: High-definition tactical vector icons for HUD, weapon slots, and augment cards.

const ICONS: Record<string, string> = {
  skull: `
    <path d="M18 10 C18 4 46 4 46 10 C54 13 56 22 56 32 C56 42 48 46 44 48 L44 56 C44 58 42 60 40 60 L24 60 C22 60 20 58 20 56 L20 48 C16 46 8 42 8 32 C8 22 10 13 18 10 Z" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M20 28 C20 33 26 35 28 31 C29 29 27 25 22 25 C20 25 20 27 20 28 Z" fill="currentColor"/>
    <path d="M44 28 C44 33 38 35 36 31 C35 29 37 25 42 25 C44 25 44 27 44 28 Z" fill="currentColor"/>
    <path d="M32 36 L30 43 L34 43 Z" fill="currentColor"/>
    <path d="M26 50 L26 58 M32 50 L32 58 M38 50 L38 58" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M12 22 L52 22" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 3" opacity="0.6"/>
  `,

  vampire: `
    <path d="M32 58 C32 58 12 42 12 24 C12 14 20 8 32 18 C44 8 52 14 52 24 C52 42 32 58 32 58 Z" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M6 18 C14 16 22 24 26 28 C22 24 16 22 8 26 C4 28 3 32 3 32 C3 32 4 24 6 18 Z" fill="currentColor"/>
    <path d="M58 18 C50 16 42 24 38 28 C42 24 48 22 56 26 C60 28 61 32 61 32 C61 32 60 24 58 18 Z" fill="currentColor"/>
    <path d="M26 28 L30 38 L32 34 L34 38 L38 28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="32" cy="26" r="3.5" fill="currentColor"/>
    <path d="M22 36 L24 46 L27 40 M42 36 L40 46 L37 40" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  plated: `
    <path d="M32 6 L54 14 L50 44 C48 52 32 60 32 60 C32 60 16 52 14 44 L10 14 Z" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M32 14 L46 19 L43 40 C41 46 32 52 32 52 C32 52 23 46 21 40 L18 19 Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="currentColor" fill-opacity="0.25"/>
    <line x1="32" y1="18" x2="32" y2="48" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    <line x1="22" y1="30" x2="42" y2="30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="24" y1="38" x2="40" y2="38" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="32" cy="18" r="1.5" fill="currentColor"/>
    <circle cx="32" cy="48" r="1.5" fill="currentColor"/>
  `,

  choke: `
    <circle cx="32" cy="32" r="26" stroke="currentColor" stroke-width="2" stroke-dasharray="4 3" opacity="0.5"/>
    <circle cx="32" cy="32" r="18" stroke="currentColor" stroke-width="2.5" fill="currentColor" fill-opacity="0.15"/>
    <circle cx="32" cy="32" r="6" stroke="currentColor" stroke-width="2" fill="currentColor" fill-opacity="0.5"/>
    <line x1="32" y1="2" x2="32" y2="12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <line x1="32" y1="52" x2="32" y2="62" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <line x1="2" y1="32" x2="12" y2="32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <line x1="52" y1="32" x2="62" y2="32" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <circle cx="28" cy="28" r="1.8" fill="currentColor"/>
    <circle cx="36" cy="28" r="1.8" fill="currentColor"/>
    <circle cx="32" cy="36" r="1.8" fill="currentColor"/>
  `,

  hollow: `
    <path d="M26 6 C26 6 32 2 38 6 L42 22 L42 56 C42 58 40 60 38 60 L26 60 C24 60 22 58 22 56 L22 22 Z" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M29 6 C30 11 34 11 35 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    <line x1="22" y1="28" x2="42" y2="28" stroke="currentColor" stroke-width="2"/>
    <line x1="22" y1="46" x2="42" y2="46" stroke="currentColor" stroke-width="2"/>
    <line x1="26" y1="53" x2="38" y2="53" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/>
    <path d="M12 18 L18 24 M12 36 L18 40 M52 18 L46 24 M52 36 L46 40" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,

  quick: `
    <path d="M38 4 L18 32 L32 32 L26 60 L50 26 L34 26 Z" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M10 20 L4 26 L10 32 M54 32 L60 38 L54 44" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="4" y1="26" x2="16" y2="26" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <line x1="48" y1="38" x2="60" y2="38" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,

  scavenger: `
    <rect x="10" y="20" width="44" height="34" rx="4" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2.5"/>
    <path d="M18 20 L24 8 L40 8 L46 20" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
    <line x1="10" y1="32" x2="54" y2="32" stroke="currentColor" stroke-width="2"/>
    <rect x="28" y="28" width="8" height="8" rx="1.5" fill="currentColor"/>
    <path d="M18 40 L24 46 L32 38 L40 46 L46 40" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6 14 C12 6 22 4 24 4 M58 14 C52 6 42 4 40 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
  `,

  overclock: `
    <circle cx="32" cy="32" r="24" stroke="currentColor" stroke-width="2.5" stroke-dasharray="28 6" fill="currentColor" fill-opacity="0.15"/>
    <circle cx="32" cy="32" r="14" stroke="currentColor" stroke-width="2"/>
    <path d="M32 32 L44 20" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <circle cx="32" cy="32" r="4" fill="currentColor"/>
    <path d="M22 10 L26 18 M42 10 L38 18 M10 32 L18 32 M54 32 L46 32 M18 46 L24 40 M46 46 L40 40" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  `,

  demolitions: `
    <ellipse cx="32" cy="36" rx="18" ry="22" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="2.5"/>
    <rect x="27" y="6" width="10" height="8" rx="2" stroke="currentColor" stroke-width="2.5" fill="currentColor"/>
    <path d="M22 10 C16 10 12 16 12 22 L14 26" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    <line x1="14" y1="36" x2="50" y2="36" stroke="currentColor" stroke-width="2"/>
    <line x1="18" y1="26" x2="46" y2="26" stroke="currentColor" stroke-width="2"/>
    <line x1="18" y1="46" x2="46" y2="46" stroke="currentColor" stroke-width="2"/>
    <line x1="32" y1="14" x2="32" y2="58" stroke="currentColor" stroke-width="2"/>
    <path d="M48 10 L56 6 M52 18 L60 20 M8 22 L2 24 M4 12 L10 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
  `,

  rifle: `
    <path d="M4 36 L14 36 L20 30 L48 30 L52 26 L60 26 L60 32 L48 34 L36 34 L32 46 L26 44 L28 36 L12 36 L6 42 Z" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <line x1="32" y1="26" x2="44" y2="26" stroke="currentColor" stroke-width="2"/>
    <rect x="30" y="36" width="6" height="12" rx="1" fill="currentColor" opacity="0.7"/>
    <circle cx="16" cy="36" r="1.5" fill="currentColor"/>
  `,

  shotgun: `
    <path d="M4 38 L16 38 L22 34 L58 34 L60 38 L48 40 L26 40 L20 48 L10 48 L6 42 Z" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <rect x="34" y="38" width="14" height="4" rx="1" fill="currentColor"/>
    <line x1="58" y1="32" x2="60" y2="32" stroke="currentColor" stroke-width="2"/>
  `,

  rocket: `
    <path d="M4 36 L18 36 L22 30 L54 30 L58 34 L54 38 L22 38 L18 44 L10 44 L6 38 Z" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M54 26 L62 34 L54 42 Z" fill="currentColor"/>
    <rect x="26" y="24" width="8" height="6" stroke="currentColor" stroke-width="1.5" fill="currentColor" opacity="0.5"/>
    <line x1="30" y1="38" x2="28" y2="48" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  `,

  grenade: `
    <ellipse cx="32" cy="36" rx="16" ry="20" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2.5"/>
    <rect x="28" y="8" width="8" height="8" rx="2" stroke="currentColor" stroke-width="2" fill="currentColor"/>
    <path d="M22 12 C18 12 16 16 16 22 L17 26" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
    <line x1="16" y1="36" x2="48" y2="36" stroke="currentColor" stroke-width="2"/>
    <line x1="32" y1="16" x2="32" y2="56" stroke="currentColor" stroke-width="2"/>
  `,

  shield: `
    <path d="M32 8 L52 14 L48 40 C46 48 32 56 32 56 C32 56 18 48 16 40 L12 14 Z" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 16 L44 20 L40 38 C38 44 32 48 32 48 C32 48 26 44 24 38 L20 20 Z" fill="currentColor" opacity="0.6"/>
  `,

  plus: `
    <rect x="25" y="10" width="14" height="44" rx="3" fill="currentColor"/>
    <rect x="10" y="25" width="44" height="14" rx="3" fill="currentColor"/>
  `,
}

export function renderIcon(name: string, cls = ''): string {
  const key = name.toLowerCase().trim()
  const svgContent = ICONS[key]
  if (svgContent) {
    return `<svg class="ico-svg ico-${key} ${cls}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${svgContent}</svg>`
  }
  // Safe image fallback with immediate onerror protection to prevent broken image squares
  return `<span class="ico-wrap ${cls}"><img class="ico-img" src="./assets/ui/icon_${key}.webp" alt="" onerror="this.src='./assets/ui/icon_${key}.png';this.onerror=null;" /></span>`
}
