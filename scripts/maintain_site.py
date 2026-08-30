#!/usr/bin/env python3
"""Generate and verify shared metadata and support files for the static site."""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "site.config.json"
VOID_ELEMENTS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}


class StructureParser(HTMLParser):
    """Small strict tag-balance check for the site's deliberately simple HTML."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[tuple[str, int]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag not in VOID_ELEMENTS:
            self.stack.append((tag, self.getpos()[0]))

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID_ELEMENTS:
            return
        if not self.stack:
            raise ValueError(f"unexpected </{tag}> on line {self.getpos()[0]}")
        open_tag, open_line = self.stack.pop()
        if open_tag != tag:
            raise ValueError(
                f"expected </{open_tag}> for line {open_line}, found </{tag}> on line {self.getpos()[0]}"
            )

    def assert_closed(self) -> None:
        if self.stack:
            tag, line = self.stack[-1]
            raise ValueError(f"unclosed <{tag}> from line {line}")


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def absolute(site: dict, path: str) -> str:
    return site["base_url"].rstrip("/") + "/" + path.lstrip("/")


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def image_metadata(site: dict, page: dict) -> tuple[str, int, int, str]:
    if page["image"] == "home":
        alt = (
            "Rodrigo Martins — Ciência Política, Instituições e Metodologia"
            if page["lang"] == "pt-BR"
            else "Rodrigo Martins — Political Science, Institutions and Methodology"
        )
        return (
            absolute(site, site["home_social_image"]),
            site["home_social_width"],
            site["home_social_height"],
            alt,
        )
    alt = "Foto de Rodrigo Martins" if page["lang"] == "pt-BR" else "Photo of Rodrigo Martins"
    return (
        absolute(site, site["profile_image"]),
        site["profile_image_width"],
        site["profile_image_height"],
        alt,
    )


def translation_links(page: dict) -> list[tuple[str, str]]:
    if page["lang"] == "pt-BR":
        pt_url, en_url = page.get("canonical", page["url"]), page["alternate"]
    else:
        pt_url, en_url = page["alternate"], page.get("canonical", page["url"])
    return [("pt-BR", pt_url), ("en", en_url), ("x-default", page["default_url"])]


def render_head(site: dict, page: dict) -> str:
    canonical_path = page.get("canonical", page["url"])
    canonical = absolute(site, canonical_path)
    og_image, image_width, image_height, image_alt = image_metadata(site, page)
    og_locale = "pt_BR" if page["lang"] == "pt-BR" else "en_US"
    alternate_locale = "en_US" if page["lang"] == "pt-BR" else "pt_BR"
    lines = [
        "  <head>",
        '    <meta charset="utf-8">',
        '    <meta name="viewport" content="width=device-width, initial-scale=1">',
        f"    <title>{esc(page['title'])}</title>",
        f'    <meta name="description" content="{esc(page["description"])}">',
        f'    <meta name="author" content="{esc(site["name"])}">',
        f'    <meta name="theme-color" content="{esc(site["theme_color"])}">',
        f'    <link rel="canonical" href="{esc(canonical)}">',
    ]
    for language, path in translation_links(page):
        lines.append(f'    <link rel="alternate" hreflang="{language}" href="{esc(absolute(site, path))}">')
    if page.get("target"):
        lines.extend(
            [
                f'    <meta http-equiv="refresh" content="0; url={esc(page["target"])}">',
                '    <meta name="robots" content="noindex, follow">',
            ]
        )
    lines.extend(
        [
            '    <link rel="icon" type="image/svg+xml" href="/img/favicon.svg">',
            '    <link rel="icon" type="image/png" sizes="32x32" href="/img/icon.png">',
            '    <link rel="apple-touch-icon" sizes="192x192" href="/img/icon-192.png">',
            '    <link rel="manifest" href="/site.webmanifest">',
            f'    <meta property="og:type" content="{esc(page["og_type"])}">',
            f'    <meta property="og:site_name" content="{esc(site["name"])}">',
            f'    <meta property="og:locale" content="{og_locale}">',
            f'    <meta property="og:locale:alternate" content="{alternate_locale}">',
            f'    <meta property="og:title" content="{esc(page["title"])}">',
            f'    <meta property="og:description" content="{esc(page["social_description"])}">',
            f'    <meta property="og:url" content="{esc(canonical)}">',
            f'    <meta property="og:image" content="{esc(og_image)}">',
            f'    <meta property="og:image:width" content="{image_width}">',
            f'    <meta property="og:image:height" content="{image_height}">',
            f'    <meta property="og:image:alt" content="{esc(image_alt)}">',
            f'    <meta name="twitter:card" content="{esc(page["twitter_card"])}">',
            f'    <meta name="twitter:title" content="{esc(page["title"])}">',
            f'    <meta name="twitter:description" content="{esc(page["social_description"])}">',
            f'    <meta name="twitter:image" content="{esc(og_image)}">',
            f'    <meta name="twitter:image:alt" content="{esc(image_alt)}">',
            '    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/academicons/1.9.4/css/academicons.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">',
            '    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" crossorigin="anonymous" referrerpolicy="no-referrer">',
            f'    <link rel="stylesheet" href="/css/modern.css?v={esc(site["css_version"])}">',
            "  </head>",
        ]
    )
    return "\n".join(lines)


def replace_head(document: str, head: str) -> str:
    updated, count = re.subn(r"(?s)  <head>.*?  </head>", head, document, count=1)
    if count != 1:
        raise ValueError("document does not contain exactly one replaceable <head>")
    return updated


def wrap_group(document: str, class_name: str, tag: str) -> str:
    pattern = rf'(?s)<div class="{re.escape(class_name)}"([^>]*)>(.*?)</div>'

    def replacement(match: re.Match[str]) -> str:
        return f'<{tag} class="{class_name}"{match.group(1)}>{match.group(2)}</{tag}>'

    return re.sub(pattern, replacement, document, count=1)


def apply_accessibility(document: str, page: dict) -> str:
    language = page["lang"]
    skip_text = "Pular para o conteúdo" if language == "pt-BR" else "Skip to content"
    if 'class="skip-link"' not in document:
        document = document.replace("  <body>\n", f'  <body>\n    <a class="skip-link" href="#main-content">{skip_text}</a>\n', 1)
    document = re.sub(r"<main(?![^>]*\bid=)([^>]*)>", r'<main id="main-content"\1>', document, count=1)
    document = re.sub(r"<main(?![^>]*\btabindex=)([^>]*)>", r'<main tabindex="-1"\1>', document, count=1)

    if page["file"] in {"pt/index.html", "eng/index.html"}:
        hero_pattern = r'(?s)<div class="hero-meta"([^>]*)>(.*?)</div>'

        def hero_replacement(match: re.Match[str]) -> str:
            items = match.group(2).replace("<span>", "<li>").replace("</span>", "</li>")
            return f'<ul class="hero-meta"{match.group(1)}>{items}</ul>'

        document = re.sub(hero_pattern, hero_replacement, document, count=1)
        document = wrap_group(document, "profile-links", "nav")
        document = wrap_group(document, "social-links", "nav")
        document = document.replace('<section class="content-grid">', '<div class="content-grid">', 1)
        document = document.replace('<article class="section-block">', '<div class="section-block">', 1)
        document = document.replace("</article>\n\n        <aside class=\"facts\">", "</div>\n\n        <aside class=\"facts\">", 1)
        document = document.replace("</aside>\n      </section>\n\n      <section class=\"band\"", "</aside>\n      </div>\n\n      <section class=\"band\"", 1)
    return document


def render_manifest(site: dict) -> str:
    manifest = {
        "name": "Rodrigo Martins — Site acadêmico",
        "short_name": "Rodrigo Martins",
        "description": "Site acadêmico de Rodrigo Martins, cientista político.",
        "lang": "pt-BR",
        "start_url": "/pt/",
        "scope": "/",
        "display": "browser",
        "background_color": site["background_color"],
        "theme_color": site["theme_color"],
        "icons": [
            {"src": "/img/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "/img/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        ],
    }
    return json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"


def render_sitemap(site: dict, pages: list[dict]) -> str:
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for page in pages:
        priority = page.get("sitemap_priority")
        if not priority:
            continue
        lines.extend(
            [
                "  <url>",
                f"    <loc>{esc(absolute(site, page['url']))}</loc>",
                f"    <priority>{priority}</priority>",
                "  </url>",
            ]
        )
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def search_entries(site: dict, pages: list[dict], language: str) -> list[dict]:
    entries = []
    for page in pages:
        if page.get("target") or page["lang"] != language:
            continue
        entries.append(
            {
                "title": page["title"],
                "summary": page["description"],
                "content": page["description"],
                "lang": "pt" if language == "pt-BR" else "en",
                "type": "profile" if page["og_type"] == "profile" else "publication",
                "permalink": absolute(site, page["url"]),
                "relpermalink": page["url"],
            }
        )
    return entries


def render_404(site: dict) -> str:
    return f'''<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Página não encontrada | Rodrigo Martins</title>
    <meta name="description" content="A página solicitada não foi encontrada.">
    <meta name="robots" content="noindex, follow">
    <meta name="theme-color" content="{esc(site['theme_color'])}">
    <link rel="icon" type="image/svg+xml" href="/img/favicon.svg">
    <link rel="icon" type="image/png" sizes="32x32" href="/img/icon.png">
    <link rel="apple-touch-icon" sizes="192x192" href="/img/icon-192.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="stylesheet" href="/css/modern.css?v={esc(site['css_version'])}">
  </head>
  <body>
    <a class="skip-link" href="#main-content">Pular para o conteúdo</a>
    <header class="site-header">
      <a class="brand" href="/pt/">Rodrigo Martins</a>
      <nav class="nav" aria-label="Idiomas">
        <a href="/pt/">Português</a>
        <a class="language-link" href="/eng/" hreflang="en">English</a>
      </nav>
    </header>
    <main id="main-content" class="not-found" tabindex="-1">
      <p class="eyebrow">Erro 404 · Error 404</p>
      <h1>Página não encontrada</h1>
      <p class="lead">O endereço pode ter mudado ou não existir mais. Use um dos links abaixo para continuar.</p>
      <div class="actions">
        <a class="button primary" href="/pt/">Página inicial</a>
        <a class="button secondary" href="/pt/#publicacoes">Publicações</a>
      </div>
      <section class="not-found-english" aria-labelledby="not-found-en">
        <h2 id="not-found-en">Page not found</h2>
        <p>The address may have changed or may no longer exist.</p>
        <div class="actions">
          <a class="button primary" href="/eng/">English homepage</a>
          <a class="button secondary" href="/eng/#publications">Publications</a>
        </div>
      </section>
    </main>
    <footer class="site-footer">
      <p>© 2026 Rodrigo Martins.</p>
      <a href="/pt/">rodrigomartins.org</a>
    </footer>
  </body>
</html>
'''


def generated_files(config: dict) -> dict[Path, str]:
    site, pages = config["site"], config["pages"]
    outputs: dict[Path, str] = {
        ROOT / "site.webmanifest": render_manifest(site),
        ROOT / "sitemap.xml": render_sitemap(site, pages),
        ROOT / "404.html": render_404(site),
        ROOT / "index.json": json.dumps(search_entries(site, pages, "pt-BR"), ensure_ascii=False, separators=(",", ":")) + "\n",
        ROOT / "pt/index.json": json.dumps(search_entries(site, pages, "pt-BR"), ensure_ascii=False, separators=(",", ":")) + "\n",
        ROOT / "eng/index.json": json.dumps(search_entries(site, pages, "en"), ensure_ascii=False, separators=(",", ":")) + "\n",
    }
    for page in pages:
        path = ROOT / page["file"]
        current = path.read_text(encoding="utf-8")
        updated = replace_head(current, render_head(site, page))
        outputs[path] = apply_accessibility(updated, page)
    return outputs


def local_target(source_file: Path, reference: str) -> Path | None:
    parsed = urlsplit(html.unescape(reference))
    if parsed.scheme or reference.startswith("//") or reference.startswith(("mailto:", "tel:", "data:", "javascript:")):
        return None
    raw_path = unquote(parsed.path)
    if not raw_path:
        return source_file
    candidate = ROOT / raw_path.lstrip("/") if raw_path.startswith("/") else source_file.parent / raw_path
    if raw_path.endswith("/") or candidate.is_dir():
        candidate /= "index.html"
    return candidate.resolve()


def validate(config: dict, expected: dict[Path, str]) -> list[str]:
    errors: list[str] = []
    for path, content in expected.items():
        if not path.exists():
            errors.append(f"missing generated file: {path.relative_to(ROOT)}")
        elif path.read_text(encoding="utf-8") != content:
            errors.append(f"out of date: {path.relative_to(ROOT)}")

    checked_html = [ROOT / page["file"] for page in config["pages"]] + [ROOT / "404.html"]
    for path in checked_html:
        document = path.read_text(encoding="utf-8")
        parser = StructureParser()
        try:
            parser.feed(document)
            parser.close()
            parser.assert_closed()
        except ValueError as error:
            errors.append(f"invalid HTML structure in {path.relative_to(ROOT)}: {error}")
        ids = re.findall(r'\bid=["\']([^"\']+)["\']', document, flags=re.I)
        duplicates = sorted({item for item in ids if ids.count(item) > 1})
        if duplicates:
            errors.append(f"duplicate ids in {path.relative_to(ROOT)}: {', '.join(duplicates)}")
        if re.search(r'<div\b[^>]*\baria-label=', document, flags=re.I):
            errors.append(f"aria-label on generic div in {path.relative_to(ROOT)}")
        if 'class="skip-link"' not in document or 'id="main-content"' not in document or 'tabindex="-1"' not in document:
            errors.append(f"missing skip-link target in {path.relative_to(ROOT)}")
        for reference in re.findall(r'\b(?:href|src)=["\']([^"\']+)["\']', document, flags=re.I):
            target = local_target(path, reference)
            if target is not None and not target.exists():
                errors.append(f"broken local reference in {path.relative_to(ROOT)}: {reference}")
                continue
            fragment = unquote(urlsplit(html.unescape(reference)).fragment)
            if target is not None and fragment and target.suffix.lower() == ".html":
                target_document = target.read_text(encoding="utf-8")
                target_ids = set(re.findall(r'\bid=["\']([^"\']+)["\']', target_document, flags=re.I))
                if fragment not in target_ids:
                    errors.append(f"missing fragment target in {path.relative_to(ROOT)}: {reference}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true", help="update managed files")
    mode.add_argument("--check", action="store_true", help="verify managed files without changing them")
    args = parser.parse_args()

    config = load_config()
    expected = generated_files(config)
    if args.write:
        for path, content in expected.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
        expected = generated_files(config)

    errors = validate(config, expected)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"PASS: {len(config['pages'])} managed pages and {len(expected)} generated files are current")
    return 0


if __name__ == "__main__":
    sys.exit(main())
