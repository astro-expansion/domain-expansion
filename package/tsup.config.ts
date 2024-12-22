import { defineConfig } from "tsup";
import { peerDependencies, dependencies, devDependencies } from "./package.json";

export default defineConfig((options) => {
	const dev = !!options.watch;
	return {
		entry: ["src/index.ts"],
		format: ["esm"],
		target: "node18",
		bundle: true,
		dts: true,
		sourcemap: true,
		clean: true,
		splitting: false,
		minify: !dev,
		noExternal: Object.keys(devDependencies),
		external: [
			...Object.keys(peerDependencies),
			...Object.keys(dependencies),
			/node_modules/g,
			'recast',
			'tslib',
		],
		tsconfig: "tsconfig.json",
		treeshake: 'smallest',
	};
});
