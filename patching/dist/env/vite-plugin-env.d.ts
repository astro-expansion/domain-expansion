import type { Plugin } from 'vite';
import type { AstroSettings } from '../types/astro.js';
import type { EnvLoader } from './env-loader.js';
interface AstroEnvPluginParams {
    settings: AstroSettings;
    mode: string;
    sync: boolean;
    envLoader: EnvLoader;
}
export declare function astroEnv({ settings, mode, sync, envLoader }: AstroEnvPluginParams): Plugin;
export {};
