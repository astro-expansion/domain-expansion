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

echo "New temporary diretory created at: $temp_dir"

cd "$temp_dir"

echo "Cloning benchmark repositories..."

git clone --depth 1 https://github.com/withastro/docs &> /dev/null &
git clone --depth 1 https://github.com/zen-browser/www zen-browser &> /dev/null &
git clone --depth 1 https://github.com/withstudiocms/ui &> /dev/null &
git clone --depth 1 https://github.com/eliancodes/brutal &> /dev/null &
git clone --depth 1 https://github.com/withastro/starlight &> /dev/null &
git clone --depth 1 https://github.com/cloudflare/cloudflare-docs &> /dev/null &

wait

echo "Done!"

cd zen-browser

echo "Running setup for zen-browser"

pnpm install &> /dev/null
pnpm build &> /dev/null

echo "Setup for zen-browser done!"

hyperfine \
  --export-markdown "$ROOT/.results/zen-browser.md" \
  --prepare '' \
  -n '[Zen Browser Website] Normal Build' \
  'pnpm build' \
  --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
  -n '[Zen Browser Website] Domain Expansion (cold build)' \
  'pnpm build' \
  --prepare '' \
  -n '[Zen Browser Website] Domain Expansion (hot build)' \
  'pnpm build'

cd ../ui/docs

echo "Running setup for studiocms-ui"

pnpm install &> /dev/null
pnpm build &> /dev/null

echo "Setup for studiocms-ui done!"

hyperfine \
  --export-markdown "$ROOT/.results/studiocms-ui.md" \
  --prepare '' \
  -n '[StudioCMS UI Docs] Normal Build' \
  'pnpm astro build' \
  --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
  -n '[StudioCMS UI Docs] Domain Expansion (cold build)' \
  'pnpm astro build' \
  --prepare '' \
  -n '[StudioCMS UI Docs] Domain Expansion (hot build)' \
  'pnpm astro build'

cd ../../brutal

echo "Running setup for brutal"

pnpm install &> /dev/null
pnpm build &> /dev/null

echo "Setup for brutal done!"

hyperfine \
  --export-markdown "$ROOT/.results/brutal.md" \
  -n '[Brutal Theme] Normal Build' \
  --prepare '' \
  'pnpm build' \
  --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
  -n '[Brutal Theme] Domain Expansion (cold build)' \
  'pnpm build' \
  --prepare '' \
  -n '[Brutal Theme] Domain Expansion (hot build)' \
  'pnpm build'

cd ../starlight/docs

echo "Running setup for starlight"

pnpm install &> /dev/null
pnpm build &> /dev/null

echo "Setup for starlight done!"

hyperfine \
  --export-markdown "$ROOT/.results/starlight.md" \
  --prepare '' \
  -n '[Starlight Docs] Normal Build' \
  'pnpm build' \
  --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
  -n '[Starlight Docs] Domain Expansion (cold build)' \
  'pnpm build' \
  --prepare '' \
  -n '[Starlight Docs] Domain Expansion (hot build)' \
  'pnpm build'

cd ../../cloudflare-docs

echo "Running setup for cloudflare-docs"

npm install &> /dev/null
npm run build &> /dev/null

echo "Setup for cloudflare-docs done!"

hyperfine \
  --export-markdown "$ROOT/.results/cloudflare-docs.md" \
  --runs 3 \
  --prepare '' \
  -n '[Cloudflare Docs] Normal Build' \
  'npm run build' \
  --prepare 'npx astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
  -n '[Cloudflare Docs] Domain Expansion (cold build)' \
  'npm run build' \
  --prepare '' \
  -n '[Cloudflare Docs] Domain Expansion (hot build)' \
  'npm run build'

cd ../docs


echo "Running setup for astro-docs"

export NODE_OPTIONS=--max-old-space-size=12192 SKIP_OG=true;

pnpm install &> /dev/null
pnpm build &> /dev/null

echo "Setup for astro-docs done!"

hyperfine \
  --export-markdown "$ROOT/.results/astro-docs.md" \
  --runs 3 \
  --prepare '' \
  -n '[Astro Docs] Normal Build' \
  'pnpm build' \
  --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
  -n '[Astro Docs] Domain Expansion (cold build)' \
  'pnpm build' \
  --prepare '' \
  -n '[Astro Docs] Domain Expansion (hot build)' \
  'pnpm build'

cd "$ROOT"

rm -rf "$temp_dir"

echo ""
echo "$temp_dir deleted"
echo ""