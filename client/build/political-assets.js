import { readFile, readdir, mkdir, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const pillars = JSON.parse(
    await readFile(
        new URL(
            '../../ingestion/election/analysis/pillars.json',
            import.meta.url,
        ),
        'utf8',
    ),
);
const pillarIDs = new Set(pillars.map((pillar) => pillar.id));

export async function preparePoliticalAssets(sourceRoot, distRoot, electionID) {
    if (!/^[a-zA-Z0-9_-]+$/.test(electionID))
        throw new Error('Invalid election ID');
    const catalog = { electionID, candidates: {}, parties: {} };
    const pending = [];
    for (const kind of ['candidates', 'parties']) {
        let files;
        try {
            files = await readdir(join(sourceRoot, electionID, kind));
        } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }
        for (const file of files
            .sort()
            .filter((name) => name.endsWith('.json'))) {
            const body = await readFile(
                join(sourceRoot, electionID, kind, file),
            );
            const record = JSON.parse(body);
            const expectedKind =
                kind === 'candidates'
                    ? 'candidate_political_profile'
                    : 'party_political_platform';
            if (
                record.kind !== expectedKind ||
                record.schema_version !== 1 ||
                record.election_id !== electionID ||
                !/^[a-zA-Z0-9_-]+$/.test(record.id) ||
                file !== `${record.id}.json`
            ) {
                throw new Error(`Invalid polished political profile: ${file}`);
            }
            if (
                (record.actions || []).some(
                    (action) => action.attribution_status !== 'reviewed',
                )
            ) {
                throw new Error(`Unreviewed candidate attribution in ${file}`);
            }
            if (
                (record.documents || []).some(
                    (document) => 'pages' in document || 'blob' in document,
                )
            ) {
                throw new Error(
                    `Raw research cannot be packaged for the client: ${file}`,
                );
            }
            if (record.issue_analysis) {
                const analysis = record.issue_analysis;
                const ids = new Set((record.actions || []).map((a) => a.id));
                if (
                    analysis.id !== record.id ||
                    analysis.person_id !== record.person_id ||
                    analysis.election_id !== record.election_id ||
                    analysis.coverage?.scope !== 'reviewed_attributions' ||
                    analysis.review_status !==
                        'machine_generated_needs_review' ||
                    !Array.isArray(analysis.issue_findings) ||
                    analysis.issue_findings.some(
                        (finding) =>
                            !Array.isArray(finding.evidence) ||
                            finding.evidence.some(
                                (entry) =>
                                    entry.attribution_status !== 'reviewed' ||
                                    !ids.has(entry.action_id),
                            ),
                    )
                ) {
                    throw new Error(`Invalid public issue analysis in ${file}`);
                }
            }
            if (record.alignment_analysis) {
                const analysis = record.alignment_analysis;
                const actions = new Map(
                    (record.actions || []).map((action) => [action.id, action]),
                );
                if (
                    analysis.schema_version !== 1 ||
                    analysis.kind !== 'candidate_alignment_analysis' ||
                    analysis.id !== record.id ||
                    analysis.person_id !== record.person_id ||
                    analysis.election_id !== record.election_id ||
                    analysis.review_status !== 'source_checked' ||
                    !Array.isArray(analysis.findings) ||
                    !analysis.findings.length ||
                    !Array.isArray(analysis.pillars) ||
                    JSON.stringify(
                        analysis.pillars.map((pillar) => pillar.id),
                    ) !== JSON.stringify(pillars.map((pillar) => pillar.id)) ||
                    analysis.pillars.some((pillar) => {
                        const assessed = analysis.findings.some(
                            (finding) => finding.pillar_id === pillar.id,
                        );
                        return assessed
                            ? typeof pillar.takeaway !== 'string' ||
                                  !pillar.takeaway.trim()
                            : pillar.takeaway != null;
                    }) ||
                    (analysis.unassessed_commitments || []).some(
                        (item) => !pillarIDs.has(item.pillar_id),
                    ) ||
                    analysis.findings.some(
                        (finding) =>
                            !pillarIDs.has(finding.pillar_id) ||
                            !Array.isArray(finding.actions) ||
                            !finding.actions.length ||
                            finding.actions.some((action) => {
                                const current = actions.get(action.id);
                                return (
                                    !current ||
                                    current.attribution_status !== 'reviewed' ||
                                    [
                                        'date',
                                        'subject',
                                        'stage',
                                        'position',
                                    ].some(
                                        (key) => action[key] !== current[key],
                                    )
                                );
                            }) ||
                            !Array.isArray(finding.citations) ||
                            !finding.citations.length ||
                            finding.citations.some(
                                (citation) =>
                                    !citation.quote ||
                                    !citation.source?.sha256 ||
                                    !citation.source?.url?.startsWith(
                                        'https://',
                                    ),
                            ),
                    )
                ) {
                    throw new Error(
                        `Invalid public platform alignment in ${file}`,
                    );
                }
            }
            const hash = createHash('sha256')
                .update(body)
                .digest('hex')
                .slice(0, 16);
            const asset = `${record.id}-${hash}.json`;
            catalog[kind][record.id] =
                `/data/political/${electionID}/${kind}/${asset}`;
            pending.push({ kind, asset, body });
        }
    }
    for (const { kind, asset, body } of pending) {
        const folder = join(distRoot, 'data/political', electionID, kind);
        await mkdir(folder, { recursive: true });
        await writeFile(join(folder, asset), body);
    }
    // Retire this build's obsolete snapshots, including revoked attributions.
    for (const kind of ['candidates', 'parties']) {
        const folder = join(distRoot, 'data/political', electionID, kind);
        const current = new Set(
            pending
                .filter((item) => item.kind === kind)
                .map((item) => item.asset),
        );
        let previous;
        try {
            previous = await readdir(folder);
        } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }
        for (const file of previous) {
            if (
                /^[a-zA-Z0-9_-]+-[a-f0-9]{16}\.json$/.test(file) &&
                !current.has(file)
            ) {
                await unlink(join(folder, file));
            }
        }
    }
    return catalog;
}
