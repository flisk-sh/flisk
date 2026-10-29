// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
// The share of a labelled corpus that `flisk doctor`'s public-env check (#1646) classifies correctly. The check is a
// heuristic, and a heuristic drifts in two directions: a new pattern that starts warning on publishable keys, build
// ids or URLs teaches users to ignore the warning (a false positive), and a loosened one lets a real key through to
// the browser (a false negative). CASES pins both sides: every provider format the check promises to catch, and every
// kind of ordinary public configuration it promises to leave alone. The credentials are assembled at runtime from a
// prefix and filler, so this file holds no credential-shaped literal (tracked-secrets stays at zero). The check runs
// from cli/dist, the code users run. Gate at 100: a case that flips is either a bug or a promise to change on purpose,
// in the same pull request, here and in docs/troubleshooting.md.
import { loadHeuristic } from "./public-env-secrets.mjs";

export const meta = {
	id: "public-env-heuristic",
	title: "Public-env secret heuristic agrees with its labelled corpus",
	source: "files",
	mode: "gate",
	target: 100,
	better: "higher",
	unit: "%",
};

const fill = (n, ch = "a") => ch.repeat(n);
const mixed = (n) => "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6".repeat(4).slice(0, n);

// { name, value, secret, why }: the variable, its value, whether doctor must warn, and the promise the case stands for.
export const CASES = [
	// Must warn: provider credentials doctor promises to catch.
	{ name: "NEXT_PUBLIC_STRIPE_KEY", value: `sk_${"live"}_${mixed(24)}`, secret: true, why: "Stripe secret key" },
	{ name: "VITE_STRIPE_KEY", value: `rk_${"test"}_${mixed(24)}`, secret: true, why: "Stripe restricted key" },
	{ name: "VITE_OPENAI_KEY", value: `sk-${"proj"}-${mixed(40)}`, secret: true, why: "OpenAI project key" },
	{ name: "VITE_OPENAI_KEY", value: `sk-${mixed(48)}`, secret: true, why: "OpenAI legacy key" },
	{ name: "NEXT_PUBLIC_ANTHROPIC", value: `sk-${"ant"}-${mixed(40)}`, secret: true, why: "Anthropic key" },
	{ name: "VITE_AWS_KEY", value: `${"AKIA"}${fill(16, "Q")}`, secret: true, why: "AWS access key id" },
	{ name: "VITE_GH_TOKEN", value: `${"ghp"}_${mixed(36)}`, secret: true, why: "GitHub personal token" },
	{ name: "VITE_GH_TOKEN", value: `${"github_pat"}_${mixed(60)}`, secret: true, why: "GitHub fine-grained token" },
	{ name: "VITE_SLACK", value: `${"xoxb"}-${mixed(30)}`, secret: true, why: "Slack bot token" },
	{ name: "NEXT_PUBLIC_MAPS", value: `${"AIza"}${mixed(35)}`, secret: true, why: "Google API key" },
	{ name: "VITE_NPM", value: `${"npm"}_${mixed(36)}`, secret: true, why: "npm token" },
	{ name: "VITE_WEBHOOK", value: `${"whsec"}_${mixed(32)}`, secret: true, why: "webhook signing secret" },
	{ name: "VITE_JWT", value: `${"eyJ"}${mixed(20)}.${"eyJ"}${mixed(20)}.${mixed(20)}`, secret: true, why: "JWT" },
	{ name: "VITE_DB", value: `postgres://admin:${mixed(12)}@db.internal/app`, secret: true, why: "URL with credentials" },
	{ name: "NEXT_PUBLIC_AUTH_SECRET", value: mixed(32), secret: true, why: "secret-named variable" },
	{ name: "VITE_ADMIN_PASSWORD", value: mixed(16), secret: true, why: "password-named variable" },
	// Must stay quiet: public configuration doctor promises not to flag.
	{ name: "NEXT_PUBLIC_STRIPE_KEY", value: `pk_${"live"}_${mixed(24)}`, secret: false, why: "Stripe publishable key" },
	{ name: "VITE_CLERK_KEY", value: `pk_${"test"}_${mixed(24)}`, secret: false, why: "Clerk publishable key" },
	{ name: "VITE_STRIPE_KEY", value: "sk_test_x", secret: false, why: "documentation placeholder" },
	{ name: "VITE_API_KEY", value: "your_api_key_here", secret: false, why: "your_ placeholder" },
	{ name: "VITE_API_KEY", value: "<INSERT_KEY>", secret: false, why: "angle-bracket placeholder" },
	{ name: "VITE_API_KEY", value: "replace_me_please", secret: false, why: "replace_me placeholder" },
	{ name: "VITE_API_URL", value: "https://api.example.com/v1", secret: false, why: "URL without credentials" },
	{ name: "VITE_API_URL", value: "http://api.my-shop.localhost/api", secret: false, why: "local Flisk URL" },
	{ name: "VITE_FEATURE", value: "ThisIsAVeryLongFeatureFlagValue2026", secret: false, why: "PascalCase flag" },
	{ name: "VITE_MODE", value: "my-ordinary-public-configuration-value", secret: false, why: "kebab-case config" },
	{ name: "VITE_BUILD_ID", value: "build-20261029-73b970", secret: false, why: "build id" },
	{ name: "VITE_VERSION", value: "v1.4.13-rc.1", secret: false, why: "version" },
	{ name: "VITE_COMMIT_SHA", value: fill(40, "f"), secret: false, why: "commit sha in a build variable" },
	{ name: "VITE_TENANT", value: "123e4567-e89b-12d3-a456-426614174000", secret: false, why: "UUID" },
	{ name: "VITE_ENABLED", value: "true", secret: false, why: "boolean" },
	{ name: "VITE_TIMEOUT", value: "30000", secret: false, why: "number" },
	{ name: "VITE_ASSETS", value: "./public/assets", secret: false, why: "file path" },
	{ name: "VITE_ENV", value: "dev", secret: false, why: "short value" },
	{ name: "VITE_PASSWORD_MIN_LENGTH", value: "12", secret: false, why: "secret-ish name, number value" },
];

// The cases the heuristic gets wrong, as findings that name the promise, never the value.
export function misclassified(isSecretLookingValue, cases = CASES) {
	return cases
		.filter((c) => isSecretLookingValue(c.value, c.name) !== c.secret)
		.map((c) => `${c.why} (${c.name}): doctor ${c.secret ? "misses it (false negative)" : "warns (false positive)"}`);
}

export async function measure({ root }, cases = CASES) {
	const { isSecretLookingValue } = await loadHeuristic(root);
	const findings = misclassified(isSecretLookingValue, cases);
	const right = cases.length - findings.length;
	const positives = cases.filter((c) => c.secret).length;
	return {
		value: Math.round((right / cases.length) * 1000) / 10,
		summary: `${right}/${cases.length} cases right (${positives} credentials, ${cases.length - positives} public values)`,
		findings,
	};
}
