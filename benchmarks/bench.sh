#! /usr/bin/bash

###############################
# Setup
###############################

EXCLUED_BENCHMARKS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --exclude=*)
      excluded_list="${1#*=}" # Extract the value after '='
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

IFS=',' read -ra excluded_array <<< "$excluded_list"

is_excluded() {
  local item=$1
  for excluded in "${excluded_array[@]}"; do
    if [[ $excluded == "$item" ]]; then
      return 0 # Item is in the list
    fi
  done
  return 1 # Item is not in the list
}

# Create .results dir if it doesn't exits already
if [ ! -d ".results" ]; then
  mkdir .results
fi

ROOT=$PWD

# Colors
NO_FORMAT="\033[0m"
F_BOLD="\033[1m"
C_MEDIUMPURPLE1="\033[38;5;141m"
C_MEDIUMSPRINGGREEN="\033[38;5;49m"
C_RED="\033[38;5;9m"
F_UNDERLINED="\033[4m"
C_STEELBLUE1="\033[38;5;75m"

echo -e "${F_BOLD}${C_MEDIUMPURPLE1}\n[Benchmark Setup]${NO_FORMAT}"

temp_dir=$(mktemp -d)

if [ ! -d "$temp_dir" ]; then
  echo -e "\n${C_RED}[ERROR]${NO_FORMAT} Failed to create temp directory! Aborting...\n"
  exit 1
fi

echo -e "  ${F_BOLD}New temporary diretory created at:\n    ${C_STEELBLUE1}$temp_dir${NO_FORMAT}\n"
echo -e "  ${F_BOLD}Cloning benchmark repositories...${NO_FORMAT}"

cd "$temp_dir"

if ! is_excluded "astro-docs"; then 
  {
    git clone --depth 1 https://github.com/withastro/docs &> /dev/null
    echo -e "    Cloned ${C_STEELBLUE1}withastro/docs${NO_FORMAT}!"
  } &
fi

if ! is_excluded "zen-browser"; then 
  {
    git clone --depth 1 https://github.com/zen-browser/www zen-browser &> /dev/null
    echo -e "    Cloned ${C_STEELBLUE1}zen-browser/www${NO_FORMAT}!"
  } & 
fi

if ! is_excluded "studiocms-ui"; then 
  {
    git clone --depth 1 https://github.com/withstudiocms/ui &> /dev/null
    echo -e "    Cloned ${C_STEELBLUE1}withstudiocms/ui${NO_FORMAT}!"
  } & 
fi

if ! is_excluded "brutal"; then 
  {
    git clone --depth 1 https://github.com/eliancodes/brutal &> /dev/null
    echo -e "    Cloned ${C_STEELBLUE1}eliancodes/brutal${NO_FORMAT}!"
  } & 
fi

if ! is_excluded "starlight"; then 
  {
    git clone --depth 1 https://github.com/withastro/starlight &> /dev/null
    echo -e "    Cloned ${C_STEELBLUE1}withastro/starlight${NO_FORMAT}!"
  } & 
fi

if ! is_excluded "astro.build"; then 
  {
    git clone --depth 1 https://github.com/withastro/astro.build &> /dev/null
    echo -e "    Cloned ${C_STEELBLUE1}withastro/astro.build${NO_FORMAT}!"
  } & 
fi

wait

###############################
# zen-browser/www
###############################

if ! is_excluded "zen-browser"; then
  cd "$temp_dir/zen-browser"

  echo -e "\n${F_BOLD}Running Setup for ${C_STEELBLUE1}zen-browser/www${NO_FORMAT}${F_BOLD}...${NO_FORMAT}"

  echo -e "  Running ${C_STEELBLUE1}pnpm install${NO_FORMAT}..."
  yes | pnpm install &> /dev/null
  echo -e "    ${C_MEDIUMSPRINGGREEN}Done!${NO_FORMAT}"

  echo -e "  Running ${C_STEELBLUE1}pnpm build${NO_FORMAT} (to warm up)..."
  pnpm build &> /dev/null
  echo -e "    ${C_MEDIUMSPRINGGREEN}Done!${NO_FORMAT}\n"

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
fi

###############################
# withstudiocms/ui
###############################

if ! is_excluded "studiocms-ui"; then
  cd "$temp_dir/ui/docs"

  echo -e "\n${F_BOLD}Running Setup for ${C_STEELBLUE1}withstudiocms/ui${NO_FORMAT}${F_BOLD}...${NO_FORMAT}"

  echo -e "  Running ${C_STEELBLUE1}pnpm install${NO_FORMAT}..."
  yes | pnpm install &> /dev/null
  echo -e "    ${C_MEDIUMSPRINGGREEN}Done!${NO_FORMAT}"

  echo -e "  Running ${C_STEELBLUE1}pnpm build${NO_FORMAT} (to warm up)..."
  pnpm build &> /dev/null
  echo -e "    ${C_MEDIUMSPRINGGREEN}Done!${NO_FORMAT}\n"

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
fi

###############################
# eliancodes/brutal
###############################

if ! is_excluded "brutal"; then
  cd "$temp_dir/brutal"

  echo -e "\n${F_BOLD}Running Setup for ${C_STEELBLUE1}eliancodes/brutal${NO_FORMAT}${F_BOLD}...${NO_FORMAT}"

  echo -e "  Running ${C_STEELBLUE1}pnpm install${NO_FORMAT}..."
  yes | pnpm install &> /dev/null
  echo -e "    ${C_MEDIUMSPRINGGREEN}Done!${NO_FORMAT}"

  echo -e "  Running ${C_STEELBLUE1}pnpm build${NO_FORMAT} (to warm up)..."
  pnpm build &> /dev/null
  echo -e "    ${C_MEDIUMSPRINGGREEN}Done!${NO_FORMAT}\n"

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
fi

###############################
# withastro/starlight
###############################

if ! is_excluded "starlight"; then
  cd "$temp_dir/starlight/docs"

  echo -e "\n${F_BOLD}Running Setup for ${C_STEELBLUE1}withastro/starlight${NO_FORMAT}${F_BOLD}...${NO_FORMAT}"

  echo -e "  Running ${C_STEELBLUE1}pnpm install${NO_FORMAT}..."
  yes | pnpm install &> /dev/null
  echo -e "    ${C_MEDIUMSPRINGGREEN}Done!${NO_FORMAT}"

  echo -e "  Running ${C_STEELBLUE1}pnpm build${NO_FORMAT} (to warm up)..."
  pnpm build &> /dev/null
  echo -e "    ${C_MEDIUMSPRINGGREEN}Done!${NO_FORMAT}\n"

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
fi

###############################
# withastro/astro.build
###############################

if ! is_excluded "astro.build"; then
  cd "$temp_dir/astro.build"

  echo -e "\n${F_BOLD}Running Setup for ${C_STEELBLUE1}withastro/astro.build${NO_FORMAT}${F_BOLD}...${NO_FORMAT}"

  echo -e "  Running ${C_STEELBLUE1}pnpm install${NO_FORMAT}..."
  pnpm install &> /dev/null
  echo -e "    ${C_MEDIUMSPRINGGREEN}Done!${NO_FORMAT}"

  echo -e "  Running ${C_STEELBLUE1}pnpm astro build${NO_FORMAT} (to warm up)..."
  pnpm astro build &> /dev/null
  echo -e "    ${C_MEDIUMSPRINGGREEN}Done!${NO_FORMAT}\n"

  hyperfine \
    --export-markdown "$ROOT/.results/astro.build.md" \
    --prepare '' \
    -n '[astro.build] Normal Build' \
    'pnpm astro build' \
    --prepare 'npx astro add @domain-expansion/astro && rm -rf ./node_modules/.domain-expansion' \
    -n '[astro.build] Domain Expansion (cold build)' \
    'pnpm astro build' \
    --prepare '' \
    -n '[astro.build] Domain Expansion (hot build)' \
    'pnpm astro build'
fi

###############################
# withastro/docs
###############################

if ! is_excluded "astro-docs"; then
  cd "$temp_dir/docs"

  echo -e "\n${F_BOLD}Running Setup for ${C_STEELBLUE1}withastro/docs${NO_FORMAT}${F_BOLD}...${NO_FORMAT}"

  export NODE_OPTIONS=--max-old-space-size=12192 SKIP_OG=true;

  echo -e "  Running ${C_STEELBLUE1}pnpm install${NO_FORMAT}..."
  yes | pnpm install &> /dev/null
  echo -e "    ${C_MEDIUMSPRINGGREEN}Done!${NO_FORMAT}"

  echo -e "  Running ${C_STEELBLUE1}pnpm build${NO_FORMAT} (to warm up)..."
  pnpm build &> /dev/null
  echo -e "    ${C_MEDIUMSPRINGGREEN}Done!${NO_FORMAT}\n"

  hyperfine \
    --export-markdown "$ROOT/.results/astro-docs.md" \
    --runs 1 \
    --prepare '' \
    -n '[Astro Docs] Normal Build' \
    'pnpm build' \
    --prepare 'pnpm astro add @domain-expansion/astro -y && rm -rf ./node_modules/.domain-expansion' \
    -n '[Astro Docs] Domain Expansion (cold build)' \
    'pnpm build' \
    --prepare '' \
    -n '[Astro Docs] Domain Expansion (hot build)' \
    'pnpm build'
fi

###############################
# Cleanup
###############################

cd "$temp_dir"

# Calculate all folder sizes and print

echo -e "\n${F_BOLD}${C_MEDIUMPURPLE1}[Cache Size Summary]${NO_FORMAT}"

if ! is_excluded "zen-browser"; then 
  echo -e "${F_BOLD}${C_STEELBLUE1}zen-browser/www${NO_FORMAT}: $(du -sh zen-browser/node_modules/.domain-expansion | cut -f1)"
fi

if ! is_excluded "studiocms-ui"; then 
  echo -e "${F_BOLD}${C_STEELBLUE1}withstudiocms/ui${NO_FORMAT}: $(du -sh ui/docs/node_modules/.domain-expansion | cut -f1)"
fi

if ! is_excluded "brutal"; then 
  echo -e "${F_BOLD}${C_STEELBLUE1}eliancodes/brutal${NO_FORMAT}: $(du -sh brutal/node_modules/.domain-expansion | cut -f1)"
fi

if ! is_excluded "starlight"; then 
  echo -e "${F_BOLD}${C_STEELBLUE1}withastro/starlight${NO_FORMAT}: $(du -sh starlight/docs/node_modules/.domain-expansion | cut -f1)"
fi

if ! is_excluded "astro.build"; then 
  echo -e "${F_BOLD}${C_STEELBLUE1}withastro/astro.build${NO_FORMAT}: $(du -sh 'astro.build/node_modules/.domain-expansion' | cut -f1)"
fi

if ! is_excluded "astro-docs"; then 
  echo -e "${F_BOLD}${C_STEELBLUE1}withastro/docs${NO_FORMAT}: $(du -sh docs/node_modules/.domain-expansion | cut -f1)"
fi

cd "$ROOT"

rm -rf "$temp_dir"

echo ""
echo "$temp_dir deleted"
echo ""