"""Reusable candidate commitment-comparison pipeline.

Keep the public functions stable for collectors and existing research inputs.
"""
from .registry import PILLARS, PILLAR_IDS
from .evidence import profile_hash, window
from .preparation import prepare
from .validation import validate_dossier, validate_result
from .drafting import run
from .publication import build_reviewed, project
