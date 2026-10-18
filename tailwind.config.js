/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        lux: {
          dark: '#0a0d14',
          card: '#111520',
          panel: '#161c2b',
          border: '#232b3e',
          hover: '#1e2638',
          accent: '#00f0ff', // Lux neon cyan
          bull: '#08d486',   // Lux bullish emerald green
          bear: '#ff3366',   // Lux bearish neon red
          fvg: '#f59e0b',    // Lux FVG amber/gold
          discount: '#10b981',
          premium: '#f43f5e',
          eq: '#8b5cf6',
          muted: '#94a3b8'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    },
  },
  plugins: [],
}
