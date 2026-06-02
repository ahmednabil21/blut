/** @type {import('tailwindcss').Config} */

/** اللون الأساسي #4AB1D4 — يُستخدم أيضاً بدل violet/purple/indigo في الواجهة */
const brandPrimary = {
  50: '#eef9fc',
  100: '#dff2f8',
  200: '#bfe5f1',
  300: '#8fd4e8',
  400: '#6bc3de',
  500: '#4AB1D4',
  600: '#3a9bbf',
  700: '#2e809f',
  800: '#276882',
  900: '#1f5368',
  950: '#143544',
};

/** اللون الثانوي #ffc73f */
const brandSecondary = {
  50: '#fffbf0',
  100: '#fff4d6',
  200: '#ffe9ad',
  300: '#ffdc80',
  400: '#ffd05a',
  500: '#ffc73f',
  600: '#e6a81a',
  700: '#bf850f',
  800: '#996910',
  900: '#735010',
  950: '#4a3408',
};

module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontWeight: {
        normal: '500',
        medium: '600',
        semibold: '700',
        bold: '800',
        extrabold: '900',
      },
      fontFamily: {
        sans: ['Cairo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        cairo: ['Cairo', 'sans-serif'],
      },
      colors: {
        primary: brandPrimary,
        secondary: brandSecondary,
        violet: brandPrimary,
        purple: brandPrimary,
        indigo: brandPrimary,
      },
    },
  },
  plugins: [],
};
