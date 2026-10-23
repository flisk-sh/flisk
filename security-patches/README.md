# Temporary dependency security patches

These packages are local downstream patches for the example dependency trees. The readable source diffs are in `braces.patch` and `node-forge.patch`; the matching packed packages are in each example's `vendor/` directory. Each package starts from the exact npm release previously in its lockfile and applies the cited upstream security change. Replace the local packages with official npm releases when they include these fixes.

- `braces` `3.0.4-tdk.1`: based on npm `braces@3.0.3`; applies source changes from [FSDevelop/braces commit `28d440b5dd449dbf1fe6f3506cf94ecca4d02660`](https://github.com/FSDevelop/braces/commit/28d440b5dd449dbf1fe6f3506cf94ecca4d02660), the closed upstream PR #72 for GHSA-vfj7-8cjw-p6xm. It bounds parsing and recursive AST walks at 100 levels. Used by the MikroORM and Nitro examples.
- `node-forge` `1.4.1-tdk.1`: based on npm `node-forge@1.4.0`; applies `lib/rsa.js` from [Krysthyan/forge commit `ceba34402e329f0365134f23fe19898756527d65`](https://github.com/Krysthyan/forge/commit/ceba34402e329f0365134f23fe19898756527d65), the proposed fix in upstream PR #1152 for GHSA-86w9-cpqp-85rv. It validates the nested `DigestAlgorithm` element count during RSA PKCS#1 v1.5 verification.

The Flisk-local version suffixes distinguish these patched copies from upstream releases; neither copy has been published to npm.
