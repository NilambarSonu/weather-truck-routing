/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        risk: {
          low: '#2E9E5B',
          moderate: '#F2C230',
          high: '#F08A24',
          severe: '#D93A2B',
          noTravel: '#1B1B1B',
        },
        slate: {
          850: '#151e2e',
          950: '#0b0f19',
        }
      },
    },
  },
  plugins: [],
}
