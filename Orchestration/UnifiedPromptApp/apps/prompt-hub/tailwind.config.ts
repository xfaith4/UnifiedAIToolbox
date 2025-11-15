import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#b7d7ff',
          300: '#8fc0ff',
          400: '#61a4ff',
          500: '#3b86ff',
          600: '#2f69db',
          700: '#274fb1',
          800: '#203f8a',
          900: '#1c356f'
        }
      },
      boxShadow: {
        'soft': '0 10px 25px -10px rgba(0,0,0,0.25)'
      },
      borderRadius: {
        '2xl': '1rem'
      }
    }
  },
  plugins: [],
} satisfies Config
