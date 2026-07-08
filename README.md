# rodrigomartins.org

Academic website for Rodrigo Martins, published with GitHub Pages.

## Main Pages

- `pt/index.html`: Portuguese homepage.
- `eng/index.html`: English homepage.
- `pt/publicacoes/`: Portuguese publication summaries.
- `eng/publications/`: English publication summaries.
- `css/modern.css`: shared site styles.
- `img/rodrigo-martins-current.jpg`: profile photo used in the homepage and social previews.

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

## Notes

- `sitemap.xml` and `robots.txt` are maintained manually.
- Local reference PDFs should stay outside Git; the `publicacoes/` folder is ignored.
