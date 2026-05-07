#!/usr/bin/env bash
set -euo pipefail

echo "tota-agent — Publish"
echo "────────────────────────────"

PKG_NAME=$(node -p "require('./package.json').name")
PKG_VERSION=$(node -p "require('./package.json').version")

echo "Package: ${PKG_NAME}"
echo "Version: ${PKG_VERSION}"
echo ""

echo "1/6 Type checking..."
npm run typecheck

echo "2/6 Running tests..."
npm run test

echo "3/6 Verifying package integrity (dry-run install)..."
node scripts/verify-package.cjs

echo "4/6 Verifying shebang..."
head -1 dist/index.js

echo ""
echo "5/6 Publishing to npm..."
npm publish --access public

echo ""
echo "✓ Published ${PKG_NAME}@${PKG_VERSION}"

echo "Tagging git..."
git tag -a "v${PKG_VERSION}" -m "v${PKG_VERSION}"
echo "Done. Push with: git push origin main --tags"