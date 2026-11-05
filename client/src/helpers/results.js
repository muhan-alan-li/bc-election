const numberFormat = new Intl.NumberFormat('en-CA');

export function formatNumber(value) {
    return numberFormat.format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value, digits = 1) {
    return `${(Number(value) || 0).toFixed(digits)}%`;
}

export function formatDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-CA', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(date);
}

export function partyLookup(parties = []) {
    return new Map(parties.map((party) => [party.id, party]));
}

export function shortPartyName(party) {
    return party?.short_name || party?.name || 'Unknown party';
}

export function seatHolders(parties = []) {
    return parties
        .filter((party) => party.seats > 0)
        .sort((a, b) => b.seats - a.seats || b.votes - a.votes);
}

export function governmentParty(results) {
    return seatHolders(results?.parties)[0] || null;
}

export function resultHeadline(results) {
    const government = governmentParty(results);
    if (!government) return 'Results';
    const majority = government.seats > results.election.seats / 2;
    return `${government.name} ${majority ? 'wins a majority' : 'wins the most seats'}`;
}

export function resultStandfirst(results) {
    const held = seatHolders(results?.parties);
    const [government, opposition, third] = held;
    if (!government) return '';
    const parts = [
        `${government.name} won ${government.seats} of ${results.election.seats} seats with ${formatPercent(government.vote_share)} of the valid vote.`,
    ];
    if (opposition) parts.push(`${opposition.name} took ${opposition.seats}.`);
    if (third) parts.push(`${third.name} holds ${third.seats}.`);
    return parts.join(' ');
}

export function aggregateCandidates(candidates = []) {
    const groups = new Map();
    for (const candidate of candidates) {
        const row = groups.get(candidate.party_id) || {
            party_id: candidate.party_id,
            votes: 0,
        };
        row.votes += candidate.votes;
        groups.set(candidate.party_id, row);
    }
    const valid = candidates.reduce((sum, row) => sum + row.votes, 0);
    return [...groups.values()]
        .map((row) => ({
            ...row,
            vote_share: valid ? (row.votes / valid) * 100 : 0,
        }))
        .sort((a, b) => b.votes - a.votes);
}

export function historyRows(district, partyById = new Map()) {
    if (!district) return [];
    const current = {
        year: 2026,
        current: true,
        boundary: '2023 redistribution boundaries',
        winner: district.winner,
        parties: aggregateCandidates(district.candidates),
    };
    const past = [...(district.history || [])].sort((a, b) => b.year - a.year);
    return [current, ...past].map((row) => ({
        ...row,
        winnerParty: partyById.get(row.winner.party_id) || null,
    }));
}

export function shareParts(entry, partyById = new Map(), limit = 4) {
    const rows = [...(entry.parties || [])]
        .map((row) => ({
            ...row,
            name: partyById.get(row.party_id)?.name || row.party_id,
            color: partyById.get(row.party_id)?.color || '#8a8f98',
        }))
        .sort((a, b) => b.vote_share - a.vote_share);
    const top = rows.slice(0, limit);
    const rest = rows.slice(limit);
    if (rest.length)
        top.push({
            party_id: 'other',
            name: 'Other',
            color: '#8a8f98',
            vote_share: rest.reduce((sum, row) => sum + row.vote_share, 0),
        });
    return top;
}

export function shareLabel(parts, year) {
    return `${year}: ${parts
        .map((part) => `${part.name} ${formatPercent(part.vote_share)}`)
        .join(', ')}`;
}
