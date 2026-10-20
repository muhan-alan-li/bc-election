"""Compatibility entry point for the containerized collection adapter."""
from election.collection.platform_discovery import main, discover

if __name__ == "__main__":
    raise SystemExit(main())
