export function partyName(candidate, dataset) {
    return (
        dataset.parties.find((party) => party.id === candidate.party_id)
            ?.name ||
        (candidate.affiliation === 'independent'
            ? 'Independent'
            : 'Unaffiliated')
    );
}
