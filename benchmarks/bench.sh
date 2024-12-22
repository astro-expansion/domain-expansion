#! /usr/bin/bash

rm -rf */

# Check if the directory was created
if [ ! -d ".results" ]; then
  mkdir .results
fi

ROOT=$PWD

# Create a temporary directory
temp_dir=$(mktemp -d)

# Check if the directory was created
if [ ! -d "$temp_dir" ]; then
  echo "Failed to create temp directory"
  exit 1
fi

cd "$temp_dir"

git clone --depth 1 https://github.com/withastro/docs &
# git clone --depth 1 https://github.com/zen-browser/www zen-browser &
# git clone --depth 1 https://github.com/withstudiocms/ui &
# git clone --depth 1 https://github.com/eliancodes/brutal &
# git clone --depth 1 https://github.com/withastro/starlight &
# git clone --depth 1 https://github.com/cloudflare/cloudflare-docs &

wait

cd docs

hyperfine \
  --show-output \
  --setup "export NODE_OPTIONS=--max-old-space-size=12192 SKIP_OG=true; pnpm install && pnpm build" \
  --export-markdown "$ROOT/.results/astro-docs.md" \
  --runs 1 \
  --prepare 'export NODE_OPTIONS=--max-old-space-size=12192 SKIP_OG=true;' \
  -n '[Astro Docs] Normal Build' \
  'pnpm build' \
  --prepare 'export NODE_OPTIONS=--max-old-space-size=12192 SKIP_OG=true; pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
  -n '[Astro Docs] Domain Expansion (cold build)' \
  'pnpm build' \
  --prepare 'export NODE_OPTIONS=--max-old-space-size=12192 SKIP_OG=true;' \
  -n '[Astro Docs] Domain Expansion (hot build)' \
  'pnpm build'

# cd ../zen-browser

# hyperfine \
#   --setup "pnpm install && pnpm build" \
#   --export-markdown "$ROOT/.results/zen-browser.md" \
  # --prepare '' \
#   -n '[Zen Browser Website] Normal Build' \
#   'pnpm build' \
#   --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
#   -n '[Zen Browser Website] Domain Expansion (cold build)' \
#   'pnpm build' \
  # --prepare '' \
#   -n '[Zen Browser Website] Domain Expansion (hot build)' \
#   'pnpm build'

# cd ../ui/docs

# hyperfine \
#   --setup "pnpm install && pnpm build" \
#   --show-output \
#   --setup "pnpm install" \
#   --export-markdown "$ROOT/.results/studiocms-ui.md" \
#   -n '[StudioCMS UI Docs] Normal Build' \
#   'pnpm astro build' \
#   --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./docs/node_modules/.domain-expansion' \
#   -n '[StudioCMS UI Docs] Domain Expansion (cold build)' \
#   'pnpm astro build' \
#   -n '[StudioCMS UI Docs] Domain Expansion (hot build)' \
#   'pnpm astro build'

# cd ../../brutal

# hyperfine \
#   --setup "pnpm install && pnpm build" \
#   --export-markdown "$ROOT/.results/brutal.md" \
#   -n '[Brutal Theme] Normal Build' \
  # --prepare '' \
#   'pnpm build' \
#   --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
#   -n '[Brutal Theme] Domain Expansion (cold build)' \
#   'pnpm build' \
  # --prepare '' \
#   -n '[Brutal Theme] Domain Expansion (hot build)' \
#   'pnpm build'

# cd ../starlight/docs
# cd starlight/docs

# hyperfine \
#   --setup "pnpm install && pnpm build" \
#   --export-markdown "$ROOT/.results/starlight.md" \
#   --prepare '' \
#   -n '[Starlight Docs] Normal Build' \
#   'pnpm build' \
#   --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
#   -n '[Starlight Docs] Domain Expansion (cold build)' \
#   'pnpm build' \
#   --prepare '' \
#   -n '[Starlight Docs] Domain Expansion (hot build)' \
#   'pnpm build'

# cd ../../cloudflare-docs

# hyperfine \
#   --setup "pnpm install && pnpm build" \
#   --export-markdown "$ROOT/.results/cloudflare-docs.md" \
  # --prepare '' \
#   -n '[Cloudflare Docs] Normal Build' \
#   'npm run build' \
#   --prepare 'npx astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
#   -n '[Cloudflare Docs] Domain Expansion (cold build)' \
#   'npm run build' \
  # --prepare '' \
#   -n '[Cloudflare Docs] Domain Expansion (hot build)' \
#   'npm run build'

cd "$ROOT"

rm -rf "$temp_dir"