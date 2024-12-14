import nodeFs from 'node:fs';
import * as vite from 'vite';
import type { AstroSettings, ManifestData } from '../types/astro.js';
import type { SSRManifest } from './app/types.js';
import type { Logger } from './logger/core.js';
type CreateViteOptions = {
    settings: AstroSettings;
    logger: Logger;
    mode: string;
    fs?: typeof nodeFs;
    sync: boolean;
    manifest: ManifestData;
    ssrManifest?: SSRManifest;
} & ({
    command: 'dev';
    ssrManifest: SSRManifest;
} | {
    command: 'build';
    ssrManifest?: SSRManifest;
});
/** Return a base vite config as a common starting point for all Vite commands. */
export declare function createVite(commandConfig: vite.InlineConfig, { settings, logger, mode, command, fs, sync, manifest, ssrManifest }: CreateViteOptions): Promise<vite.InlineConfig>;
export {};
