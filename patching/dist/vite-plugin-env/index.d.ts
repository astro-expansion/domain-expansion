import type * as vite from 'vite';
import type { EnvLoader } from '../env/env-loader.js';
interface EnvPluginOptions {
    envLoader: EnvLoader;
}
export default function envVitePlugin({ envLoader }: EnvPluginOptions): vite.Plugin;
export {};
