// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  redirects: {
      '/contributions': '/contributions/years',
	},

  vite: {
    plugins: [tailwindcss()],
  },
});
