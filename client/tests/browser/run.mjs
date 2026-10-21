// A dependency-free Chrome DevTools regression suite. It builds synthetic data
// and serves the resulting static site; no application server is used.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { resourceURL } from '../../src/helpers/deployment.js';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'bc-browser-'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const port = Number(
    process.env.BC_TEST_PORT || 20000 + Math.floor(Math.random() * 10000),
);
const debugPort = port + 1000;
const externalURL =
    process.env.BC_TEST_URL ||
    process.argv.find((arg) => arg.startsWith('--live='))?.slice(7);
const baseURL = externalURL || `http://127.0.0.1:${port}`;
let chrome, socket;
const logs = [];
const pending = new Map();
let nextID = 0;
const exceptions = [],
    requests = [],
    violations = [];
let interception = null;
const election = 'bc-provincial-2026';
let staticServer;
const staticRequests = [];
let slowPostal = false;
async function json(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(value));
}
function candidate(code) {
    return {
        id: `candidate-${code}`,
        person_id: `person-${code}`,
        election_id: election,
        district_id: `district-${code}`,
        ballot_name: code === 'RCC' ? 'Alex Example' : 'Other Example',
        party_id: null,
        affiliation: 'independent',
        status: 'listed',
        source: {
            url: 'https://example.org/roster.csv',
            sha256: '0'.repeat(64),
            retrieved_at: '2026-10-01T00:00:00Z',
        },
    };
}

function send(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = ++nextID;
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(Error(`CDP timed out: ${method}`));
        }, 15000);
        pending.set(id, {
            resolve: (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            reject: (error) => {
                clearTimeout(timer);
                reject(error);
            },
        });
        socket.send(JSON.stringify({ id, method, params }));
    });
}
async function evaluate(expression) {
    const value = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    if (value.exceptionDetails)
        throw Error(JSON.stringify(value.exceptionDetails));
    return value.result.value;
}
async function until(expression) {
    for (let i = 0; i < 150; i++) {
        if (await evaluate(expression)) return;
        await delay(60);
    }
    throw Error(
        `Timed out: ${expression}\n${await evaluate('document.body.innerText')}`,
    );
}
async function route(hash) {
    await evaluate(`location.hash=${JSON.stringify(hash)}`);
}
async function metric(width, height) {
    await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 600,
    });
}
async function shot(name) {
    await writeFile(
        path.join(temporary, `${name}.png`),
        Buffer.from(
            (await send('Page.captureScreenshot', { format: 'png' })).data,
            'base64',
        ),
    );
}
async function intercept(pattern, fn) {
    pattern = resourceURL(pattern);
    interception = fn;
    await send('Fetch.enable', { patterns: [{ urlPattern: `*${pattern}*` }] });
}
async function unintercept() {
    interception = null;
    await send('Fetch.disable');
}
async function fulfill(event, body, status = 200, type = 'application/json') {
    await send('Fetch.fulfillRequest', {
        requestId: event.requestId,
        responseCode: status,
        responseHeaders: [{ name: 'Content-Type', value: type }],
        body: Buffer.from(
            typeof body === 'string' ? body : JSON.stringify(body),
        ).toString('base64'),
    });
}
async function start() {
    if (!externalURL) {
        const data = path.join(temporary, 'published');
        const districts = ['RCC', 'OTH'].map((code) => ({
            id: `district-${code}`,
            official_code: code,
            name: code === 'RCC' ? 'Richmond Centre' : 'Other Constituency',
            roster_status: 'final_roster',
            candidate_count: 1,
        }));
        for (const d of districts)
            await json(
                path.join(data, election, 'ballots', `${d.official_code}.json`),
                {
                    schema_version: 1,
                    election_id: election,
                    district: d,
                    parties: [],
                    candidacies: [candidate(d.official_code)],
                },
            );
        await json(path.join(data, election, 'catalog.json'), {
            schema_version: 1,
            election_id: election,
            districts,
        });
        const output = path.join(temporary, 'static-site');
        execFileSync(process.execPath, ['build.js'], {
            cwd: path.join(repo, 'client'),
            env: {
                ...process.env,
                BC_PUBLISHED_DIR: data,
                BC_STATIC_OUTPUT: output,
                BC_FINDER_DATASET: path.join(
                    repo,
                    'client/tests/fixtures/static-finder.json',
                ),
            },
            stdio: 'inherit',
        });
        const headerFile = await readFile(
            path.join(output, '_headers'),
            'utf8',
        );
        const security = Object.fromEntries(
            headerFile
                .split('\n')
                .filter(
                    (line) =>
                        line.startsWith('  ') &&
                        !line.includes('Cache-Control'),
                )
                .map((line) => {
                    const colon = line.indexOf(':');
                    return [
                        line.slice(0, colon).trim(),
                        line.slice(colon + 1).trim(),
                    ];
                }),
        );
        staticServer = createServer(async (req, res) => {
            const name = new URL(req.url, baseURL).pathname;
            staticRequests.push(name);
            if (slowPostal && name.endsWith('/postal/V0A.bin'))
                await delay(700);
            const file = path.resolve(
                output,
                '.' + (name === '/' ? '/index.html' : name),
            );
            if (!file.startsWith(output + path.sep)) {
                res.writeHead(404).end();
                return;
            }
            try {
                const body = await readFile(file);
                const mime =
                    {
                        '.json': 'application/json',
                        '.js': 'text/javascript',
                        '.css': 'text/css',
                        '.html': 'text/html',
                        '.jpg': 'image/jpeg',
                    }[path.extname(file)] || 'application/octet-stream';
                res.writeHead(200, {
                    ...security,
                    'Content-Type': mime,
                }).end(body);
            } catch {
                res.writeHead(404).end('Not found');
            }
        });
        await new Promise((resolve) =>
            staticServer.listen(port, '127.0.0.1', resolve),
        );
    }
    let ready = false;
    for (let i = 0; i < 150; i++) {
        try {
            if ((await fetch(`${baseURL}/`)).ok) {
                ready = true;
                break;
            }
        } catch {}
        await delay(100);
    }
    assert.ok(ready, `Server starts: ${logs.join('')}`);
    const candidates = [
        process.env.CHROME_BIN,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
    ].filter(Boolean);
    let executable;
    for (const file of candidates) {
        try {
            await access(file);
            executable = file;
            break;
        } catch {}
    }
    assert.ok(executable, 'Set CHROME_BIN to a Chrome/Chromium executable');
    chrome = spawn(
        executable,
        [
            '--headless=new',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-dev-shm-usage',
            `--remote-debugging-port=${debugPort}`,
            `--user-data-dir=${path.join(temporary, 'chrome')}`,
            'about:blank',
        ],
        { stdio: 'ignore' },
    );
    ready = false;
    for (let i = 0; i < 100; i++) {
        try {
            if (
                (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok
            ) {
                ready = true;
                break;
            }
        } catch {}
        await delay(100);
    }
    assert.ok(ready, 'Chrome starts');
    const target = await (
        await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, {
            method: 'PUT',
        })
    ).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve);
        socket.addEventListener('error', reject);
    });
    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (message.id) {
            const item = pending.get(message.id);
            if (!item) return;
            pending.delete(message.id);
            message.error
                ? item.reject(Error(JSON.stringify(message.error)))
                : item.resolve(message.result);
        } else if (message.method === 'Runtime.exceptionThrown')
            exceptions.push(message.params.exceptionDetails);
        else if (message.method === 'Network.requestWillBeSent')
            requests.push(message.params.request.url);
        else if (
            message.method === 'Audits.issueAdded' &&
            message.params.issue.code === 'ContentSecurityPolicyIssue'
        )
            violations.push(message.params.issue);
        else if (message.method === 'Fetch.requestPaused') {
            const task = interception
                ? interception(message.params)
                : send('Fetch.continueRequest', {
                      requestId: message.params.requestId,
                  });
            Promise.resolve(task).catch((error) => logs.push(error.stack));
        }
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Audits.enable');
}

try {
    await start();
    await metric(1440, 1000);
    await send('Page.navigate', { url: `${baseURL}/#/match` });
    await until('document.querySelectorAll(".match-party").length===10');
    assert.ok(
        !requests.some(
            (url) =>
                url.endsWith('/data/districts.json') ||
                url.endsWith('/data/guide.json') ||
                /Finder-.*\.js/.test(url),
        ),
        'Questionnaire avoids directory, guide and map requests',
    );
    assert.ok(await evaluate('!document.querySelector(".quiz-methodology")'));
    assert.ok(
        await evaluate(
            '[...document.querySelectorAll(".match-party")].every(p=>p.textContent.includes("Verified positions:"))',
        ),
    );
    await evaluate(
        'document.querySelector(".quiz-panel.is-active input[value=yes]").click()',
    );
    await until(
        'document.querySelector(".quiz-panel.is-active .primary-button")?.textContent.includes("Next")',
    );
    await evaluate(
        'document.querySelector(".quiz-panel.is-active .quiz-actions .secondary").click()',
    );
    await until(
        'document.querySelector(".quiz-panel.is-active .primary-button")?.textContent.includes("Skip")',
    );
    assert.equal(
        await evaluate(
            'document.querySelector(".quiz-panel.is-active input:checked")',
        ),
        null,
    );
    await evaluate(
        'document.querySelector(".quiz-panel.is-active .primary-button").click()',
    );
    await until('document.activeElement.id.startsWith("question-title-")');
    await evaluate(
        'document.querySelector(".quiz-panel.is-active input[value=no]").click()',
    );
    await evaluate('document.querySelector(".quiz-topline button").click()');
    await until('document.activeElement.textContent==="Your answers"');
    assert.ok(
        await evaluate(
            'document.querySelector(".answer-review")?.textContent.includes("Skipped")',
        ),
    );
    await send('Page.reload');
    await until(
        'document.querySelector(".quiz-topline")?.textContent.includes("1 answered")',
    );
    console.log(
        'PASS questionnaire selection, clear, skip, review focus and session restoration',
    );

    for (const width of [430, 390, 375, 360, 320]) {
        await metric(width, 844);
        assert.equal(
            await evaluate('document.documentElement.scrollWidth > innerWidth'),
            false,
        );
        assert.equal(
            await evaluate(
                'getComputedStyle(document.querySelector(".match-party-list")).gridTemplateColumns.split(" ").length',
            ),
            1,
        );
        async function assertControlRow() {
            const rects = await evaluate(
                '[...document.querySelectorAll(".quiz-panel.is-active .quiz-controls button")].map(x=>({left:x.getBoundingClientRect().left,right:x.getBoundingClientRect().right,center:x.getBoundingClientRect().top + x.getBoundingClientRect().height / 2,height:x.getBoundingClientRect().height}))',
            );
            assert.equal(rects.length, 3);
            assert.ok(
                rects.every((r) => Math.abs(r.center - rects[0].center) < 1),
                'Back, Clear and Next/Skip/Review stay in one row',
            );
            assert.ok(
                rects.every(
                    (r) => r.left >= 0 && r.right <= width && r.height >= 40,
                ),
            );
        }
        await assertControlRow();
        await evaluate(
            'document.querySelector(".quiz-panel.is-active input[value=yes]").click()',
        );
        await until(
            'document.querySelector(".quiz-panel.is-active .primary-button")?.getAttribute("aria-label")==="Next question"',
        );
        await assertControlRow();
        await evaluate(
            'document.querySelector(".quiz-panel.is-active .quiz-actions .secondary").click()',
        );
        await until(
            'document.querySelector(".quiz-panel.is-active .primary-button")?.getAttribute("aria-label")==="Skip question"',
        );
        await evaluate(
            'document.querySelector(".quiz-topline button").click()',
        );
        await until('document.querySelector(".answer-review")');
        await evaluate(
            '[...document.querySelectorAll(".answer-review button")].at(-1).click()',
        );
        await until(
            'document.querySelector(".quiz-panel.is-active .primary-button")?.getAttribute("aria-label")==="Review answers"',
        );
        await assertControlRow();
        await evaluate(
            'document.querySelector(".quiz-topline button").click()',
        );
        await until('document.querySelector(".answer-review")');
        await evaluate(
            'document.querySelector(".answer-review button").click()',
        );
        await until('document.querySelector(".quiz-panel.is-active input")');
        await shot(`match-${width}`);
    }
    console.log('PASS narrow layouts and adjacent quiz actions');

    await route('#/parties');
    await until(
        'document.querySelector(".party-card") && document.title.startsWith("Parties")',
    );
    await until('document.activeElement.id==="page-title"');
    await evaluate('document.querySelector(".party-card").click()');
    await until('document.querySelector(".policy-card")');
    await evaluate(
        'document.querySelector(".policy-card").focus(); document.querySelector(".policy-card").click()',
    );
    await until('document.querySelector("dialog[open]")');
    assert.ok(
        await evaluate(
            'document.querySelector("dialog").contains(document.activeElement)',
        ),
    );
    await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
    });
    await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
    });
    await until('!document.querySelector("dialog[open]")');
    assert.equal(
        await evaluate(
            'document.activeElement.classList.contains("policy-card")',
        ),
        true,
    );
    console.log(
        'PASS route titles, heading focus and modal Escape/focus restoration',
    );

    await route('#/constituencies');
    await until('document.querySelector(".constituency-table")');
    assert.equal(
        await evaluate('document.documentElement.scrollWidth > innerWidth'),
        false,
    );
    await evaluate(
        'document.getElementById("constituency-search")?.focus() || document.querySelector("input[type=search]").focus()',
    );
    await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
    });
    await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
        modifiers: 8,
    });
    assert.ok(
        await evaluate(
            'getComputedStyle(document.querySelector("input[type=search]")).outlineStyle !== "none"',
        ),
        'Keyboard input outline remains visible',
    );
    assert.ok(
        !staticRequests.some((url) => url.startsWith('/finder/')),
        'Finder data stays lazy',
    );
    await evaluate(
        '(()=>{const button=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("Find my constituency"));button.focus();button.click();})()',
    );
    await until('document.querySelector("dialog .leaflet-pane")');
    const submitPostal = async (code) => {
        await evaluate(
            `(()=>{const input=document.getElementById("finder-postal"); input.value=${JSON.stringify(code)}; input.dispatchEvent(new Event("input",{bubbles:true}));})()`,
        );
        await evaluate(
            'document.querySelector(".finder-panel form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))',
        );
    };
    await submitPostal('V6Y 1N9');
    await until(
        'document.querySelector(".finder-district")?.textContent.includes("Richmond Centre")',
    );
    assert.ok(
        !staticRequests.some(
            (url) =>
                url.includes('/detailed/') || url.includes('/ambiguities/'),
        ),
        'Ordinary postal lookup avoids detailed geometry',
    );
    assert.ok(
        !(await evaluate(
            '!!document.querySelector(".leaflet-interactive.leaflet-circle-marker")',
        )),
        'Postal result has no home pin',
    );
    await shot('finder-static-mobile');
    slowPostal = true;
    await submitPostal('V0A 0A0');
    for (
        let i = 0;
        i < 100 &&
        !staticRequests.some((url) => url.endsWith('/postal/V0A.bin'));
        i++
    )
        await delay(20);
    assert.ok(staticRequests.some((url) => url.endsWith('/postal/V0A.bin')));
    await submitPostal('V6Y 1N9');
    await until(
        'document.querySelector(".finder-district")?.textContent.includes("Richmond Centre")',
    );
    await delay(800);
    assert.ok(
        await evaluate(
            'document.querySelector(".finder-district")?.textContent.includes("Richmond Centre")',
        ),
    );
    slowPostal = false;
    await submitPostal('V6Y 1N8');
    await until('document.querySelectorAll(".finder-district").length===2');
    assert.ok(staticRequests.some((url) => url.includes('/ambiguities/')));
    await submitPostal('V6Y 1N0');
    await until(
        'document.querySelector(".finder-panel [role=alert]")?.textContent.includes("missing")',
    );
    await submitPostal('V6Y 1N9');
    await until('document.querySelectorAll(".finder-district").length===1');
    // Browser coordinates near a shared edge must fetch exact geometry.
    await send('Browser.grantPermissions', {
        origin: baseURL,
        permissions: ['geolocation'],
    });
    await send('Emulation.setGeolocationOverride', {
        latitude: 49.16,
        longitude: -123.1001,
        accuracy: 50,
    });
    await evaluate('document.querySelector(".location-button").click()');
    await until('document.querySelectorAll(".finder-district").length===2');
    assert.ok(staticRequests.some((url) => url.includes('/detailed/')));
    assert.ok(
        await evaluate(
            'document.querySelector(".finder-result")?.textContent.includes("selected location")',
        ),
    );
    await evaluate(
        'document.querySelector(".finder-map").scrollIntoView({block:"center"})',
    );
    const mapPoint = await evaluate(
        '(()=>{const r=document.querySelector(".finder-map").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()',
    );
    await send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...mapPoint,
        button: 'left',
        clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        ...mapPoint,
        button: 'left',
        clickCount: 1,
    });
    await until(
        'document.querySelector(".finder-result")?.textContent.includes("selected location")',
    );
    await evaluate('document.querySelector(".finder-head button").click()');
    await until('!document.querySelector(".finder-panel")');
    assert.ok(
        await evaluate(
            'document.activeElement.textContent.includes("Find my constituency")',
        ),
    );
    // Closing terminates the worker; reopening must still start cleanly.
    await evaluate(
        '(()=>{const button=[...document.querySelectorAll("button")].find(x=>x.textContent.includes("Find my constituency"));button.focus();button.click();})()',
    );
    await submitPostal('V6Y 1N9');
    await until(
        'document.querySelector(".finder-district")?.textContent.includes("Richmond Centre")',
    );
    await evaluate('document.querySelector(".finder-head button").click()');
    console.log(
        'PASS static worker postal, ambiguity, missing-code recovery, geolocation, detailed fallback, map click and reopen',
    );
    await route('#/constituencies/RCC');
    await until(
        'document.querySelector(".candidate-table") && document.querySelector(".riding-outlook")',
    );
    assert.ok(
        await evaluate(
            '!!(document.querySelector(".candidate-table").compareDocumentPosition(document.querySelector(".polling-context")) & Node.DOCUMENT_POSITION_FOLLOWING)',
        ),
    );
    assert.ok(
        !requests.some((url) => url.endsWith('/data/districts/RCC.json')),
        'Ballot avoids the retired district endpoint',
    );
    await shot('district-mobile');
    console.log(
        'PASS mobile directory, keyboard outline, lazy finder and ballot-first district',
    );

    await intercept('/api/parties', (event) =>
        fulfill(event, '<html>Bad gateway</html>', 502, 'text/html'),
    );
    await route('#/parties');
    await until('document.querySelector(".party-card")');
    await route('#/match');
    await until('document.querySelector("[role=alert]")');
    assert.ok(
        !(await evaluate(
            'document.querySelector("[role=alert]")?.textContent.includes("Unexpected")',
        )),
    );
    await unintercept();
    await evaluate('document.querySelector("[role=alert] button").click()');
    await until('document.querySelector(".party-quiz")');
    console.log('PASS readable HTML gateway failure and retry recovery');

    // Return a changed prompt for an existing ID: saved answers must not transfer.
    const questionnaire = JSON.parse(
        await readFile(
            path.join(repo, 'content', election, 'questionnaire.json'),
            'utf8',
        ),
    );
    await evaluate('document.querySelector(".quiz-topline button").click()');
    await until('document.querySelector(".answer-review")');
    await evaluate(
        'document.querySelectorAll(".answer-review button")[1].click()',
    );
    await until(
        'document.querySelector(".quiz-panel.is-active input[value=no]")',
    );
    await evaluate(
        'document.querySelector(".quiz-panel.is-active input[value=no]").click()',
    );
    questionnaire.questions[1].prompt += ' Revised';
    await intercept('/api/questionnaire', (event) =>
        fulfill(event, questionnaire),
    );
    await send('Page.reload');
    await until(
        'document.querySelector(".quiz-topline")?.textContent.includes("0 answered")',
    );
    await unintercept();
    console.log('PASS changed question wording invalidates saved answers');

    if (!externalURL) {
        // Older district response arrives after navigation: it must not replace the current riding.
        let paused;
        await intercept('/api/districts/RCC/ballot', (event) => {
            paused = event;
        });
        await route('#/constituencies/RCC');
        for (let i = 0; i < 100 && !paused; i++) await delay(20);
        assert.ok(paused);
        await route('#/constituencies/OTH');
        await until(
            'document.getElementById("page-title").textContent.includes("Other Constituency")',
        );
        await send('Fetch.continueRequest', {
            requestId: paused.requestId,
        }).catch(() => {});
        await unintercept();
        await delay(200);
        assert.ok(
            await evaluate(
                'document.getElementById("page-title").textContent.includes("Other Constituency")',
            ),
        );
        console.log('PASS navigation cancels stale ballot responses');
    }

    await route('#/match');
    await until('document.querySelector(".party-quiz")');
    for (let i = 0; i < questionnaire.questions.length; i++) {
        await evaluate(
            'document.querySelector(".quiz-panel.is-active input[value=yes]").click(); document.querySelector(".quiz-panel.is-active .primary-button").click()',
        );
        if (i < questionnaire.questions.length - 1)
            await until(
                `document.querySelector(".quiz-topline")?.textContent.includes("Question ${i + 2} of")`,
            );
    }
    await until('document.querySelector(".answer-review")');
    assert.equal(
        await evaluate(
            '[...document.querySelectorAll(".answer-review strong")].every(x=>x.textContent.includes("Yes"))',
        ),
        true,
    );
    await evaluate('document.querySelector(".party-quiz .secondary").click()');
    await until(
        'document.querySelector(".quiz-topline")?.textContent.includes("0 answered")',
    );
    await until(
        'Object.keys(JSON.parse(sessionStorage.getItem("bc-party-answers-v2")).answers).length===0',
    );
    console.log('PASS completing the questionnaire and clearing all answers');

    if (externalURL) {
        for (const endpoint of [
            '/api/districts',
            '/api/districts/RCC/ballot',
            '/api/parties',
            '/data/publication.json',
        ]) {
            const start = performance.now();
            const response = await fetch(baseURL + resourceURL(endpoint));
            const body = await response.text();
            assert.equal(response.status, 200, endpoint);
            console.log(
                JSON.stringify({
                    endpoint,
                    bytes: Buffer.byteLength(body),
                    ms: Math.round(performance.now() - start),
                    generation: response.headers.get(
                        'X-Publication-Generation',
                    ),
                }),
            );
        }
    }
    assert.deepEqual(
        staticRequests.filter((url) => url.startsWith('/api/')),
        [],
    );
    assert.deepEqual(
        requests.filter((url) => new URL(url).pathname.startsWith('/api/')),
        [],
        'Static site makes no backend requests',
    );
    assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
    assert.equal(violations.length, 0, JSON.stringify(violations));
    console.log(`Browser suite passed. Screenshots: ${temporary}`);
} catch (error) {
    console.error(logs.join(''));
    console.error('Static file requests:', staticRequests);
    throw error;
} finally {
    socket?.close();
    chrome?.kill('SIGTERM');
    staticServer?.closeAllConnections();
    staticServer?.close();
    for (const item of pending.values())
        item.reject(Error('Browser session ended'));
}
