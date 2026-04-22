/**
 * Zazi iZandi Mobile Branding (UI Spec)
 *
 * Tokens ported from the Zazi iZandi Next.js website
 * (Zazi_iZandi_Website_2026/zazi-izandi-nextjs/app/globals.css @theme block).
 *
 * Design Principles:
 * - Blue is the default UI color for headers, nav/tabs, primary buttons, links, active states
 * - Red is for emphasis only: key highlights, important callouts, critical moments
 * - Yellow is accent-only: badges, small highlights, icons, dividers, progress accents
 * - Green is semantic-only: success states, progress, "completed" indicators
 *
 * Screen-level rule: Use 1 dominant color (usually blue) + neutrals + max 1 accent
 * Avoid using blue + red + yellow + green all together on one screen (no rainbow UI)
 *
 * Overall vibe: Calm, trustworthy, professional, impact-oriented
 */

export const colors = {
  // Brand Colors (ZZ palette)
  primary: '#2c5aa0',        // ZZ Blue (Primary UI) — headers, nav, buttons, links
  primaryLight: '#5688d6',   // ZZ Blue (primary-500) — gradients, lighter accents
  primaryDark: '#2a4d85',    // ZZ Blue (primary-800) — hover/pressed states
  emphasis: '#e74c3c',       // ZZ Red (Brand/Emphasis) — highlights, callouts
  accent: '#ffd641',         // ZZ Yellow (Accent) — badges, icons, dividers
  accentDeep: '#f1c40f',     // ZZ Yellow (btn-secondary) — deeper yellow for buttons
  success: '#3FA535',        // Green (Success) — completed, progress

  // Semantic Colors
  error: '#e74c3c',          // Use brand red for errors
  warning: '#ffd641',        // Use brand yellow for warnings
  info: '#2c5aa0',           // Use brand blue for info

  // Neutrals (for calm, professional feel)
  background: '#F7F7F7',     // Main background
  surface: '#FFFFFF',        // Card/modal background
  cardBackground: '#FAFAFA', // Alternative card background

  // Text Colors
  text: '#111111',           // Primary text
  textSecondary: '#6B7280',  // Secondary text

  // UI Elements
  border: '#E5E7EB',         // Borders/dividers
  disabled: '#9CA3AF',       // Disabled state
  placeholder: '#9CA3AF',    // Placeholder text

  // Component-specific
  tabActive: '#2c5aa0',      // Active tab color
  tabInactive: '#6B7280',    // Inactive tab color
};

// Shared gradient (used by Home, Login, and any future hero/header surfaces)
// Defining it once here prevents drift when brand palette changes.
export const GRADIENT = [colors.primaryLight, colors.emphasis];

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
};
