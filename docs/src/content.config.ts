import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { file } from 'astro/loaders';

const benchmarkSchema = z.object({
	id: z.number(),
	name: z.string(),
	url: z.string(),
	benchmark: z.object({
		means: z.object({
			standard: z.number(),
			cold: z.number(),
			hot: z.number(),
		})
	})
});

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
	benchmark: defineCollection({ loader: file("src/content/benchmark/results.json"), schema: benchmarkSchema }),
};
