import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  compressHTML: false,
  integrations: [starlight({
    title: 'Example docs',
    pagefind: false,
  })]
});
