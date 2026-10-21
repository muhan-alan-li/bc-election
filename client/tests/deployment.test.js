import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceURL } from '../src/helpers/deployment.js';

test('static paths map API resources to public JSON files', () => {
    for (const endpoint of [
        'parties',
        'guide',
        'questionnaire',
        'polling',
        'districts',
        'districts/RCC/ballot',
    ]) {
        assert.equal(resourceURL(`/api/${endpoint}`), `/data/${endpoint}.json`);
    }
    assert.equal(
        resourceURL('/content/assets/leaders/example.jpg'),
        '/content/assets/leaders/example.jpg',
    );
});
