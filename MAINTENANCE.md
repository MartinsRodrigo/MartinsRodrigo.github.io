# Maintenance

Technical notes for maintaining `rodrigomartins.org`.

## Structure

- `pt/index.html`: Portuguese homepage.
- `eng/index.html`: English homepage.
- `pt/publicacoes/`: Portuguese publication summaries.
- `eng/publications/`: English publication summaries.
- `css/modern.css`: shared site styles.
- `img/rodrigo-martins-current.jpg`: profile photo used on the homepages and publication previews.
- `img/og-rodrigo-martins.png`: 1200 × 630 social preview for the homepages.
- `img/favicon.svg`, `img/icon.png`, `img/icon-192.png`, `img/icon-512.png`: visual identity assets.
- `site.config.json`: source of truth for shared metadata, language pairs, sitemap, and search indexes.
- `scripts/maintain_site.py`: idempotent generator and validator for managed site files.

Legacy folders from the previous Hugo/Academic version are still present to preserve older URLs while the rebuilt site is stabilized.

## Local Preview

From the repository root:

```powershell
py -m http.server 8080 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8080/pt/
http://127.0.0.1:8080/eng/
```

## Publishing

This repository is served by GitHub Pages from the `master` branch.

The custom domain is configured through `CNAME`:

```text
rodrigomartins.org
```

The domain registrar/DNS provider should point the apex domain to GitHub Pages A records and `www` to `martinsrodrigo.github.io`.

## SEO

- `sitemap.xml`, the three search indexes, `site.webmanifest`, and shared `<head>` metadata are generated from `site.config.json`.
- `robots.txt` points crawlers to the sitemap.
- Homepages and publication summaries include canonical, alternate language, OpenGraph, and Twitter metadata.

## Routine maintenance

The page body remains the authoritative source for visible content. Use `site.config.json` only for shared metadata and generated support files.

After editing a managed page or its metadata, run from the repository root:

```powershell
py -3 scripts/maintain_site.py --write
py -3 scripts/maintain_site.py --check
```

`--write` synchronizes metadata and generated files. `--check` performs a read-only drift, HTML-structure, accessibility, duplicate-ID, local-link, and fragment-target check. Pull requests and pushes are also checked by `.github/workflows/validate-site.yml`.

When changing the favicon design, regenerate its raster variants with Pillow installed:

```powershell
py -3 scripts/generate_brand_icons.py
```

Before publishing, preview both languages and the 404 page locally:

```text
http://127.0.0.1:8080/pt/
http://127.0.0.1:8080/eng/
http://127.0.0.1:8080/404.html
```

## Local Reference Files

Local reference PDFs should stay outside Git. The `publicacoes/` folder is ignored.
