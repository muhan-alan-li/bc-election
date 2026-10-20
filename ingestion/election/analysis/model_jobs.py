"""Cached model requests with an explicit per-job budget and retained attempts."""
from pathlib import Path
import json
from threading import Lock
import time

from ..storage import atomic_json, read_json, now
from ..pipeline import safe_id
from .service import digest, provider_from_config


class PendingWork(ValueError):
    pass


def stage_provider(config, stage):
    settings = {**config.get('political_analysis', {}), **config.get(stage, {})}
    return provider_from_config({'political_analysis': settings})


class ModelJobs:
    def __init__(self, root, election_id, stage, provider, *, max_calls=0, offline=False, requests_per_minute=0):
        if type(max_calls) is not int or not 0 <= max_calls <= 10000:
            raise ValueError('Model job budget must be between 0 and 10000')
        self.folder = Path(root) / 'normalized/model-jobs' / safe_id(stage) / safe_id(election_id)
        self.provider, self.max_calls, self.offline = provider, max_calls, offline
        self.audit = {'model_calls': 0, 'cache_hits': 0, 'prompt_tokens': 0, 'completion_tokens': 0}
        self.lock = Lock()
        self.endpoint_error = None
        self.interval = 60 / requests_per_minute if requests_per_minute else 0
        self.next_request = 0

    def checkpoint(self, candidate_id, status, error=None):
        with self.lock:
            record = {**self.audit, 'candidate_id': candidate_id, 'status': status, 'updated_at': now()}
        if error:
            record['error'] = str(error)
        atomic_json(self.folder / 'live-audit.json', record)

    def complete(self, candidate_id, messages, validate, *, bindings):
        key = digest({'messages': messages, 'provider': self.provider.identity, 'bindings': bindings})
        folder = self.folder / safe_id(candidate_id)
        path = folder / 'results' / (key + '.json')
        cached = read_json(path)
        if cached:
            if cached.get('bindings') != bindings or cached.get('provider') != self.provider.identity:
                raise ValueError('Model job cache provenance does not match its inputs')
            validate(cached['result'])
            with self.lock:
                self.audit['cache_hits'] += 1
            return cached['result'], key
        with self.lock:
            if self.endpoint_error:
                raise PendingWork('Model requests stopped after a connection failure')
            if self.offline or self.audit['model_calls'] >= self.max_calls:
                raise PendingWork('No cached result; more model-call budget is required')
            self.audit['model_calls'] += 1
            delay = max(0, self.next_request - time.monotonic())
            self.next_request = time.monotonic() + delay + self.interval
            call_number = self.audit['model_calls']
        if delay:
            time.sleep(delay)
        self.checkpoint(candidate_id, 'requesting')
        print(f'Model job {self.folder.parent.name}: {candidate_id}, request {call_number}', flush=True)
        try:
            result, metadata = self.provider.complete(messages)
        except ValueError as error:
            if getattr(error, 'endpoint_failure', False):
                with self.lock:
                    self.endpoint_error = str(error)
            self.checkpoint(candidate_id, 'failed', error)
            raise
        with self.lock:
            for field in ('prompt_tokens', 'completion_tokens'):
                self.audit[field] += metadata.get('usage', {}).get(field, 0)
        record = {'bindings': bindings, 'provider': self.provider.identity, 'result': result, 'metadata': metadata}
        atomic_json(folder / 'attempts' / (key + '.json'), record)
        validate(result)
        atomic_json(path, record)
        self.checkpoint(candidate_id, 'completed')
        return result, key

    def complete_validated(self, candidate_id, messages, validate, *, bindings, repairs=2):
        """Give bounded validation feedback without relaxing evidence requirements."""
        messages = list(messages)
        for correction in range(repairs + 1):
            current = {**bindings, 'validation_correction': correction} if correction else bindings
            key = digest({'messages': messages, 'provider': self.provider.identity, 'bindings': current})
            attempt = self.folder / safe_id(candidate_id) / 'attempts' / (key + '.json')
            try:
                retained = read_json(attempt)
                if retained:
                    validate(retained['result'])
                return self.complete(candidate_id, messages, validate, bindings=current)
            except (ValueError, KeyError, TypeError) as error:
                if isinstance(error, PendingWork) or getattr(error, 'endpoint_failure', False) or correction == repairs:
                    raise
                retained = read_json(attempt)
                if not retained:
                    if str(error) != 'Model returned invalid JSON':
                        raise
                    messages += [{'role': 'user', 'content': 'The response could not be parsed as JSON. Return one valid JSON object matching the original schema, with no surrounding prose or markdown.'}]
                    continue
                messages += [{'role': 'assistant', 'content': json.dumps(retained['result'], ensure_ascii=False)},
                             {'role': 'user', 'content': 'Validation rejected this JSON: ' + str(error) +
                              '. Correct the response using only the original supplied evidence. Preserve the schema. '
                              'Do not invent evidence to satisfy validation; omit unsupported cases or report insufficient evidence.'}]
