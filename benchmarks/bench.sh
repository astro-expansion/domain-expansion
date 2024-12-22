#! /usr/bin/bash

rm -rf */

mkdir .results

docker buildx build . -t domainexpansion-bench-image

# git clone --depth 1 https://github.com/withastro/docs &
# git clone --depth 1 https://github.com/zen-browser/www zen-browser &
git clone --depth 1 https://github.com/withstudiocms/ui &
# git clone --depth 1 https://github.com/eliancodes/brutal &
# git clone --depth 1 https://github.com/withastro/starlight &
# git clone --depth 1 https://github.com/cloudflare/cloudflare-docs &

wait

docker run -i --rm --name studiocms-ui -v $PWD/ui:/app domainexpansion-bench-image bash <<EOF &
cd /app/docs

mkdir .results

pnpm install
pnpm build

hyperfine \
  --export-markdown .results/studiocms-ui.md \
  -n '[StudioCMS UI Docs] Normal Build' \
  'pnpm build' \
  --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
  -n '[StudioCMS UI Docs] Domain Expansion (cold build)' \
  'pnpm build' \
  -n '[StudioCMS UI Docs] Domain Expansion (hot build)' \
  'pnpm build'
EOF

wait

cp -t .results */.results/*

# rm -rf */

# cd docs

# export NODE_OPTIONS=--max-old-space-size=8192
# export SKIP_OG=true

# pnpm install &> /dev/null
# pnpm build &> /dev/null # Used as warmup to populate asset cache

# hyperfine \
#   --export-markdown ../.results/astro-docs.md \
#   --runs 3 \
#   -n '[Astro Docs] Normal Build' \
#   'pnpm build' \
#   --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
#   -n '[Astro Docs] Domain Expansion (cold build)' \
#   'pnpm build' \
#   -n '[Astro Docs] Domain Expansion (hot build)' \
#   'pnpm build' &

# cd ../zen-browser

# pnpm install &> /dev/null
# pnpm build &> /dev/null # Used as warmup to populate asset cache

# hyperfine \
#   --export-markdown ../.results/zen-browser.md \
#   -n '[Zen Browser Website] Normal Build' \
#   'pnpm build' \
#   --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
#   -n '[Zen Browser Website] Domain Expansion (cold build)' \
#   'pnpm build' \
#   -n '[Zen Browser Website] Domain Expansion (hot build)' \
#   'pnpm build' &

# cd ../ui/docs

# cd ../../brutal

# pnpm install &> /dev/null
# pnpm build &> /dev/null # Used as warmup to populate asset cache

# hyperfine \
#   --export-markdown ../.results/brutal.md \
#   -n '[Brutal Theme] Normal Build' \
#   'pnpm build' \
#   --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
#   -n '[Brutal Theme] Domain Expansion (cold build)' \
#   'pnpm build' \
#   -n '[Brutal Theme] Domain Expansion (hot build)' \
#   'pnpm build' &

# cd ../starlight/docs

# pnpm install &> /dev/null
# pnpm build &> /dev/null # Used as warmup to populate asset cache

# hyperfine \
#   --export-markdown ../../.results/starlight.md \
#   -n '[Starlight Docs] Normal Build' \
#   'pnpm build' \
#   --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
#   -n '[Starlight Docs] Domain Expansion (cold build)' \
#   'pnpm build' \
#   -n '[Starlight Docs] Domain Expansion (hot build)' \
#   'pnpm build' &

# cd ../../cloudflare-docs

# npm install &> /dev/null
# npm run build &> /dev/null # Used as warmup to populate asset cache

# hyperfine \
#   --export-markdown ../.results/cloudflare-docs.md \
#   -n '[Cloudflare Docs] Normal Build' \
#   'npm run build' \
#   --prepare 'npx astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
#   -n '[Cloudflare Docs] Domain Expansion (cold build)' \
#   'npm run build' \
#   -n '[Cloudflare Docs] Domain Expansion (hot build)' \
#   'npm run build' &