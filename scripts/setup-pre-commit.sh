#!/bin/bash
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Setup script for Flisk CLI development environment

set -e

echo "🚀 Setting up Flisk CLI development environment..."

# Check if pre-commit is installed
if ! command -v pre-commit &> /dev/null; then
    echo "📦 Installing pre-commit..."
    pip install --require-hashes -r "$(dirname "$0")/requirements-pre-commit.txt"
fi

# Install hooks
echo "🔧 Installing pre-commit hooks..."
pre-commit install

# Run fast tests to verify everything works
echo "🧪 Running fast tests to verify setup..."
if python3 -m pytest -m fast --no-cov -q 2>/dev/null; then
    echo "✅ Fast tests passed!"
else
    echo "⚠️  Some tests may need dependencies, but pre-commit is installed."
fi

echo ""
echo "✅ Setup complete! Pre-commit hooks are now installed."
echo ""
echo "Usage:"
echo "  git commit        # Runs fast tests automatically"
echo "  make test-fast    # Run fast tests manually"
echo "  make test-generator # Run generator-specific tests"
echo "  pre-commit run --all-files  # Run all hooks manually"
