"""Validate the floorplan wire schema before fresh OR resumed results reach Java.

JSON Schema measures Unicode code points; Java String.length measures UTF-16
code units. Enforce the narrower server budget as well (e.g. emoji labels).
No schema validation grants image rights, publication or participant mappings.
"""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
from typing import Any
import jsonschema


def utf16_length(value: str) -> int:
    return len(value.encode('utf-16-le', errors='strict')) // 2


def _server_text_limits(value: Any, schema: dict[str, Any]) -> None:
    if isinstance(value, str):
        if 'maxLength' in schema and utf16_length(value) > schema['maxLength']:
            raise ValueError('Floorplan text exceeds the server UTF-16 length limit')
        if schema.get('minLength', 0) > 0 and not value.strip():
            raise ValueError('Floorplan required text must not be blank')
    elif isinstance(value, dict):
        for key, child in value.items():
            _server_text_limits(child, schema.get('properties', {}).get(key, {}))
    elif isinstance(value, list):
        for child in value:
            _server_text_limits(child, schema.get('items', {}))


def validate_payload(value: Any, schema_path: Path) -> None:
    schema = json.loads(schema_path.read_text(encoding='utf-8'))
    jsonschema.Draft202012Validator(schema, format_checker=jsonschema.FormatChecker()).validate(value)
    _server_text_limits(value, schema)
    if schema_path.name == 'floorplan-discovery.schema.json':
        if (value['status'] == 'FOUND') != bool(value['plans']):
            raise ValueError('Floorplan FOUND status and sources do not agree')
        if value['status'] != 'ERROR' and not value['checkedUrls']:
            raise ValueError('Floorplan discovery requires at least one checked URL')


def input_fingerprint(prompt: str, schema_path: Path, images: list[Path] | None) -> dict[str, Any]:
    identity = {'prompt': prompt,
                'schemaSha256': hashlib.sha256(schema_path.read_bytes()).hexdigest(),
                'imageHashes': [hashlib.sha256(p.read_bytes()).hexdigest() for p in images or []]}
    digest = hashlib.sha256(json.dumps(identity, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':')).encode('utf-8')).hexdigest()
    return {'inputSha256': digest, 'schemaSha256': identity['schemaSha256'],
            'imageHashes': identity['imageHashes']}


def result_fingerprint(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                    separators=(',', ':'), allow_nan=False).encode('utf-8')).hexdigest()
