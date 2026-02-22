Convert and split all .doc/.docx in the folder (batch):

```bash
python3 tools/convert_and_split.py --source-dir . --outdir content
```

This requires `pandoc` and will create a combined `content/manifest.json`.
