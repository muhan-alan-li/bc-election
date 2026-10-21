import {
    copyFile,
    mkdir,
    readFile,
    rm,
    stat,
    writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const today = () => new Date().toISOString().slice(0, 10);
const bad = (message) => {
    throw new Error(`Static publication: ${message}`);
};

function validID(value) {
    return typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value);
}
function validDate(value) {
    return (
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        value <= today() &&
        !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    );
}
function validURL(value) {
    try {
        const url = new URL(value);
        return (
            (url.protocol === 'https:' || url.protocol === 'http:') &&
            !!url.hostname &&
            !url.username &&
            !url.password
        );
    } catch {
        return false;
    }
}
function validSource(source) {
    return (
        source &&
        validURL(source.url) &&
        typeof source.label === 'string' &&
        source.label.length > 0
    );
}
function color(value) {
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}
function textColor(value) {
    return value === '#c85316' ? '#ae4410' : value;
}

async function readJSON(file, label) {
    try {
        return JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
        bad(`${label} cannot be read (${file}): ${error.message}`);
    }
}
async function exists(file) {
    try {
        await stat(file);
        return true;
    } catch {
        return false;
    }
}

export async function resolvePublication({
    publishedDir,
    contentDir,
    electionID,
}) {
    const simple = path.join(publishedDir, electionID, 'catalog.json');
    if (await exists(simple))
        return {
            dataDir: publishedDir,
            contentDir,
            generation: 'local',
            electionDir: path.join(publishedDir, electionID),
        };
    const active = await readJSON(
        path.join(publishedDir, 'active', `${electionID}.json`),
        'active publication',
    ).catch(() => null);
    let dataDir = publishedDir;
    let editionDir = contentDir;
    let generation = 'local';
    if (active) {
        generation = active.generation;
        const release = path.join(
            publishedDir,
            'releases',
            electionID,
            active.generation,
        );
        dataDir = path.join(release, 'data');
        if (await exists(path.join(release, 'content', electionID)))
            editionDir = path.join(release, 'content');
    }
    return {
        dataDir,
        contentDir: editionDir,
        generation,
        electionDir: path.join(dataDir, electionID),
    };
}

function validateRegistry(registry, electionID) {
    if (
        !registry ||
        registry.schema_version !== 1 ||
        registry.election_id !== electionID ||
        !Array.isArray(registry.parties) ||
        !registry.parties.length
    )
        bad('invalid party registry');
    const ids = new Set();
    const aliases = new Set();
    const parties = registry.parties.map((party) => {
        if (
            !validID(party.id) ||
            ids.has(party.id) ||
            !party.name ||
            !color(party.color) ||
            !Array.isArray(party.ballotNames) ||
            !party.ballotNames.length
        )
            bad('invalid party identity');
        ids.add(party.id);
        for (const name of party.ballotNames) {
            if (!name || aliases.has(name)) bad('duplicate ballot alias');
            aliases.add(name);
        }
        return { ...party, textColor: textColor(party.color) };
    });
    return { ...registry, parties };
}

function validateGuide(guide, electionID, ids) {
    if (
        !guide ||
        guide.schema_version !== 1 ||
        guide.election_id !== electionID ||
        !Array.isArray(guide.parties) ||
        !Array.isArray(guide.otherParties) ||
        !guide.reviewedOn ||
        !validURL(guide.partyRosterSource)
    )
        bad('invalid guide');
    const seen = new Set();
    const all = [...guide.parties, ...guide.otherParties];
    if (all.length !== ids.size || all.some((party) => !ids.has(party.id)))
        bad('guide parties differ from the registry');
    for (const party of all) {
        if (
            !validID(party.id) ||
            seen.has(party.id) ||
            !party.name ||
            !color(party.color) ||
            !party.leader ||
            !party.leaderNote ||
            !party.status ||
            !validURL(party.leaderSource) ||
            !validURL(party.platform) ||
            !Array.isArray(party.items)
        )
            bad(`invalid party guide: ${party.id}`);
        seen.add(party.id);
        if (party.portrait) {
            if (
                !party.portrait.startsWith('/content/assets/leaders/') ||
                party.portrait.includes('..') ||
                /[?#\\]/.test(party.portrait) ||
                !validURL(party.portraitSource)
            )
                bad('invalid portrait');
        }
        for (const item of party.items) {
            if (
                !item.topic ||
                !item.summary ||
                !Array.isArray(item.points) ||
                !item.points.length ||
                !Array.isArray(item.sources) ||
                !item.sources.length ||
                !item.sources.every(validSource)
            )
                bad('invalid policy item');
            for (const point of item.points) {
                if (
                    !point.text ||
                    !Array.isArray(point.sourceIndices) ||
                    !point.sourceIndices.length ||
                    point.sourceIndices.some(
                        (index) =>
                            !Number.isInteger(index) ||
                            index < 0 ||
                            index >= item.sources.length,
                    )
                )
                    bad('invalid policy citation');
            }
        }
    }
    return guide;
}

function validateQuestionnaire(data, electionID, ids) {
    if (
        !data ||
        data.schema_version !== 1 ||
        data.election_id !== electionID ||
        !validDate(data.reviewedOn) ||
        !data.methodology ||
        !Array.isArray(data.questions) ||
        !data.questions.length ||
        !Array.isArray(data.parties) ||
        data.parties.length !== ids.size
    )
        bad('invalid questionnaire');
    const aliases = new Set();
    for (const party of data.parties) {
        if (
            !ids.has(party.id) ||
            !Array.isArray(party.ballotNames) ||
            !party.ballotNames.length
        )
            bad('invalid ballot party');
        for (const name of party.ballotNames) {
            if (!name || aliases.has(name)) bad('duplicate ballot alias');
            aliases.add(name);
        }
    }
    const questions = new Set();
    for (const question of data.questions) {
        if (
            !validID(question.id) ||
            questions.has(question.id) ||
            !question.topic ||
            !question.prompt ||
            !question.yes ||
            !question.no ||
            !question.note ||
            !Array.isArray(question.stances) ||
            !question.stances.length
        )
            bad('invalid question');
        questions.add(question.id);
        const seen = new Set();
        for (const stance of question.stances) {
            if (
                !ids.has(stance.partyID) ||
                seen.has(stance.partyID) ||
                (stance.side !== 'yes' && stance.side !== 'no') ||
                !stance.summary ||
                !validDate(stance.checkedOn) ||
                !validSource(stance.source)
            )
                bad('invalid party stance');
            seen.add(stance.partyID);
        }
    }
    return data;
}

function validatePolling(data, electionID, ids) {
    if (
        !data ||
        data.schema_version !== 1 ||
        data.election_id !== electionID ||
        Number.isNaN(Date.parse(data.collectedAt)) ||
        !validSource(data.methodology) ||
        !Array.isArray(data.districts) ||
        !Array.isArray(data.surveys)
    )
        bad('invalid polling content');
    const partyIDs = new Set([...ids, 'other']);
    const districts = new Set();
    for (const row of data.districts) {
        if (
            !validID(row.code) ||
            districts.has(row.code) ||
            !row.name ||
            row.kind !== 'projection' ||
            !validDate(row.asOf) ||
            !validSource(row.source)
        )
            bad('invalid riding outlook');
        districts.add(row.code);
        if (row.outlook === 'toss_up') {
            if (row.leaderPartyID !== null) bad('toss-up cannot name a leader');
        } else if (
            !partyIDs.has(row.leaderPartyID) ||
            row.leaderPartyID === 'other' ||
            !['leaning', 'likely', 'safe'].includes(row.outlook)
        )
            bad('invalid projection leader');
    }
    const surveys = new Set();
    for (const poll of data.surveys) {
        if (
            !validID(poll.id) ||
            surveys.has(poll.id) ||
            !poll.pollster ||
            poll.kind !== 'poll' ||
            poll.scope !== 'province' ||
            !validDate(poll.publishedOn) ||
            !validDate(poll.fieldworkStart) ||
            !validDate(poll.fieldworkEnd) ||
            poll.fieldworkStart > poll.fieldworkEnd ||
            poll.fieldworkEnd > poll.publishedOn ||
            !(poll.sampleSize > 0) ||
            !poll.method ||
            !poll.population ||
            !poll.uncertainty ||
            !validSource(poll.source) ||
            !Array.isArray(poll.results) ||
            !poll.results.length
        )
            bad('invalid survey');
        surveys.add(poll.id);
        const reported = new Set();
        let total = 0;
        for (const result of poll.results) {
            if (
                !partyIDs.has(result.partyID) ||
                reported.has(result.partyID) ||
                !Number.isFinite(result.share) ||
                result.share < 0 ||
                result.share > 100
            )
                bad('invalid survey share');
            reported.add(result.partyID);
            total += result.share;
        }
        if (total < 98 || total > 102) bad('invalid survey total');
    }
    return data;
}

function validateCatalog(catalog, electionID) {
    if (
        !catalog ||
        catalog.schema_version !== 1 ||
        catalog.election_id !== electionID ||
        !Array.isArray(catalog.districts) ||
        !catalog.districts.length
    )
        bad('invalid district catalog');
    const seen = new Set();
    for (const district of catalog.districts) {
        if (
            !validID(district.id) ||
            !validID(district.official_code) ||
            !district.name ||
            !Number.isInteger(district.candidate_count) ||
            district.candidate_count < 0 ||
            seen.has(district.official_code)
        )
            bad('invalid district');
        seen.add(district.official_code);
    }
    return catalog;
}

function validateBallot(ballot, electionID, district) {
    if (
        !ballot ||
        ballot.schema_version !== 1 ||
        ballot.election_id !== electionID ||
        ballot.district?.id !== district.id ||
        ballot.district?.official_code !== district.official_code ||
        !Array.isArray(ballot.parties) ||
        !Array.isArray(ballot.candidacies) ||
        ballot.candidacies.length !== district.candidate_count
    )
        bad(`invalid ballot for ${district.official_code}`);
    const parties = new Set();
    for (const party of ballot.parties) {
        if (!validID(party.id) || !party.name || parties.has(party.id))
            bad('invalid ballot party');
        parties.add(party.id);
    }
    const candidates = new Set();
    for (const candidacy of ballot.candidacies) {
        if (
            !validID(candidacy.id) ||
            candidates.has(candidacy.id) ||
            !candidacy.ballot_name ||
            candidacy.election_id !== electionID ||
            candidacy.district_id !== district.id ||
            !['party', 'independent', 'unaffiliated'].includes(
                candidacy.affiliation,
            ) ||
            !candidacy.source?.url ||
            !candidacy.source?.sha256 ||
            !candidacy.source?.retrieved_at
        )
            bad('invalid ballot candidacy');
        if (candidacy.affiliation === 'party') {
            if (!parties.has(candidacy.party_id))
                bad('invalid ballot party reference');
        } else if (candidacy.party_id !== null) {
            bad('unexpected party reference');
        }
        candidates.add(candidacy.id);
    }
    return ballot;
}

export async function exportSiteData({
    publishedDir,
    contentDir,
    electionID,
    output,
}) {
    const source = await resolvePublication({
        publishedDir,
        contentDir,
        electionID,
    });
    const contentFolder = path.join(source.contentDir, electionID);
    const registry = validateRegistry(
        await readJSON(path.join(contentFolder, 'parties.json'), 'parties'),
        electionID,
    );
    const ids = new Set(registry.parties.map((party) => party.id));
    const guide = validateGuide(
        await readJSON(path.join(contentFolder, 'guide.json'), 'guide'),
        electionID,
        ids,
    );
    const questionnaire = validateQuestionnaire(
        await readJSON(
            path.join(contentFolder, 'questionnaire.json'),
            'questionnaire',
        ),
        electionID,
        ids,
    );
    const polling = validatePolling(
        await readJSON(path.join(contentFolder, 'polling.json'), 'polling'),
        electionID,
        ids,
    );
    const catalog = validateCatalog(
        await readJSON(
            path.join(source.electionDir, 'catalog.json'),
            'catalog',
        ),
        electionID,
    );

    const data = path.join(output, 'data');
    await rm(data, { recursive: true, force: true });
    await mkdir(data, { recursive: true });
    const write = (file, value) =>
        writeFile(file, `${JSON.stringify(value)}\n`);
    await Promise.all([
        write(path.join(data, 'parties.json'), registry),
        write(path.join(data, 'guide.json'), guide),
        write(path.join(data, 'questionnaire.json'), questionnaire),
        write(path.join(data, 'polling.json'), polling),
        write(path.join(data, 'districts.json'), {
            election_id: electionID,
            districts: catalog.districts,
        }),
        write(path.join(data, 'publication.json'), {
            election_id: electionID,
            generation: source.generation,
        }),
    ]);
    for (const district of catalog.districts) {
        const ballot = validateBallot(
            await readJSON(
                path.join(
                    source.electionDir,
                    'ballots',
                    `${district.official_code}.json`,
                ),
                `ballot ${district.official_code}`,
            ),
            electionID,
            district,
        );
        const folder = path.join(data, 'districts', district.official_code);
        await mkdir(folder, { recursive: true });
        await write(path.join(folder, 'ballot.json'), ballot);
    }
    for (const party of [...guide.parties, ...guide.otherParties]) {
        if (!party.portrait) continue;
        const relative = party.portrait.slice('/content/'.length);
        const target = path.join(output, 'content', relative);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(path.join(source.contentDir, relative), target);
    }
    return {
        electionID,
        generation: source.generation,
        districts: catalog.districts.length,
    };
}
