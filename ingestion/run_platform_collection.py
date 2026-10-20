"""Compatibility entry point for the containerized collection adapter."""
from election.collection.platform_collection import main, run

if __name__ == "__main__":
    raise SystemExit(main())
