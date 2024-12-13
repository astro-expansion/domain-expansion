import tailwind from "@astrojs/tailwind";
import { createResolver } from "astro-integration-kit";
import { hmrIntegration } from "astro-integration-kit/dev";
import { defineConfig } from "astro/config";

const { default: packageName } = await import("@domain-expansion/astro");

// https://astro.build/config
export default defineConfig({
	compressHTML: false,
	integrations: [
		tailwind(),
		packageName(),
		hmrIntegration({
			directory: createResolver(import.meta.url).resolve("../package/dist"),
		}),
	],
});
