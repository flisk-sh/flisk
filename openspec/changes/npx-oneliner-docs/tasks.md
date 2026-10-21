## 1. Root docs
- [ ] 1.1 Update `README.md` quick start and installation to the canonical npx blocks; move global install and curl after them.
- [ ] 1.2 Mirror commands in `README-zh_cn.md`, `README-zh_tw.md`, `README-ja.md`, `README-ko.md` (translate prose only).
- [ ] 1.3 Update `docs/README.md` start-here commands.

## 2. Examples and external surfaces
- [ ] 2.1 Rewrite example READMEs that open with bare `tdk project` / `tdk up`.
- [ ] 2.2 Update the website quickstart install options (npx line first).
- [ ] 2.3 Update the `awesome-tdk-framework` install line.

## 3. Verification
- [ ] 3.1 Grep public markdown for `flisk tdk ` and npx commands with trailing `-y`; expect no hits.
- [ ] 3.2 Run `npx -y @flisk-sh/flisk --version` and `up shop --dry-run` from a scratch project and confirm they work without Docker/Tilt.
- [ ] 3.3 Confirm each `up` without `--dry-run` is labeled Docker + Tilt and carries the native Windows / WSL2 note.
