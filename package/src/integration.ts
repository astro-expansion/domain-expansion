import { addVitePlugin, defineIntegration } from "astro-integration-kit";
import { interceptorPlugin } from "./interceptor.ts";

export const integration = defineIntegration({
	name: "@domain-expansion/astro",
	setup() {
		return {
			hooks: {
				'astro:config:setup': (params) => {
					if (params.command !== 'build') return;

					addVitePlugin(params, {
						plugin: interceptorPlugin(),
						warnDuplicated: true,
					});
				},
			},
		};
	},
});
