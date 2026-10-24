import copy
import jsonschema
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from graph_worker import Worker, configuration, require_opened, schema
from run import RunError

PAGE = 'https://comicw.net/g/3309'
IMAGE = 'https://comicw.net/data/info/editor/sale.png'
SOURCE = {'url': IMAGE, 'kind': 'OFFICIAL', 'access': 'ORIGINAL', 'evidence': 'Actual attached sale sheet: postcard 1000 KRW'}

class ItemSourceTests(unittest.TestCase):
    def test_shared_sale_evidence_does_not_approve_uncited_individual_goods(self):
        result = {'sales': {'sources': [SOURCE], 'products': [{'name': 'Postcard', 'sources': []}]}}
        with self.assertRaisesRegex(RunError, r'sales.products\[0\]'):
            require_opened(result, {'openedUrls': [IMAGE]})

    def test_snippet_inaccessible_and_blank_original_are_not_item_evidence(self):
        for change in ({'access': 'SEARCH_SNIPPET'}, {'access': 'INACCESSIBLE'}, {'evidence': ' \n\t'}):
            result = {'sources': [SOURCE], 'goods': [{'name': 'Postcard', 'sources': [{**SOURCE, **change}]}]}
            with self.subTest(change=change), self.assertRaises(RunError):
                require_opened(result, {'openedUrls': [IMAGE]})

    def test_each_item_keeps_its_own_verified_original_without_inheritance(self):
        result = {'sales': {'sources': [SOURCE], 'products': [{'name': 'Postcard', 'sources': [SOURCE]}]}}
        original = copy.deepcopy(result)
        require_opened(result, {'openedUrls': [IMAGE]})
        self.assertEqual(original, result)
        with self.assertRaises(RunError):
            require_opened(result, {'openedUrls': [PAGE]})

    def test_second_nested_item_cannot_borrow_first_items_citation(self):
        result = {'goods': [{'name': 'Verified', 'sources': [SOURCE]}, {'name': 'Unverified', 'sources': []}], 'sources': [SOURCE]}
        with self.assertRaisesRegex(RunError, r'goods\[1\]'):
            require_opened(result, {'openedUrls': [IMAGE]})

    def test_generation_contract_requires_product_source_for_sales_and_creator(self):
        sale = next(v for v in schema('SALES')['properties']['sales']['anyOf'] if v.get('type') == 'object')
        contracts = [sale['properties']['products']['items']['properties']['sources'],
                     schema('CREATOR')['properties']['goods']['items']['properties']['sources']]
        for contract in contracts:
            with self.subTest(contract=contract):
                with self.assertRaises(jsonschema.ValidationError):
                    jsonschema.validate([], contract)
                jsonschema.validate([SOURCE], contract)
                # Unavailable observations remain representable for review; they
                # cannot become approved original evidence merely due to schema.
                jsonschema.validate([{**SOURCE, 'access': 'INACCESSIBLE'}], contract)

    def test_saved_uncited_candidate_is_enrich_before_approval_delivery(self):
        candidate = {'sales': {'sources': [SOURCE], 'products': [{'name': 'Postcard', 'sources': []}]}, 'participants': []}
        before = copy.deepcopy(candidate)
        class Api:
            def __init__(self): self.calls = []
            def request(self, method, path, body=None):
                self.calls.append((path, body))
                return {'verdict': body['verdict']} if path.endswith('/decide') else {}
        with tempfile.TemporaryDirectory() as temp:
            cfg = configuration(); cfg['stateDirectory'] = temp
            api = Api(); worker = Worker(cfg, api, source_loader=lambda urls: [])
            job = {'id': str(uuid.uuid4()), 'leaseToken': str(uuid.uuid4()), 'kind': 'SALES', 'context': {'input': {}},
                   'extraction': {'id': str(uuid.uuid4()), 'resultHash': 'b' * 64, 'result': candidate, 'context': {'input': {}}}}
            def review(directory, *args, **kwargs):
                directory.mkdir(parents=True, exist_ok=True)
                (directory / 'social-images.json').write_text('[]')
                return {'verdict': 'APPROVE', 'reason': 'Shared image checked'}, {'openedUrls': [IMAGE], 'imageHashes': []}
            with patch.object(worker, 'call', side_effect=review):
                worker.process(job)
            decisions = [body for path, body in api.calls if path.endswith('/decide')]
            self.assertEqual(1, len(decisions)); self.assertEqual('ENRICH', decisions[0]['verdict'])
            self.assertIn('sales.products[0]', decisions[0]['reason'])
            self.assertFalse(any(path.endswith('/extract') for path, _ in api.calls))
            self.assertEqual(before, candidate)
