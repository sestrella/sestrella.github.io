// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	redirects: {
		'/contributions': '/contributions/years',
	},
	trailingSlash: 'never',
});
