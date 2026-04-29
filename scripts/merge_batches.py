"""Merge web-researched batch data into restaurants.json, then delete batch files."""
import json
import glob
import os

MERGE_FIELDS = ['website', 'address', 'lat', 'lng', 'walk_in_friendly',
                'reservation_required', 'reservation_platform',
                'description', 'popular_dishes', 'price_per_item', 'nyt_blurb']

data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
main_path = os.path.join(data_dir, 'restaurants.json')

restaurants = json.load(open(main_path, encoding='utf-8'))
by_id = {r['id']: r for r in restaurants}

batch_files = sorted(glob.glob(os.path.join(data_dir, 'enriched_batch_*.json')))
print(f'Found {len(batch_files)} batch files')

merged = 0
for bf in batch_files:
    entries = json.load(open(bf, encoding='utf-8'))
    for entry in entries:
        rid = entry.get('id')
        if rid not in by_id:
            print(f'  SKIP unknown id: {rid}')
            continue
        r = by_id[rid]
        for field in MERGE_FIELDS:
            val = entry.get(field)
            existing = r.get(field)
            # Prefer batch value if it is non-null and non-empty (and not False explicitly)
            # For walk_in_friendly/reservation_required, batch bool overrides null but not existing bool
            if val is None:
                continue
            if isinstance(val, list) and not val:
                continue
            if isinstance(val, str) and not val.strip():
                continue
            # Don't override a confirmed bool with None (already filtered above)
            # Do override empty strings and null
            if existing is None or existing == '' or existing == []:
                r[field] = val
                merged += 1
            elif field in ('description', 'popular_dishes', 'nyt_blurb', 'price_per_item', 'address'):
                # Prefer batch research (more recently verified) over knowledge-based
                r[field] = val
                merged += 1

json.dump(restaurants, open(main_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f'Merged {merged} field updates across {len(by_id)} restaurants.')

# Clean up batch files
for bf in batch_files:
    os.remove(bf)
    print(f'  Deleted {os.path.basename(bf)}')
print('Done.')
