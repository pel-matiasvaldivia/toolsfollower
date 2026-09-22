/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        graphite: {
          50: '#f6f7f9', 100: '#eceef2', 200: '#d4d9e2', 300: '#adb6c6',
          400: '#7f8ca4', 500: '#5e6b85', 600: '#48546c', 700: '#3b4457',
          800: '#2b313f', 900: '#0e1116', 950: '#080a0e',
        },
        amber: {
          400: '#fbbf24', 500: '#f59e0b', 600: '#e08600',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
