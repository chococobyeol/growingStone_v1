module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ['IM_Hyemin-Regular', 'sans-serif']
      },
      typography: {
        DEFAULT: {
          css: {
            h1: {
              fontSize: 'inherit',
              fontWeight: 'inherit',
            },
            h2: {
              fontSize: 'inherit',
              fontWeight: 'inherit',
            },
          },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')]
}
