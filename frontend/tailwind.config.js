/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        saas: {
          bg: '#F5F7FA',
          card: '#FFFFFF',
          text: '#172033',
          secondary: '#697586',
          muted: '#8A94A6',
          primary: '#4778D5',
          primaryHover: '#3B68BF',
          softBlue: '#EAF1FC',
          softGreen: '#76B89A',
          border: '#E5EAF0',
          subtle: '#F8FAFC',
        },
        risk: {
          low: '#2E9E5B',
          moderate: '#D97706',
          high: '#EA580C',
          severe: '#DC2626',
          noTravel: '#991B1B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'saas-sm': '0 1px 2px 0 rgba(16, 24, 40, 0.05)',
        'saas': '0 1px 3px 0 rgba(16, 24, 40, 0.08), 0 1px 2px -1px rgba(16, 24, 40, 0.08)',
        'saas-md': '0 4px 6px -1px rgba(16, 24, 40, 0.08), 0 2px 4px -2px rgba(16, 24, 40, 0.04)',
        'saas-lg': '0 10px 15px -3px rgba(16, 24, 40, 0.08), 0 4px 6px -4px rgba(16, 24, 40, 0.04)',
      },
    },
  },
  plugins: [],
}
