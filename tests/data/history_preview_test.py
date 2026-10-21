import contextlib
import copy
import csv
import gzip
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('prepare_preview', pathlib.Path(__file__).parents[2] / 'scripts/data/prepare-history-preview.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class HistoryPreviewTest(unittest.TestCase):
    def test_only_same_size_and_identity_match(self):
        indices = {'Pullokoko': 0, 'Nimi': 1}
        item = {'values': [0.75, 'Example Riesling 2024']}
        row = {'volume_l': '0,75', 'name': 'Example Riesling 2018'}
        self.assertIsNone(preview.match_reason(row, item, indices))
        self.assertEqual(preview.match_reason({**row, 'volume_l': '1'}, item, indices), 'different_volume')
        self.assertEqual(preview.match_reason({**row, 'name': 'Another Riesling'}, item, indices), 'different_name')

    def test_equal_prices_retain_gaps_and_preserve_live_campaign(self):
        def point(date):
            return {'date': date, 'price': 10, 'archive': {'sourceId': date, 'lastSourceId': date, 'lastObserved': date, 'observations': 1}}
        live = {'date': '2026-01-26', 'price': 8, 'normalPrice': 10, 'campaignStart': '2026-01-26'}
        result = preview.compact_archive([point('2025-09-10'), point('2025-09-11'), point('2025-09-25'), live])
        self.assertEqual(result[0]['archive']['ranges'], [['2025-09-10', '2025-09-11'], ['2025-09-25', '2025-09-25']])
        self.assertEqual(result[0]['archive']['observations'], 3)
        self.assertEqual(result[-1], live)

    def test_import_is_repeatable_and_cannot_overwrite_recorded_price(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            base = {'schema': ['Numero', 'Nimi', 'Pullokoko', 'Hinta'],
                    'metadata': {'LastSynced': '2026-10-15T12:00:00Z', 'LastUpdated': '2026-10-15T12:00:00Z'},
                    'products': {'000123': {'values': ['000123', 'Wine 2024', 0.75, 12],
                    'priceHistory': [{'date': '2026-01-26', 'price': 11, 'normalPrice': 12, 'campaignEnd': '2026-01-31'}]}}}
            (root / 'base.json').write_text(json.dumps(base))
            inventory = [{'status': 'dated-price-data', 'source_id': date, 'dataset_date': date, 'source_url': 'https://example.com/' + date,
                          'actual_format': 'xlsx', 'scope': 'main/combined catalog', 'language': 'fi', 'sha256_uncompressed': date} for date in ['2025-09-10', '2026-01-26']]
            (root / 'inventory.json').write_text(json.dumps(inventory))
            (root / 'summary.json').write_text(json.dumps({'distinct_dates': 2, 'dates_by_year': {'2025': 1, '2026': 1}}))
            with gzip.open(root / 'price-observations.csv.gz', 'wt', newline='') as output:
                writer = csv.writer(output)
                writer.writerow(['snapshot_date', 'product_id', 'price_eur', 'name', 'volume_l', 'source_id'])
                writer.writerow(['2025-09-10', '000123', '10', 'Wine 2020', '0.75', '2025-09-10'])
                writer.writerow(['2026-01-26', '000123', '9', 'Wine 2020', '0.75', '2026-01-26'])
            with contextlib.redirect_stdout(io.StringIO()):
                data, report = preview.prepare(root, root / 'base.json', root / 'out')
                repeat, again = preview.prepare(root, root / 'out/data.json', root / 'again')
            self.assertEqual(data['products']['000123']['values'], base['products']['000123']['values'])
            self.assertEqual(data['products']['000123']['priceHistory'][-1], base['products']['000123']['priceHistory'][0])
            self.assertEqual(len(report['conflicts']), 1)
            self.assertEqual(data, repeat)
            self.assertEqual(report, again)


if __name__ == '__main__':
    unittest.main()
