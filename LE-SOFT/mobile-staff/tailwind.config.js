/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: '#ffffff',
        surface: '#f8fafc',
        primary: '#000000',
        secondary: '#64748b',
        accent: '#3b82f6',
        border: '#e2e8f0',
      },
    },
  },
  plugins: [],
}
