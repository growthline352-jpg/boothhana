"""Offline source-reader fixture; real fact validation still runs in tests."""
import json
from pathlib import Path

DOCS=json.loads((Path(__file__).resolve().parents[1]/'examples/v5/fact-documents.json').read_text(encoding='utf-8'))


def read_documents(urls,documents,blocked,fetch=None):
    for url in urls:
        documents[url]=dict(DOCS.get(url,dict(sourceUrl=url,status='INACCESSIBLE',issue='Not in offline fixture')))
    return documents
