// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import catppuccin from 'starlight-theme-catppuccin';
import domainExpansion from '@domain-expansion/astro';

import node from '@astrojs/node';
import starlightImageZoomPlugin from 'starlight-image-zoom';

import react from '@astrojs/react';

import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
	site: 'https://domainexpansion.gg',
	server: {
		host: '0.0.0.0',
	},
	integrations: [
		domainExpansion(),
		starlight({
			title: 'Domain Expansion',
			social: {
				github: 'https://github.com/astro-expansion/domain-expansion',
			},
			sidebar: [
				{ label: 'Installation', slug: '' },
				{ label: 'Configuration', slug: 'configuration' },
				{ label: 'The Tale of the Three Mages', slug: 'the-tale-of-the-three-mages' },
				{ label: 'An actual explanation of what is going on here', slug: 'actual-explanation' },
				{ label: 'Caveats', slug: 'caveats' },
				{ label: 'El funny', slug: 'memes' },
			],
			plugins: [
				catppuccin({ dark: 'mocha-teal', light: 'latte-teal' }),
				starlightImageZoomPlugin(),
			],
			components: {
				Head: './src/overrides/Head.astro',
			},
			customCss: ['src/styles/globals.css'],
		}),
		react(),
		tailwind({ applyBaseStyles: false }),
	],

	adapter: node({
		mode: 'standalone',
	}),
});
