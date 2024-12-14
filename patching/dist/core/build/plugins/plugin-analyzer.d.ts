import type { Plugin as VitePlugin } from 'vite';
import type { BuildInternals } from '../internal.js';
import type { AstroBuildPlugin } from '../plugin.js';
export declare function vitePluginAnalyzer(internals: BuildInternals): VitePlugin;
export declare function pluginAnalyzer(internals: BuildInternals): AstroBuildPlugin;
