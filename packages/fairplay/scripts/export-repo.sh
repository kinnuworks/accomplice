#!/usr/bin/env bash
# Copies this package into a clean, standalone folder ready to become its own public repo.
# No workspace dependencies: the shared protocol types are inlined as src/types.ts.
# Usage: scripts/export-repo.sh [destination]   (default: /Users/kinnu/amazon/fairplay-export)
# This script never publishes, commits, or pushes anything.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROTOCOL="$HERE/../protocol/src/index.ts"
DEST="${1:-/Users/kinnu/amazon/fairplay-export}"
NAME="${FAIRPLAY_NPM_NAME:-fairplay}"

rm -rf "$DEST"
mkdir -p "$DEST"

# Source, tests, examples, docs, community files.
cp -R "$HERE/src" "$HERE/test" "$HERE/examples" "$HERE/docs" "$HERE/.github" "$DEST/"
mkdir -p "$DEST/scripts"
cp "$HERE/scripts/stats.ts" "$DEST/scripts/"
cp "$HERE"/{README.md,LICENSE,CHANGELOG.md,CONTRIBUTING.md,CODE_OF_CONDUCT.md,SECURITY.md,tsup.config.ts,vitest.config.ts} "$DEST/"

# Inline the case-related protocol types (everything before the game room types).
{
  echo "// Types for cases, clues, facts and reports. Originally shared with the Accomplice game."
  awk '/^export interface Player /{exit} {print}' "$PROTOCOL" | sed '1{/^\/\/ Shared types/d;}'
} > "$DEST/src/types.ts"

# Point imports at the inlined types.
sed -i.bak "s#'@accomplice/protocol'#'./types.js'#g" "$DEST"/src/*.ts
for d in test scripts examples; do
  find "$DEST/$d" -name '*.ts' -exec sed -i.bak "s#'@accomplice/protocol'#'../src/types.js'#g" {} +
done
find "$DEST" -name '*.bak' -delete

# The repo is the package, so CI and links work from the root.
cat > "$DEST/package.json" <<JSON
{
  "name": "$NAME",
  "version": "0.1.0",
  "description": "Murder mysteries that a logic solver proves fair: procedural cases with exactly one culprit, checked by Z3.",
  "keywords": ["mystery", "whodunit", "procedural generation", "puzzle", "z3", "smt", "game", "party game", "deduction"],
  "license": "MIT",
  "author": "Dhiraj Kavuri",
  "type": "module",
  "engines": { "node": ">=22" },
  "sideEffects": false,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./core": { "types": "./dist/core.d.ts", "import": "./dist/core.js" },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "LICENSE", "CHANGELOG.md", "docs/how-it-works.svg"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "stats": "tsx scripts/stats.ts",
    "example": "tsx examples/cli.ts",
    "prepublishOnly": "npm run typecheck && npm test && npm run build"
  },
  "dependencies": {
    "z3-solver": "^5.3.1"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsup": "^9.0.0",
    "tsx": "^4.23.15",
    "typescript": "^5.9.3",
    "vitest": "^5.0.5"
  }
}
JSON

cat > "$DEST/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM"],
    "types": ["node"]
  },
  "include": ["src", "test", "scripts", "examples"]
}
JSON

printf 'node_modules\ndist\n*.log\n.DS_Store\nstats.txt\n' > "$DEST/.gitignore"

echo "Exported to $DEST (npm name: $NAME). Next: cd $DEST && npm install && npm test"
