import { addVitePlugin, defineIntegration } from "astro-integration-kit";
import { interceptorPlugin } from "./interceptor.js";

export const integration = defineIntegration({
	name: "@domain-expansion/astro",
	setup() {
		const routeEntrypoints: string[] = [];

		return {
			hooks: {
				'astro:config:setup': (params) => {
					if (params.command !== 'build') return;

					addVitePlugin(params, {
						plugin: interceptorPlugin(params.config, routeEntrypoints),
						warnDuplicated: true,
					});
				},
				'astro:routes:resolved': (params) => {
					routeEntrypoints.push(...params.routes.map(route => route.entrypoint));
				}
			},
		};
	},
});
