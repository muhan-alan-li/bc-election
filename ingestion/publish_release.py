"""Build a local publication generation from existing polished data; no collection or model calls."""
import argparse
from pathlib import Path
from election.releases import publish_release, rollback

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--storage', type=Path, default=Path(__file__).resolve().parent / 'storage')
    parser.add_argument('--election', default='bc-provincial-2026')
    parser.add_argument('--content-dir', type=Path)
    parser.add_argument('--rollback', action='store_true')
    args = parser.parse_args()
    if args.rollback:
        print('Restored generation', rollback(args.storage, args.election))
    else:
        print('Published generation', publish_release(args.storage, args.election, content_dir=args.content_dir))
