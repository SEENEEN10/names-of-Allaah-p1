Split the converted HTML into chapter files (single file):

```bash
python3 tools/split_html.py --input book.html --outdir content
```

This writes `content/*.html` and `content/manifest.json`.
