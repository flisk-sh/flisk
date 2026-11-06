# Makefile
# A thin wrapper: npm scripts in package.json are the canonical task interface, and these targets call them.
# Run `make` or `make help` to list targets.

.DEFAULT_GOAL := help

.PHONY: help install build lint typecheck check clean \
        test test-ts test-python test-shell test-fast test-generator test-coverage \
        test-tilt-engine test-tilt-engine-coverage test-e2e ade-score scores

help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-26s\033[0m %s\n", $$1, $$2}'

# Build and static checks
install: ## Install dependencies
	npm install

build: ## Build the CLI (refreshes cli/dist)
	npm run build

lint: ## Lint the CLI with Biome
	npm run lint

typecheck: ## Typecheck the CLI
	npm run typecheck

check: ## Lint and typecheck
	npm run check

clean: ## Remove CLI build output
	npm run clean

# Tests
test: test-ts test-python test-shell ## Run TypeScript, Python and shell checks

test-ts: ## Run TypeScript tests
	cd cli && npm test

test-python: ## Run Python tests (extra pytest flags: ARGS="-m snapshot")
	pytest tests/ -v --tb=short $(ARGS)

test-shell: ## Shell syntax, static repo checks and every Node *.test.mjs (npm run check:shell, check:static, test:scripts); no Docker/Tilt
	npm run check:shell
	npm run check:static
	npm run test:scripts

test-fast: ## Run fast Python unit tests only (what the pre-commit hook runs)
	pytest -m fast --no-cov -q

test-generator: ## Run generator bug tests only
	pytest -m generator -v --no-cov

test-coverage: ## Run all Python tests with coverage
	pytest tests/ -v --cov --cov-report=term-missing --cov-report=html

test-tilt-engine: ## Run the tilt-engine Python tests
	pytest tests/tilt-engine/ -v --tb=short

test-tilt-engine-coverage: ## Run the tilt-engine tests with a coverage report
	pytest tests/tilt-engine/ -v --cov=tests/tilt-engine --cov-report=term-missing --cov-report=html

test-e2e: ## Run a live-stack e2e suite: make test-e2e GROUP=resource-types SUITE=agent [CASES="A1 A2"] (needs Docker, Tilt, flisk)
	@test -n "$(GROUP)" -a -n "$(SUITE)" || { echo "usage: make test-e2e GROUP=<group> SUITE=<suite> [CASES=\"<case> ...\"]"; ls tests/e2e/*/*/suite.json | sed 's#tests/e2e/##; s#/suite.json##'; exit 2; }
	tests/e2e/$(GROUP)/$(SUITE)/run.sh $(if $(CASES),$(CASES),all)

# Scores
ade-score: ## Print the deterministic ADE score (no AI, files only); add ARGS="--markdown" or ARGS="--json"
	node scripts/ade-score.mjs $(ARGS)

scores: ## Print the scoreboard of scripts/scores/ (files scorers); ARGS="--source all" adds GitHub data, "--markdown"/"--json" change the format
	node scripts/scores/run.mjs $(ARGS)
