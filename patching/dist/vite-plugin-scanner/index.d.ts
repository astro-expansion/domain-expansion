import type { Plugin as VitePlugin } from 'vite';
import type { Logger } from '../core/logger/core.js';
import type { AstroSettings, ManifestData } from '../types/astro.js';
export interface AstroPluginScannerOptions {
    settings: AstroSettings;
    logger: Logger;
    manifest: ManifestData;
}
export default function astroScannerPlugin({ settings, logger, manifest, }: AstroPluginScannerOptions): VitePlugin;
