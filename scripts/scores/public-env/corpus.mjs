// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The labelled corpus for the doctor's public-env heuristic: data only. A case says which variable holds which value and
// whether `flisk doctor` must warn, with the promise it stands for. Credentials are assembled at runtime from a prefix and
// filler, so no credential-shaped literal sits in the repository (tracked-secrets stays at zero). Add a case first when a
// user reports a missed key or a noisy warning, then fix the heuristic.

const repeat = (n, ch = "a") => ch.repeat(n);
const mixed = (n) => "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6".repeat(4).slice(0, n);

const credential = (name, value, why) => ({ name, value, secret: true, why });
const publicValue = (name, value, why) => ({ name, value, secret: false, why });

// Must warn: the provider formats and naming rules doctor promises to catch.
export const CREDENTIALS = [
	credential("NEXT_PUBLIC_STRIPE_KEY", `sk_${"live"}_${mixed(24)}`, "Stripe secret key"),
	credential("VITE_STRIPE_KEY", `rk_${"test"}_${mixed(24)}`, "Stripe restricted key"),
	credential("VITE_OPENAI_KEY", `sk-${"proj"}-${mixed(40)}`, "OpenAI project key"),
	credential("VITE_OPENAI_KEY", `sk-${mixed(48)}`, "OpenAI legacy key"),
	credential("NEXT_PUBLIC_ANTHROPIC", `sk-${"ant"}-${mixed(40)}`, "Anthropic key"),
	credential("VITE_AWS_KEY", `${"AKIA"}${repeat(16, "Q")}`, "AWS access key id"),
	credential("VITE_GH_TOKEN", `${"ghp"}_${mixed(36)}`, "GitHub personal token"),
	credential("VITE_GH_TOKEN", `${"github_pat"}_${mixed(60)}`, "GitHub fine-grained token"),
	credential("VITE_SLACK", `${"xoxb"}-${mixed(30)}`, "Slack bot token"),
	credential("NEXT_PUBLIC_MAPS", `${"AIza"}${mixed(35)}`, "Google API key"),
	credential("VITE_NPM", `${"npm"}_${mixed(36)}`, "npm token"),
	credential("VITE_WEBHOOK", `${"whsec"}_${mixed(32)}`, "webhook signing secret"),
	credential("VITE_JWT", `${"eyJ"}${mixed(20)}.${"eyJ"}${mixed(20)}.${mixed(20)}`, "JWT"),
	credential("VITE_DB", `postgres://admin:${mixed(12)}@db.internal/app`, "URL with credentials"),
	credential("NEXT_PUBLIC_AUTH_SECRET", mixed(32), "secret-named variable"),
	credential("VITE_ADMIN_PASSWORD", mixed(16), "password-named variable"),
];

// Must stay quiet: public configuration doctor promises not to flag.
export const PUBLIC_VALUES = [
	publicValue("NEXT_PUBLIC_STRIPE_KEY", `pk_${"live"}_${mixed(24)}`, "Stripe publishable key"),
	publicValue("VITE_CLERK_KEY", `pk_${"test"}_${mixed(24)}`, "Clerk publishable key"),
	publicValue("VITE_STRIPE_KEY", "sk_test_x", "documentation placeholder"),
	publicValue("VITE_API_KEY", "your_api_key_here", "your_ placeholder"),
	publicValue("VITE_API_KEY", "<INSERT_KEY>", "angle-bracket placeholder"),
	publicValue("VITE_API_KEY", "replace_me_please", "replace_me placeholder"),
	publicValue("VITE_API_URL", "https://api.example.com/v1", "URL without credentials"),
	publicValue("VITE_API_URL", "http://api.my-shop.localhost/api", "local Flisk URL"),
	publicValue("VITE_FEATURE", "ThisIsAVeryLongFeatureFlagValue2026", "PascalCase flag"),
	publicValue("VITE_MODE", "my-ordinary-public-configuration-value", "kebab-case config"),
	publicValue("VITE_BUILD_ID", "build-20261029-73b970", "build id"),
	publicValue("VITE_VERSION", "v1.4.13-rc.1", "version"),
	publicValue("VITE_COMMIT_SHA", repeat(40, "f"), "commit sha in a build variable"),
	publicValue("VITE_TENANT", "123e4567-e89b-12d3-a456-426614174000", "UUID"),
	publicValue("VITE_ENABLED", "true", "boolean"),
	publicValue("VITE_TIMEOUT", "30000", "number"),
	publicValue("VITE_ASSETS", "./public/assets", "file path"),
	publicValue("VITE_ENV", "dev", "short value"),
	publicValue("VITE_PASSWORD_MIN_LENGTH", "12", "secret-ish name, number value"),
];

export const CASES = [...CREDENTIALS, ...PUBLIC_VALUES];
