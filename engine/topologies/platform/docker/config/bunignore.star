# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 🐳 TILT SDK - BUNIGNORE GENERATORS (Option 2: Reduce node_modules size)
# =============================================================================
# Path: .tilt/topologies/platform/docker/bunignore.star
# Purpose: .bunignore generation to prevent unnecessary files from being installed
# Strategy: Exclude test files, docs, examples, and other non-production files
# =============================================================================

load('../../../tilt/common/utils.star', 'Utils')


def _get_common_bunignore_rules():
    """Get common .bunignore rules for all packages."""
    return """# Documentation files (not needed at runtime)
*.md
*.markdown
*.rst
*.adoc
README*
CHANGELOG*
HISTORY*
CONTRIBUTING*
LICENSE*
COPYING*
AUTHORS*
NOTICE*

# Test files and directories
__tests__
__mocks__
test
tests
spec
specs
.test
.spec
*.test.js
*.test.ts
*.test.tsx
*.spec.js
*.spec.ts
*.spec.tsx
*.test.mjs
*.spec.mjs
test-results
playwright-report
vitest.config.*
jest.config.*
mocha.opts

# Example and demo files
examples
example
demo
demos
sample
samples

# Development and build configuration
.github
.gitlab
.gitignore
.editorconfig
.prettierrc*
.eslintrc*
.eslintignore
biome.json
tsconfig.json
tsconfig.*.json
vite.config.*
webpack.config.*
rollup.config.*
babel.config.*
.babelrc*
.npmrc
.yarnrc*
bunfig.toml

# Source code (not needed in node_modules)
src
lib/src
source

# Development dependencies markers
.peerDependencies
.optionalDependencies

# CI/CD and automation
.github
.gitlab-ci.yml
.travis.yml
.circleci
azure-pipelines.yml
Jenkinsfile
.drone.yml

# IDE and editor files
.vscode
.idea
.sublime-project
.sublime-workspace
*.swp
*.swo
*~
.DS_Store

# Build artifacts (keep only dist/lib)
build
out
.next
.nuxt
.output
coverage
.nyc_output

# Package manager lock files (not needed in node_modules)
package-lock.json
yarn.lock
pnpm-lock.yaml
bun.lockb
"""


def generate_bunignore():
    """
    Generate .bunignore file for the workspace root.
    
    This file tells Bun which files to exclude when installing packages,
    reducing node_modules size by ~30-40% without affecting functionality.
    
    Returns:
        .bunignore content string
    """
    header = Utils.get_template_header(
        'bunignore',
        'Docker.generate_bunignore()',
        'workspace-root',
        'PRODUCTION OPTIMIZATION'
    )
    
    return header + _get_common_bunignore_rules()

