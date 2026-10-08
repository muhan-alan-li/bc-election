import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './styles.css';
import { Finder } from './finder.jsx';

async function getJSON(path, signal) {
  const response = await fetch(path, { signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Unable to load election data.');
  return body;
}

const dateLabel = value => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not yet verified';
const statusLabel = value => ({ not_reviewed: 'Not yet reviewed', partial: 'Partial coverage', partial_review: 'Partially reviewed', documents_found: 'Documents found' }[value] || 'Research in progress');

function SourceLink({ href, children }) {
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{children} <span aria-label="opens in a new tab">↗</span></a> : null;
}

function Candidate({ candidate, dataset, party }) {
  const [voteLimit, setVoteLimit] = useState(10);
  const person = dataset.people.find(row => row.id === candidate.person_id);
  const coverage = dataset.coverage.find(row => row.person_id === candidate.person_id);
  const votes = dataset.votes.filter(row => row.person_id === candidate.person_id).sort((a, b) => b.date.localeCompare(a.date));
  const interests = dataset.interests.filter(row => row.person_id === candidate.person_id);
  const documents = dataset.disclosures.filter(row => row.person_id === candidate.person_id);
  return <article class="candidate">
    <div class="candidate-heading">
      <div><h3>{candidate.ballot_name}</h3><p class="affiliation">{party}</p></div>
      <SourceLink href={candidate.source?.url}>Official roster</SourceLink>
    </div>
    <div class="coverage-summary">
      <span>Voting history: {statusLabel(coverage?.voting?.status)}</span>
      <span>Interests: {statusLabel(coverage?.interests?.status)}</span>
    </div>
    <div class="candidate-records">
      {person?.office_history?.length > 0 && <div class="office-history">
        <h4>Previous offices</h4>
        {person.office_history.map((office, index) => <p key={index}>{office.office} · {office.district_name} · {office.term_years}{' '}<SourceLink href={office.source_url}>Source</SourceLink></p>)}
      </div>}
      <section class="records-section">
        <h4>Voting history {votes.length > 0 && <span class="count">{votes.length} indexed votes</span>}</h4>
        <p class="note">{votes.length ? 'These member-index entries show named positions. Exact questions and outcomes await transcript review. Different stages of a bill are separate entries.' : 'Voting history has not yet been established for this candidate. This does not mean they have no voting record.'}</p>
        {votes.length > 0 && <>
          <div class="table-scroll" role="region" aria-label={`Voting history for ${candidate.ballot_name}`} tabIndex="0">
            <table><thead><tr><th scope="col">Date</th><th scope="col">Subject and stage</th><th scope="col">Position</th><th scope="col">Source</th></tr></thead>
              <tbody>{votes.slice(0, voteLimit).map(vote => <tr key={vote.id}>
                <td class="date">{dateLabel(vote.date)}</td>
                <td>{vote.subject}<small>{vote.stage} · {vote.member_label}</small></td>
                <td>{vote.position === 'yea' ? 'Yea' : 'Nay'}</td>
                <td><SourceLink href={vote.transcript_url}>Transcript</SourceLink><br /><SourceLink href={vote.source?.url}>Index</SourceLink></td>
              </tr>)}</tbody>
            </table>
          </div>
          {voteLimit < votes.length && <button class="secondary" onClick={() => setVoteLimit(limit => limit + 20)}>Show more votes ({votes.length - voteLimit} remaining)</button>}
        </>}
        {coverage?.voting?.errors?.length > 0 && <p class="note">Some voting sources could not be collected. Coverage is incomplete.</p>}
      </section>
      <section class="records-section">
        <h4>Disclosed holdings and interests</h4>
        <p class="note">{interests.length ? 'Dated public disclosures, including household interests where identified. These entries do not establish current ownership or misconduct.' : 'No reviewed holdings or interests are available yet. Missing research is not a finding of no interests.'}</p>
        {interests.length > 0 && <ul class="interests">{interests.map(interest => {
          const document = documents.find(row => row.id === interest.document_id);
          return <li key={interest.id}><p>{interest.description}</p><small>{interest.category} · {interest.holder.replaceAll('_', ' ')} · As of {dateLabel(interest.as_of)} · Reviewed {dateLabel(interest.reviewed_at)}{' '}<SourceLink href={document?.source?.url || document?.url}>Disclosure, page {interest.page}</SourceLink></small></li>;
        })}</ul>}
        {documents.length > 0 && <details class="documents"><summary>Source documents ({documents.length})</summary><ul>{documents.map(document => <li key={document.id}><SourceLink href={document.source?.url || document.url}>{document.document_type === 'material_change' ? 'Material change' : document.document_type === 'gift' ? 'Gift declaration' : 'Public disclosure'} — {decodeURIComponent(document.url.split('/').at(-1)).replace(/\.pdf$/i, '')}</SourceLink></li>)}</ul></details>}
        {coverage?.interests?.errors?.length > 0 && <p class="note">Some disclosure sources could not be collected. Coverage is incomplete.</p>}
      </section>
    </div>
  </article>;
}

const districtHref = code => `#/constituencies/${encodeURIComponent(code)}`;
const candidateHref = (code, id) => `${districtHref(code)}/candidates/${encodeURIComponent(id)}`;

function parseRoute() {
  try {
    const parts = window.location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    if (!parts[0] || (parts[0] === 'constituencies' && parts.length === 1)) return { view: 'constituencies' };
    if (parts[0] === 'constituencies' && parts[1] && parts.length === 2) return { view: 'district', code: parts[1] };
    if (parts[0] === 'constituencies' && parts[1] && parts[2] === 'candidates' && parts[3] && parts.length === 4) return { view: 'candidate', code: parts[1], candidateID: parts[3] };
  } catch {}
  return { view: 'missing' };
}

function Breadcrumbs({ route, dataset, candidate }) {
  return <nav class="breadcrumbs" aria-label="Breadcrumb"><ol>
    <li>{route.view === 'constituencies' ? <span aria-current="page">Constituencies</span> : <a href="#/constituencies">Constituencies</a>}</li>
    {route.code && <li>{route.view === 'candidate' ? <a href={districtHref(route.code)}>{dataset?.district.name || route.code}</a> : <span aria-current="page">{dataset?.district.name || route.code}</span>}</li>}
    {route.view === 'candidate' && <li><span aria-current="page">{candidate?.ballot_name || 'Candidate'}</span></li>}
  </ol></nav>;
}

function Constituencies({ districts, onFind }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const matches = districts.filter(row => `${row.name} ${row.official_code}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => a.name.localeCompare(b.name, 'en-CA'));
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(page, pages);
  const rows = matches.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return <>
    <div class="intro"><h1>Constituencies</h1><p>Find your constituency and explore the candidates running to represent you as an MLA.</p></div>
    <div class="constituency-tools"><div><label for="district-search">Search by constituency name or code</label><input id="district-search" type="search" placeholder="For example, Richmond Centre" value={query} onInput={event => { setQuery(event.currentTarget.value); setPage(1); }} /></div><button class="secondary" onClick={onFind}>Find my constituency</button></div>
    <p class="note">Only constituencies with published research appear here. Richmond Centre is the current pilot. Use the constituency finder if you’re unsure of your constituency.</p>
    <p class="result-count" role="status">{matches.length} constituencies · Alphabetical order</p>
    {rows.length ? <div class="table-scroll" role="region" aria-label="Constituencies" tabIndex="0"><table class="constituency-table"><thead><tr><th scope="col">Constituency</th><th scope="col">Code</th><th scope="col">Candidates</th><th scope="col">Roster</th></tr></thead><tbody>{rows.map(row => <tr key={row.official_code}><th scope="row"><a href={districtHref(row.official_code)}>{row.name}</a></th><td>{row.official_code}</td><td>{row.candidate_count}</td><td>{row.roster_status === 'final_roster' ? 'Final candidate list' : 'Provisional candidate list'}</td></tr>)}</tbody></table></div> : <p class="empty">{districts.length ? 'No published constituencies match your search.' : 'No constituency research has been published yet.'}</p>}
    <nav class="pagination" aria-label="Constituency pages"><button class="secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pages}</span><button class="secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>
  </>;
}

function District({ dataset }) {
  const [query, setQuery] = useState('');
  const [partyFilter, setPartyFilter] = useState('');
  const partyName = candidate => dataset.parties.find(party => party.id === candidate.party_id)?.name || (candidate.affiliation === 'independent' ? 'Independent' : 'Unaffiliated');
  const candidates = dataset.candidacies.filter(candidate => `${candidate.ballot_name} ${partyName(candidate)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (!partyFilter || partyName(candidate) === partyFilter)).sort((a, b) => a.ballot_name.localeCompare(b.ballot_name, 'en-CA'));
  const parties = [...new Set(dataset.candidacies.map(partyName))].sort();
  return <>
    <div class="intro"><p class="eyebrow">{dataset.election.title}</p><h1>{dataset.district.name}</h1><p>Candidates for MLA · Listed alphabetically.</p></div>
    <p class="note">Roster: {dataset.district.roster_status === 'final_roster' ? 'Final candidate list' : 'Provisional candidate list'} · Research assembled {dateLabel(dataset.generated_at)}. Records may cover earlier dates. <SourceLink href={dataset.election.source_url}>Elections BC</SourceLink></p>
    <div class="filters"><div><label for="candidate-search">Search candidates or parties</label><input id="candidate-search" type="search" placeholder="Name or party" value={query} onInput={event => setQuery(event.currentTarget.value)} /></div><div><label for="party-filter">Party or affiliation</label><select id="party-filter" value={partyFilter} onChange={event => setPartyFilter(event.currentTarget.value)}><option value="">All affiliations</option>{parties.map(party => <option key={party}>{party}</option>)}</select></div></div>
    <p class="result-count" role="status">{candidates.length} of {dataset.candidacies.length} candidates · Alphabetical order</p>
    {candidates.length ? <div class="table-scroll" role="region" aria-label="Candidates" tabIndex="0"><table class="candidate-table"><thead><tr><th scope="col">Candidate</th><th scope="col">Party or affiliation</th><th scope="col">Voting history</th><th scope="col">Interests</th></tr></thead><tbody>{candidates.map(candidate => {
      const coverage = dataset.coverage.find(row => row.person_id === candidate.person_id);
      return <tr key={candidate.id}><th scope="row"><a href={candidateHref(dataset.district.official_code, candidate.id)}>{candidate.ballot_name}</a></th><td>{partyName(candidate)}</td><td>{statusLabel(coverage?.voting?.status)}</td><td>{statusLabel(coverage?.interests?.status)}</td></tr>;
    })}</tbody></table></div> : <p class="empty">{dataset.candidacies.length ? 'No candidates match these filters.' : 'No candidates are listed in this published roster yet.'}</p>}
  </>;
}

function App() {
  const [route, setRoute] = useState(parseRoute);
  const [finderOpen, setFinderOpen] = useState(false);
  const [districts, setDistricts] = useState([]);
  const [loaded, setLoaded] = useState(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const navigate = () => setRoute(parseRoute());
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true); setCatalogError('');
    getJSON('/api/districts', controller.signal).then(body => setDistricts(body.districts))
      .catch(error => { if (!controller.signal.aborted) setCatalogError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => {
    setError(''); setLoaded(null);
    if (!route.code) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    getJSON(`/api/districts/${encodeURIComponent(route.code)}`, controller.signal)
      .then(data => { if (!controller.signal.aborted) setLoaded({ code: route.code, data }); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [route.code, retry]);
  const dataset = loaded && loaded.code === route.code ? loaded.data : null;
  const candidate = dataset?.candidacies.find(row => row.id === route.candidateID);
  const party = candidate && (dataset.parties.find(row => row.id === candidate.party_id)?.name || (candidate.affiliation === 'independent' ? 'Independent' : 'Unaffiliated'));
  return <>
    <header class="site-header"><div class="shell"><a class="brand" href="#/constituencies">BC election guide</a><nav class="top-nav" aria-label="Main navigation"><a href="#/constituencies" aria-current={route.view !== 'missing' ? 'page' : undefined}>Constituencies</a></nav></div></header>
    <main class="shell"><Breadcrumbs route={route} dataset={dataset} candidate={candidate} />
      {route.view === 'constituencies' && <>{catalogLoading ? <p role="status">Loading constituencies…</p> : catalogError ? <p role="alert">{catalogError} <button class="secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></p> : <Constituencies districts={districts} onFind={() => setFinderOpen(true)} />}</>}
      {route.code && <>{loading || (!dataset && !error) ? <p role="status">Loading candidates…</p> : error ? <p role="alert">{error} <button class="secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></p> : route.view === 'district' ? <District key={route.code} dataset={dataset} /> : candidate ? <><div class="intro"><p class="eyebrow">{dataset.district.name} · Candidate for MLA</p><h1>{candidate.ballot_name}</h1><p>{party}</p></div><Candidate key={candidate.id} candidate={candidate} dataset={dataset} party={party} /></> : <p role="alert">Candidate not found in this constituency. <a href={districtHref(route.code)}>View its candidates</a>.</p>}</>}
      {route.view === 'missing' && <p role="alert">Page not found. <a href="#/constituencies">Browse constituencies</a>.</p>}
    </main>
    {finderOpen && <Finder onClose={() => setFinderOpen(false)} />}
    <footer><div class="shell">An informational guide. No endorsements or candidate rankings. Source links open in a new tab.</div></footer>
  </>;
}

render(<App />, document.getElementById('app'));
