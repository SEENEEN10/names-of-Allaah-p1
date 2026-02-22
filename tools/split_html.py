#!/usr/bin/env python3
"""
split_html.py

Split a single large HTML file (converted from Word) into chapter files
based on a heading tag (default: <h1>), and generate content/manifest.json
suitable for the reader site.

Usage:
  python3 tools/split_html.py --input book.html --outdir content

Requires: beautifulsoup4
  pip install beautifulsoup4
"""

import os
import argparse
import json
from bs4 import BeautifulSoup, Tag


def ensure_dir(p):
    os.makedirs(p, exist_ok=True)


def split_html(input_path, outdir, heading_tag='h1', prefix='chapter', start_index=1):
    # Read as bytes first and try several common encodings (Word often emits windows-1256/latin1)
    with open(input_path, 'rb') as f:
        raw = f.read()
    encodings_to_try = ['utf-8', 'windows-1256', 'cp1256', 'latin-1']
    html = None
    for enc in encodings_to_try:
        try:
            html = raw.decode(enc)
            break
        except Exception:
            continue
    if html is None:
        # final fallback: replace errors
        html = raw.decode('utf-8', errors='replace')

    soup = BeautifulSoup(html, 'html.parser')

    # Find body; if missing, use whole document
    body = soup.body or soup

    headings = body.find_all(heading_tag)
    ensure_dir(outdir)

    manifest = {'title': os.path.splitext(os.path.basename(input_path))[0], 'chapters': []}

    if not headings:
        # write whole file as single chapter
        out_name = f"{prefix}-1.html"
        out_path = os.path.join(outdir, out_name)
        with open(out_path, 'w', encoding='utf-8') as w:
            w.write(str(body))
        # use file title if available for the chapter title
        chapter_title = manifest.get('title') or os.path.splitext(os.path.basename(input_path))[0]
        manifest['chapters'].append({'id': 'chapter-1', 'title': chapter_title, 'file': out_name})
        return manifest

    idx = start_index
    for idx_offset, h in enumerate(headings):
        title = h.get_text(strip=True)
        parts = []
        parts.append(str(h))
        for sib in h.next_siblings:
            if isinstance(sib, Tag) and sib.name == heading_tag:
                break
            parts.append(str(sib))

        out_name = f"{prefix}-{idx}.html"
        out_path = os.path.join(outdir, out_name)
        # wrap in section and ensure rtl
        chunk = '<section dir="rtl">' + ''.join(parts) + '</section>'
        with open(out_path, 'w', encoding='utf-8') as w:
            w.write(chunk)

        # if the heading has no text, fall back to file-based title or numbered title
        if not title:
            file_based = manifest.get('title') or os.path.splitext(os.path.basename(input_path))[0]
            title = f"{file_based} - فصل {idx}"
        manifest['chapters'].append({'id': f'{prefix}-{idx}', 'title': title, 'file': out_name})
        idx += 1

    return manifest


def main():
    parser = argparse.ArgumentParser(description='Split HTML into chapter files and generate manifest.json')
    parser.add_argument('--input', '-i', required=True, help='Input HTML file (converted from Word)')
    parser.add_argument('--outdir', '-o', default='content', help='Output directory for chapter files')
    parser.add_argument('--heading', '-t', default='h1', help='Heading tag to split on (default: h1)')
    parser.add_argument('--prefix', '-p', default='chapter', help='Filename prefix for chapters')
    parser.add_argument('--start', '-s', type=int, default=1, help='Start index (default:1)')
    parser.add_argument('--manifest', '-m', default=None, help='Path to write manifest.json (defaults to OUTDIR/manifest.json)')
    parser.add_argument('--file-title', '-ft', default=None, help='Optional source file title to use when headings are missing')

    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print('Input file not found:', args.input)
        return

    ensure_dir(args.outdir)

    manifest = split_html(args.input, args.outdir, heading_tag=args.heading, prefix=args.prefix, start_index=args.start)
    # if caller provided a file-title, use it as manifest title
    if args.file_title:
        manifest['title'] = args.file_title

    manifest_path = args.manifest or os.path.join(args.outdir, 'manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as mf:
        json.dump(manifest, mf, ensure_ascii=False, indent=2)

    print('Split complete. Chapters created:', len(manifest['chapters']))
    print('Manifest:', manifest_path)


if __name__ == '__main__':
    main()
