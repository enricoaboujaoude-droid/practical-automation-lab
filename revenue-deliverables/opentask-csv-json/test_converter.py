import csv
import json
from pathlib import Path

import pytest

from converter import ConversionError, csv_to_json, json_to_csv


def test_json_to_csv_handles_missing_keys_and_special_chars(tmp_path: Path):
    src = tmp_path / "input.json"
    out = tmp_path / "output.csv"
    src.write_text(
        json.dumps([
            {"name": "Ada", "note": "hello, world", "age": 37},
            {"name": "Linus", "note": 'quote: "yes"'},
        ]),
        encoding="utf-8",
    )

    assert json_to_csv(src, out) == 2
    with out.open(encoding="utf-8", newline="") as fh:
        rows = list(csv.DictReader(fh))
    assert rows[0] == {"name": "Ada", "note": "hello, world", "age": "37"}
    assert rows[1] == {"name": "Linus", "note": 'quote: "yes"', "age": ""}


def test_csv_to_json_auto_detects_semicolon_and_preserves_unicode(tmp_path: Path):
    src = tmp_path / "input.csv"
    out = tmp_path / "output.json"
    src.write_text(
        'name;city;note\nZoë;Beirut;"a; b"\n李雷;上海;你好\n',
        encoding="utf-8",
    )

    assert csv_to_json(src, out, delimiter="auto") == 2
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data == [
        {"name": "Zoë", "city": "Beirut", "note": "a; b"},
        {"name": "李雷", "city": "上海", "note": "你好"},
    ]


def test_csv_to_json_rejects_extra_columns(tmp_path: Path):
    src = tmp_path / "bad.csv"
    out = tmp_path / "out.json"
    src.write_text("a,b\n1,2,3\n", encoding="utf-8")
    with pytest.raises(ConversionError, match="more fields"):
        csv_to_json(src, out, delimiter=",")


def test_json_to_csv_rejects_non_array(tmp_path: Path):
    src = tmp_path / "bad.json"
    out = tmp_path / "out.csv"
    src.write_text('{"a": 1}', encoding="utf-8")
    with pytest.raises(ConversionError, match="array of objects"):
        json_to_csv(src, out)
