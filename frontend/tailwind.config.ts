import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#ffffff',
          dark: '#0a0a0a',
        },
        foreground: {
          DEFAULT: '#171717',
          dark: '#ededed',
        },
      },
      fontFamily: {
        sans: ['Arial', 'Helvetica', 'sans-serif'],
      },
    },
  },
  plugins: [
    function ({ addBase, theme }: { addBase: (styles: Record<string, any>) => void; theme: (path: string) => any }) {
      addBase({
        'body': {
          color: theme('colors.foreground.DEFAULT'),
          backgroundColor: theme('colors.background.DEFAULT'),
          fontFamily: theme('fontFamily.sans'),
        },
        '@media (prefers-color-scheme: dark)': {
          'body': {
            color: theme('colors.foreground.dark'),
            backgroundColor: theme('colors.background.dark'),
          },
        },
      })
    },
  ],
  darkMode: 'media', // Uses prefers-color-scheme media query
}
export default config

