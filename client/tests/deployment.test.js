import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceURL } from '../src/helpers/deployment.js';

test('static deployments load public JSON files and keep finder separate', () => {
    for (const endpoint of [
        'parties',
        'guide',
        'questionnaire',
        'polling',
        'districts',
        'districts/RCC/ballot',
    ]) {
        assert.equal(
            resourceURL(`/api/${endpoint}`, true),
            `/data/${endpoint}.json`,
        );
        assert.equal(
            resourceURL(`/api/${endpoint}`, false),
            `/api/${endpoint}`,
        );
    }
    assert.equal(
        resourceURL('/api/constituency-finder', true),
        '/api/constituency-finder',
    );
    assert.equal(
        resourceURL('/content/assets/leaders/example.jpg', true),
        '/content/assets/leaders/example.jpg',
    );
});
