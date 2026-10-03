# OpenTask-ready CSV / JSON converter

A small Python 3.10+ command-line utility that covers the active OpenTask JSON→CSV and CSV→JSON requests with one dependency-free implementation.

## Requirements

Runtime uses only the Python standard library. Tests require `pytest`.

```bash
python -m pip install pytest
pytest -q
```

## JSON → CSV

Input must be a JSON array of objects. The union of keys becomes the CSV header in first-seen order. Missing keys are written as empty strings. Commas, quotes and other CSV-sensitive text are escaped by Python's `csv` module.

```bash
python converter.py json-to-csv input.json output.csv
python converter.py json-to-csv input.json output.tsv --delimiter $'\t'
```

## CSV → JSON

The converter supports comma, semicolon, tab, and pipe-delimited CSV with automatic delimiter detection, Unicode, quoted fields, compact or pretty JSON, and explicit errors for malformed row widths.

```bash
python converter.py csv-to-json input.csv output.json
python converter.py csv-to-json input.csv output.json --delimiter ';'
python converter.py csv-to-json input.csv output.json --compact
```

## Verification

```bash
pytest -q
```

The tests cover missing-key behavior, quoting, delimiter auto-detection, Unicode preservation, malformed CSV row rejection, and invalid JSON-shape rejection.

## Scope

The OpenTask JSON→CSV request specifies flat JSON objects; this implementation deliberately does not invent a flattening convention for nested structures. If a value is a nested list/object, JSON→CSV serializes that value deterministically as compact JSON in the cell.
