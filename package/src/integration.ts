import { defineIntegration } from "astro-integration-kit";

export const integration = defineIntegration({
	name: "@domain-expansion/astro",
	setup() {
		return {
			hooks: {},
		};
	},
});
