"""Small OpenAI-compatible chat transport for DeepSeek and OpenRouter."""
import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class ModelError(ValueError):
    def __init__(self, message, usage=None, *, endpoint_failure=True):
        super().__init__(message)
        self.usage = usage or {}
        self.endpoint_failure = endpoint_failure


class ChatProvider:
    def __init__(self, *, base_url, model, api_key_env, max_output_tokens=2500,
                 timeout=60, retries=2, extra_body=None):
        url = urlparse(base_url)
        if url.scheme != 'https' and not (url.scheme == 'http' and url.hostname in {'localhost', '127.0.0.1', '::1'}):
            raise ValueError('Model endpoint must use HTTPS, or HTTP on localhost')
        if not url.hostname or url.username or url.password or url.query or url.fragment:
            raise ValueError('Invalid model endpoint')
        if not model or not 100 <= max_output_tokens <= 16000 or not 1 <= timeout <= 60 or not 0 <= retries <= 3:
            raise ValueError('Invalid model settings')
        self.url = base_url.rstrip('/') + '/chat/completions'
        self.model, self.api_key_env = model, api_key_env
        self.max_output_tokens, self.timeout, self.retries = max_output_tokens, timeout, retries
        self.extra_body = extra_body or {}
        if set(self.extra_body) - {'thinking', 'reasoning', 'reasoning_effort', 'temperature', 'provider'}:
            raise ValueError('Unsupported model extra_body option')

    @property
    def identity(self):
        return {'endpoint': self.url, 'model': self.model, 'max_output_tokens': self.max_output_tokens,
                'extra_body': self.extra_body}

    def complete(self, messages):
        key = os.environ.get(self.api_key_env, '') if self.api_key_env else ''
        if self.api_key_env and not key:
            raise ModelError(f'Set {self.api_key_env} before running model analysis')
        payload = {'model': self.model, 'messages': messages, 'stream': False,
                   'max_tokens': self.max_output_tokens, 'response_format': {'type': 'json_object'},
                   **self.extra_body}
        headers = {'Content-Type': 'application/json', 'User-Agent': 'BC-Election-Analysis/0.1'}
        if key:
            headers['Authorization'] = 'Bearer ' + key
        for attempt in range(self.retries + 1):
            try:
                request = Request(self.url, data=json.dumps(payload).encode(), headers=headers, method='POST')
                with urlopen(request, timeout=self.timeout) as response:
                    body = json.load(response)
                usage = body.get('usage', {})
                choices = body.get('choices', [])
                if not choices or choices[0].get('finish_reason') != 'stop':
                    raise ModelError('Model returned an incomplete or refused response', usage, endpoint_failure=False)
                message = choices[0].get('message', {})
                if message.get('refusal') or not isinstance(message.get('content'), str):
                    raise ModelError('Model did not return a JSON interpretation', usage, endpoint_failure=False)
                try:
                    result = json.loads(message['content'])
                except (ValueError, TypeError) as error:
                    raise ModelError('Model returned invalid JSON', usage, endpoint_failure=False) from error
                return result, {'usage': usage, 'response_id': body.get('id'),
                                'resolved_model': body.get('model', self.model), 'http_attempts': attempt + 1}
            except HTTPError as error:
                # Do not log response bodies, which can echo credentials or source text.
                if error.code in {429, 500, 502, 503, 504} and attempt < self.retries:
                    try:
                        delay = float(error.headers.get('Retry-After', 2 ** attempt))
                    except (ValueError, TypeError):
                        delay = 2 ** attempt
                    time.sleep(min(30, max(1, delay)))
                    continue
                raise ModelError(f'Model endpoint returned HTTP {error.code}') from error
            except (URLError, TimeoutError, OSError) as error:
                # Network timeouts may have incurred usage; do not blindly retry them.
                raise ModelError('Model endpoint could not be reached; request may have incurred usage') from error
        raise ModelError('Model request failed')
