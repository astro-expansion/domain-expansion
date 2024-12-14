import fsMod from 'node:fs';
import type { AstroSettings, ManifestData } from '../../types/astro.js';
import type { AstroInlineConfig } from '../../types/public/config.js';
import type { Logger } from '../logger/core.js';
export type SyncOptions = {
    mode: string;
    logger: Logger;
    settings: AstroSettings;
    force?: boolean;
    skip?: {
        content?: boolean;
        cleanup?: boolean;
    };
    manifest: ManifestData;
};
export default function sync(inlineConfig: AstroInlineConfig, { fs, telemetry: _telemetry }?: {
    fs?: typeof fsMod;
    telemetry?: boolean;
}): Promise<void>;
/**
 * Clears the content layer and content collection cache, forcing a full rebuild.
 */
export declare function clearContentLayerCache({ settings, logger, fs, }: {
    settings: AstroSettings;
    logger: Logger;
    fs?: typeof fsMod;
}): Promise<void>;
/**
 * Generates TypeScript types for all Astro modules. This sets up a `src/env.d.ts` file for type inferencing,
 * and defines the `astro:content` module for the Content Collections API.
 *
 * @experimental The JavaScript API is experimental
 */
export declare function syncInternal({ mode, logger, fs, settings, skip, force, manifest, }: SyncOptions): Promise<void>;
