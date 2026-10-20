"""One job graph shared by individual containers and the host orchestrator."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Job:
    dependencies: tuple[str, ...] = ()
    model: bool = False
    description: str = ''


JOBS = {
    'normalize': Job(description='Collect and normalize constituency records; initialize identities'),
    'records': Job(('normalize',), description='Collect candidate voting indexes and disclosures'),
    'discover': Job(('normalize',), description='Discover campaign and party source links'),
    'platforms': Job(('discover',), description='Collect campaign and party documents'),
    'transcripts': Job(('records',), description='Collect and normalize referenced Assembly transcripts'),
    'profiles': Job(('platforms', 'transcripts'), description='Build private candidate and party research profiles'),
    'refresh-publication': Job(('profiles',), description='Regenerate backend profiles and hide stale comparison projections'),
    'plan': Job(('profiles',), description='Initialize candidate research checklists and report coverage'),
    'identity-review': Job(('profiles',), True, 'Review candidate identity and historical attribution'),
    'curate': Job(('identity-review',), description='Apply identities and rebuild attributed research profiles'),
    'research': Job(('curate',), True, 'Select source-grounded candidate comparison cases'),
    'evidence': Job(('research',), description='Collect the exact evidence windows for selected comparisons'),
    'comparison': Job(('evidence',), True, 'Draft bounded private promise-to-action comparisons'),
    'source-review': Job(('comparison',), True, 'Independently check, revise, or reject drafts against sources'),
    'publish': Job(('source-review',), description='Validate reviewed results and publish backend datasets'),
    'finder-data': Job(description='Collect and build the local constituency finder dataset'),
    'test': Job(description='Run ingestion unit tests'),
}


def job_order(through, start=None):
    if through not in JOBS or (start is not None and start not in JOBS):
        raise ValueError('Unknown pipeline job')
    ordered, visiting = [], set()
    def visit(name):
        if name in visiting:
            raise ValueError('Pipeline job graph contains a cycle')
        if name in ordered:
            return
        visiting.add(name)
        for parent in JOBS[name].dependencies:
            visit(parent)
        visiting.remove(name)
        ordered.append(name)
    visit(through)
    if start:
        if start not in ordered:
            raise ValueError('Starting job is not a dependency of the selected final job')
        ordered = ordered[ordered.index(start):]
    return ordered
