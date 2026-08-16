.PHONY: install dev build check test test-e2e all fix clean

install:
	bun install

dev:
	bun run dev

build:
	bun run build

check:
	bun run check

test:
	bun run test

test-e2e:
	bun run test:e2e

all: check test test-e2e

fix:
	bun run fix

clean:
	rm -rf apps/web/.next apps/web/.next-* apps/api/dist apps/api/.wrangler packages/*/dist coverage playwright-report test-results
	rm -f apps/web/*.tsbuildinfo apps/api/*.tsbuildinfo packages/*/*.tsbuildinfo
