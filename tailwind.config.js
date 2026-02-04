/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        'axis-blue': '#1E40AF',
        'axis-blue-light': '#3B82F6',
        'axis-blue-dark': '#1E3A8A',
      },
    },
  },
  plugins: [],
}
