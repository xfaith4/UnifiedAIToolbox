/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        phi: {
          50:  '#f0f9f4',
          100: '#d3f0e1',
          500: '#10a660',
          700: '#0b7043',
          900: '#073d26',
        },
      },
    },
  },
  plugins: [],
}
