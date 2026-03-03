/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefcf6',
          100: '#d7f8e8',
          200: '#b0f0d4',
          300: '#7ce4b7',
          400: '#42d193',
          500: '#1eb775',
          600: '#12965f',
          700: '#11774d',
          800: '#125e40',
          900: '#114d36'
        }
      }
    }
  },
  plugins: []
}
