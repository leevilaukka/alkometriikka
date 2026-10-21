"""Build a local, reproducible price-history preview from recovered observations.

python scripts/data/prepare-history-preview.py --research /path/to/alko-history-research \
    --base /path/to/current-data.json --out static

Only product ID + bottle size + normalized product name matches are accepted.
The base catalog, live observations, prices and sale metadata remain intact.
"""
import argparse
import collections
import copy
import csv
import datetime as dt
import decimal
import gzip
import hashlib
import json
import pathlib
import re
import unicodedata


def normalized_name(value):
    text = unicodedata.normalize('NFKD', str(value)).casefold()
    text = ''.join(char for char in text if not unicodedata.combining(char))
    text = re.sub(r'\b(?:19|20)\d{2}\b', ' ', text)
    return ' '.join(re.findall(r'\w+', text))


def volume(value):
    if value is None:
        return None
    try:
        return decimal.Decimal(re.sub(r'\s*l\s*$', '', str(value).strip(), flags=re.I).replace(',', '.'))
    except decimal.InvalidOperation:
        return None


def match_reason(row, product, indices):
    values = product['values']
    old_size, new_size = volume(row['volume_l']), volume(values[indices['Pullokoko']])
    if old_size is None or new_size is None:
        return 'missing_volume'
    if old_size != new_size:
        return 'different_volume'
    if normalized_name(row['name']) != normalized_name(values[indices['Nimi']]):
        return 'different_name'
    return None


def compact_archive(points):
    """Collapse equal archive prices, retaining each observed range and its gaps."""
    result = []
    for point in points:
        previous = result[-1] if result else None
        evidence = previous.get('archive') if previous else None
        adjacent = evidence and (
            dt.date.fromisoformat(point['date']) - dt.date.fromisoformat(evidence['lastObserved'])
        ).days == 1
        if evidence and point.get('archive') and previous['price'] == point['price']:
            if not adjacent:
                evidence.setdefault('ranges', [[previous['date'], evidence['lastObserved']]])
                evidence['ranges'].append([point['date'], point['date']])
            elif 'ranges' in evidence:
                evidence['ranges'][-1][1] = point['date']
            evidence['lastObserved'] = point['date']
            evidence['lastSourceId'] = point['archive']['sourceId']
            evidence['observations'] += 1
        else:
            result.append(copy.deepcopy(point))
    return result


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def prepare(research, base_path, output):
    base_bytes = base_path.read_bytes()
    dataset = json.loads(base_bytes)
    # Rebuilding from a previous preview starts from the preserved live baseline.
    if dataset.get('metadata', {}).pop('historyPreview', None):
        for item in dataset['products'].values():
            item['priceHistory'] = [point for point in item.get('priceHistory', []) if not point.get('archive')]
    base_bytes = json.dumps(dataset, ensure_ascii=False, separators=(',', ':')).encode()
    indices = {name: index for index, name in enumerate(dataset['schema'])}
    catalog = dataset['products']
    inventory = json.loads((research / 'inventory.json').read_text(encoding='utf-8'))
    summary = json.loads((research / 'summary.json').read_text(encoding='utf-8'))
    sources = {}
    for item in inventory:
        if item['status'] != 'dated-price-data':
            continue
        sources.setdefault(item['source_id'], {
            'id': item['source_id'], 'date': item['dataset_date'],
            'url': item['source_url'], 'format': item['actual_format'],
            'scope': item['scope'], 'language': item['language'],
            'sha256': item['sha256_uncompressed'],
        })
    counts = collections.Counter()
    held = {}
    original_histories = {
        pid: {point['date']: point for point in item.get('priceHistory', [])}
        for pid, item in catalog.items()
    }
    candidates = collections.defaultdict(dict)
    observation_counts = collections.Counter()
    dates = set()
    accepted_source_ids = set()
    conflicts = []
    with gzip.open(research / 'price-observations.csv.gz', 'rt', newline='', encoding='utf-8') as input_file:
        for row in csv.DictReader(input_file):
            counts['observationsRead'] += 1
            pid, date = row['product_id'], row['snapshot_date']
            if pid not in catalog:
                counts['notInCatalog'] += 1
                continue
            reason = match_reason(row, catalog[pid], indices)
            if reason:
                counts[reason] += 1
                held.setdefault((pid, reason), {
                    'id': pid, 'reason': reason, 'historicalName': row['name'],
                    'currentName': catalog[pid]['values'][indices['Nimi']],
                    'historicalVolume': row['volume_l'],
                    'currentVolume': catalog[pid]['values'][indices['Pullokoko']],
                    'sampleDate': date, 'sourceUrl': sources[row['source_id']]['url'],
                })
                continue
            price = float(decimal.Decimal(row['price_eur']))
            if price <= 0 or len(pid) != 6 or not pid.isdigit():
                raise ValueError('Invalid normalized observation: ' + repr(row))
            source = sources[row['source_id']]
            if source['date'] != date:
                raise ValueError('Source date does not match observation')
            existing = original_histories[pid].get(date)
            if existing:
                if round(existing['price'] * 100) != round(price * 100):
                    counts['conflictsWithRecordedPrice'] += 1
                    conflicts.append({'id': pid, 'date': date, 'recordedPrice': existing['price'],
                                      'archivePrice': price, 'sourceUrl': source['url']})
                else:
                    counts['alreadyRecorded'] += 1
                continue
            # An archive can never replace the current or a future observation.
            if date >= dataset['metadata']['LastSynced'][:10]:
                counts['afterBaseSnapshot'] += 1
                continue
            candidates[pid][date] = {
                'date': date, 'price': price,
                'archive': {'sourceId': source['id'],
                            'lastObserved': date, 'lastSourceId': source['id'], 'observations': 1},
            }
            observation_counts[pid] += 1
            accepted_source_ids.add(source['id'])
            dates.add(date)
    products = []
    for pid, archive in candidates.items():
        item = catalog[pid]
        live = copy.deepcopy(item.get('priceHistory', []))
        merged = sorted([*live, *archive.values()], key=lambda point: point['date'])
        merged = compact_archive(merged)
        item['priceHistory'] = merged
        archived = [point for point in merged if point.get('archive')]
        counts['archivePoints'] += len(archived)
        # Every original observation, including campaign metadata, is preserved.
        for point in live:
            assert point in merged
        products.append({
            'id': pid, 'name': item['values'][indices['Nimi']],
            'volume': float(volume(item['values'][indices['Pullokoko']])),
            'price': float(str(item['values'][indices['Hinta']]).replace(',', '.')) if item['values'][indices['Hinta']] is not None else None,
            'firstDate': archived[0]['date'],
            'lastDate': max(point['archive']['lastObserved'] for point in archived),
            'archivePoints': len(archived), 'observations': observation_counts[pid],
            'removed': bool(item.get('meta', {}).get('removedFromSelection')),
        })
    counts['products'] = len(products)
    counts['acceptedObservations'] = sum(observation_counts.values())
    # The current catalog values and sale history must remain byte-equivalent.
    original = json.loads(base_bytes)
    assert {pid: item['values'] for pid, item in catalog.items()} == {
        pid: item['values'] for pid, item in original['products'].items()
    }
    with open(research / 'price-observations.csv.gz', 'rb') as input_file:
        source_digest = hashlib.file_digest(input_file, 'sha256').hexdigest()
    version = hashlib.sha256(('history-preview-v1:' + hashlib.sha256(base_bytes).hexdigest() + source_digest).encode()).hexdigest()[:16]
    first_date, last_date = min(dates), max(dates)
    dataset['metadata']['historyPreview'] = {
        'version': version, 'reportUrl': '/history-preview.json', 'products': len(products),
        'firstDate': first_date, 'lastDate': last_date,
    }
    report = {
        'version': version, 'baseLastSynced': dataset['metadata']['LastSynced'],
        'baseSha256': hashlib.sha256(base_bytes).hexdigest(), 'criteria': 'product-id + bottle-volume + normalized-name (vintage year ignored)',
        'statistics': dict(counts), 'rawSnapshotDates': summary['distinct_dates'],
        'firstDate': first_date, 'lastDate': last_date, 'acceptedDates': sorted(dates),
        'collectedDatesByYear': summary['dates_by_year'],
        'sources': sorted(sources.values(), key=lambda source: (source['date'], source['id'])),
        'acceptedSourceIds': sorted(accepted_source_ids),
        'products': sorted(products, key=lambda product: (-product['archivePoints'], product['name'])),
        'review': sorted(held.values(), key=lambda row: (row['id'], row['reason'])),
        'conflicts': conflicts,
        'notes': ['Arkistohinnat ovat havaintoja hinnaston päivältä, eivät varmistettuja hinnanmuutospäiviä.',
                  'Vuosien väliin jääviä havaintoaukkoja ei ole täytetty.',
                  'Tuotteen nykyhintaa, valikoimatilaa tai kampanjatietoja ei ole muutettu.'],
    }
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / 'data.json', dataset)
    write_json(output / 'history-preview.json', report)
    # Seed availability from the same captured deployment if it is available.
    print(json.dumps({'version': version, 'statistics': dict(counts), 'firstDate': first_date,
                      'lastDate': last_date, 'dataBytes': (output / 'data.json').stat().st_size,
                      'gzipDataBytes': len(gzip.compress((output / 'data.json').read_bytes(), mtime=0))}, indent=2))
    return dataset, report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--research', type=pathlib.Path, required=True)
    parser.add_argument('--base', type=pathlib.Path, required=True)
    parser.add_argument('--out', type=pathlib.Path, default=pathlib.Path('static'))
    args = parser.parse_args()
    prepare(args.research.resolve(), args.base.resolve(), args.out.resolve())
