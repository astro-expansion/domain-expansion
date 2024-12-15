// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import catppuccin from "starlight-theme-catppuccin";

import node from '@astrojs/node';
import starlightImageZoomPlugin from 'starlight-image-zoom';

// https://astro.build/config
export default defineConfig({
	site: 'https://domainexpansion.gg',
  integrations: [
		starlight({
			title: 'Domain Expansion',
			social: {
				github: 'https://github.com/astro-expansion/domain-expansion',
			},
			sidebar: [
				{ label: 'Installation', slug: '' },
				{ label: 'The Tale of the Three Mages', slug: 'the-tale-of-the-three-mages' },
				{ label: 'An actual explanation of what is going on here', slug: 'actual-explanation' },
			],
			plugins: [
				catppuccin({ dark: 'mocha-teal', light: 'latte-teal' }),
				starlightImageZoomPlugin(),
			],
			components: {
				Head: './src/overrides/Head.astro',
			}
		}),
	],

  adapter: node({
    mode: 'standalone',
  }),
});