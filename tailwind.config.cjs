/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter','system-ui','Avenir','Helvetica','Arial','sans-serif'] },
      boxShadow: { 'soft': '0 10px 40px rgba(0,0,0,0.3)' }
    },
  },
  plugins: [],
}
