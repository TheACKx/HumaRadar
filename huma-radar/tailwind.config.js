/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#06040B',
        abyss: '#0A0713',
        panel: '#100B1D',
        raised: '#160F27',
        hairline: '#241A3A',
        muted: '#8A7FA8',
        dim: '#5D5478',
        plum: {
          50: '#F6F1FE', 100: '#EDE3FD', 200: '#DCC8FB', 300: '#C4A2F7',
          400: '#A974F1', 500: '#9146E8', 600: '#7C2FD6', 700: '#6822B4',
          800: '#551E90', 900: '#451B74', 950: '#2A0E4D',
        },
        gain: '#34D8A0',
        loss: '#FF5C7A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(145,70,232,0.25), 0 8px 40px -8px rgba(145,70,232,0.45)',
        'glow-sm': '0 0 24px -6px rgba(145,70,232,0.55)',
        panel: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 24px 64px -32px rgba(0,0,0,0.9)',
      },
      keyframes: {
        sweep: { '0%': { transform: 'rotate(0deg)' }, '100%': { transform: 'rotate(360deg)' } },
        rise: { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slidein: { '0%': { opacity: '0', transform: 'translateX(24px)' }, '100%': { opacity: '1', transform: 'translateX(0)' } },
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        sweep: 'sweep 4s linear infinite',
        rise: 'rise .35s cubic-bezier(.2,.8,.2,1) both',
        slidein: 'slidein .28s cubic-bezier(.2,.8,.2,1) both',
        pulseDot: 'pulseDot 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
