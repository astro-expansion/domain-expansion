import type { AstroSettings } from '../types/astro.js';
import type { AstroConfig } from '../types/public/config.js';
export declare function getPrerenderDefault(config: AstroConfig): boolean;
/**
 * Returns the correct output directory of the SSR build based on the configuration
 */
export declare function getOutputDirectory(settings: AstroSettings): URL;
