#!/usr/bin/env python3
"""Convert flat JSON arrays to CSV and CSV files to JSON.

Python 3.10+; standard library only.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any, Iterable


class ConversionError(ValueError):
    """Raised when an input cannot be converted safely."""


def _read_json_array(path: Path) -> list[dict[str, Any]]:
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
    except FileNotFoundError as exc:
        raise ConversionError(f"input file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ConversionError(
            f"invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc

    if not isinstance(data, list):
        raise ConversionError("JSON input must be an array of objects")
    if any(not isinstance(row, dict) for row in data):
        raise ConversionError("every JSON array item must be an object")
    return data


def _ordered_keys(rows: Iterable[dict[str, Any]]) -> list[str]:
    keys: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row:
            if key not in seen:
                seen.add(key)
                keys.append(key)
    return keys


def _csv_scalar(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def json_to_csv(input_path: Path, output_path: Path, delimiter: str = ",") -> int:
    rows = _read_json_array(input_path)
    keys = _ordered_keys(rows)

    try:
        with output_path.open("w", encoding="utf-8", newline="") as fh:
            if not keys:
                return 0
            writer = csv.DictWriter(
                fh, fieldnames=keys, delimiter=delimiter, extrasaction="ignore"
            )
            writer.writeheader()
            for row in rows:
                writer.writerow(
                    {key: _csv_scalar(row.get(key, "")) for key in keys}
                )
    except OSError as exc:
        raise ConversionError(f"cannot write output file {output_path}: {exc}") from exc
    return len(rows)


def _resolve_delimiter(path: Path, requested: str) -> str:
    if requested != "auto":
        if len(requested) != 1:
            raise ConversionError("delimiter must be one character or 'auto'")
        return requested

    try:
        sample = path.read_text(encoding="utf-8")[:8192]
    except FileNotFoundError as exc:
        raise ConversionError(f"input file not found: {path}") from exc
    except OSError as exc:
        raise ConversionError(f"cannot read input file {path}: {exc}") from exc
    if not sample.strip():
        return ","
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        return ","


def csv_to_json(
    input_path: Path,
    output_path: Path,
    delimiter: str = "auto",
    indent: int | None = 2,
) -> int:
    actual_delimiter = _resolve_delimiter(input_path, delimiter)
    try:
        with input_path.open("r", encoding="utf-8-sig", newline="") as fh:
            reader = csv.DictReader(fh, delimiter=actual_delimiter, strict=True)
            if reader.fieldnames is None:
                raise ConversionError("CSV input is missing a header row")
            if any(name is None or name == "" for name in reader.fieldnames):
                raise ConversionError("CSV header contains an empty column name")
            rows = []
            for line_no, row in enumerate(reader, start=2):
                if None in row:
                    raise ConversionError(
                        f"row {line_no} has more fields than the header"
                    )
                rows.append(
                    {str(key): ("" if value is None else value) for key, value in row.items()}
                )
    except FileNotFoundError as exc:
        raise ConversionError(f"input file not found: {input_path}") from exc
    except csv.Error as exc:
        raise ConversionError(f"invalid CSV: {exc}") from exc
    except OSError as exc:
        raise ConversionError(f"cannot read input file {input_path}: {exc}") from exc

    try:
        with output_path.open("w", encoding="utf-8") as fh:
            json.dump(rows, fh, ensure_ascii=False, indent=indent)
            fh.write("\n")
    except OSError as exc:
        raise ConversionError(f"cannot write output file {output_path}: {exc}") from exc
    return len(rows)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Convert flat JSON arrays and CSV files in either direction."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    j2c = sub.add_parser("json-to-csv", help="convert a JSON array of objects to CSV")
    j2c.add_argument("input", type=Path)
    j2c.add_argument("output", type=Path)
    j2c.add_argument(
        "--delimiter", default=",", help="single-character CSV delimiter (default: comma)"
    )

    c2j = sub.add_parser("csv-to-json", help="convert CSV to a JSON array of objects")
    c2j.add_argument("input", type=Path)
    c2j.add_argument("output", type=Path)
    c2j.add_argument(
        "--delimiter", default="auto", help="one character or 'auto' (default)"
    )
    c2j.add_argument(
        "--compact", action="store_true", help="write compact JSON rather than indented JSON"
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "json-to-csv":
            if len(args.delimiter) != 1:
                raise ConversionError("delimiter must be one character")
            count = json_to_csv(args.input, args.output, args.delimiter)
        else:
            count = csv_to_json(
                args.input, args.output, args.delimiter, None if args.compact else 2
            )
    except ConversionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(f"converted {count} row(s) -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
