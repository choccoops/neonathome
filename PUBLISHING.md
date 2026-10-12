# Publishing and updating Neon At Home

Same process as Neon Hub and Neon Market: pushing a version tag builds a release with a `module.json` and
`module.zip` that Foundry installs and updates from.

## Repository

The module is published from the public GitHub repository
[choccoops/neonathome](https://github.com/choccoops/neonathome), which is this folder's
`origin` remote. Builds run under its **Actions** tab.

**Manifest URL for Foundry's Install Module box:**

`https://github.com/choccoops/neonathome/releases/latest/download/module.json`

## Releasing an update

1. Make your changes.
2. Add a `## 1.1.0` section at the top of `CHANGELOG.md` (it becomes the release notes).
3. Set `"version"` in `module.json` to the same number.
4. Commit, tag and push:

```bash
git add -A
git commit -m "Release 1.1.0"
git tag v1.1.0
git push && git push --tags
```

The build syntax-checks every script first and stops the release if one is broken.

## Moving to Foundry v13

When the Cyberpunk RED team publishes their v13 release, install it, open each tab of the suite
and the two settings windows, then set `"compatibility": { "minimum": "12", "verified": "13" }`
and release. The data the module relies on is listed in the README.
