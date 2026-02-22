#!/usr/bin/env python3
"""
convert_and_split.py

Convert all .doc/.docx files in the project folder to temporary HTML using Pandoc,
then split them into chapter files and produce a combined `content/manifest.json`.

Usage:
  python3 tools/convert_and_split.py --source-dir . --outdir content

Requires: pandoc installed and accessible in PATH.
"""

import os
import subprocess
import json
import tempfile
import shutil
from glob import glob
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent
SPLITTER = TOOLS_DIR / 'split_html.py'


def find_docs(srcdir):
    patterns = ['*.doc', '*.docx']
    files = []
    for p in patterns:
        files.extend(Path(srcdir).glob(p))
    # filter out temporary ~ files
    files = [f for f in files if not f.name.startswith('~$')]
    return sorted(files)


def check_pandoc():
    return shutil.which('pandoc') is not None


def convert_doc_to_html(docpath, out_html):
    cmd = ['pandoc', str(docpath), '-t', 'html', '-o', str(out_html)]
    print('Running:', ' '.join(cmd))
    subprocess.check_call(cmd)


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', default='.', help='Directory to search for .doc/.docx')
    parser.add_argument('--outdir', default='content', help='Output content directory')
    parser.add_argument('--prefix', default='chapter', help='Chapter file prefix')
    args = parser.parse_args()

    if not check_pandoc():
        print('pandoc not found in PATH. Please install pandoc and try again.')
        return

    docs = find_docs(args.source_dir)
    if not docs:
        print('No .doc/.docx files found in', args.source_dir)
        return

    ensure_dir = lambda p: os.makedirs(p, exist_ok=True)
    ensure_dir(args.outdir)

    combined = {'title': 'Combined Book', 'chapters': []}
    current_index = 1

    for doc in docs:
        print('Converting', doc)
        with tempfile.NamedTemporaryFile(suffix='.html', delete=False) as tmp:
            tmp_html = tmp.name
        try:
            convert_doc_to_html(doc, tmp_html)
        except subprocess.CalledProcessError:
            print('Error converting', doc)
            os.unlink(tmp_html)
            continue

        # call splitter to split this temp html into content files, writing a temporary manifest
        tmp_manifest = Path(args.outdir) / f'manifest_part_{current_index}.json'
         file_title = doc.stem
         cmd = ['python3', str(SPLITTER), '--input', tmp_html, '--outdir', args.outdir,
             '--prefix', args.prefix, '--start', str(current_index), '--manifest', str(tmp_manifest), '--file-title', file_title]
        print('Splitting:', ' '.join(cmd))
        subprocess.check_call(cmd)

        # read generated manifest part and append chapters
        with open(tmp_manifest, 'r', encoding='utf-8') as mf:
            part = json.load(mf)
        for ch in part.get('chapters', []):
            combined['chapters'].append(ch)
            # increment current index based on id pattern if needed
            current_index += 1

        # clean up tmp files
        os.unlink(tmp_html)
        os.unlink(tmp_manifest)

    manifest_path = Path(args.outdir) / 'manifest.json'
    with open(manifest_path, 'w', encoding='utf-8') as mf:
        json.dump(combined, mf, ensure_ascii=False, indent=2)

    print('Done. Combined manifest written to', manifest_path)


if __name__ == '__main__':
    main()
