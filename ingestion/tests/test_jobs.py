from contextlib import redirect_stdout
import fcntl
import io
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from election.jobs.registry import JOBS, job_order
from election.jobs.__main__ import main
from election.storage import atomic_json, read_json
import jobs as launcher


class PipelineJobTests(unittest.TestCase):
    def test_orchestrator_shares_one_budget_across_separate_containers(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            observed = []
            def container(command, **kwargs):
                name = command[command.index('--no-deps') + 1]
                observed.append(int(command[command.index('--max-calls') + 1]))
                calls = {'comparison': 2, 'source-review': 1, 'publish': 0}[name]
                atomic_json(root / 'runs/budget-run' / (name + '.json'), {'status': 'completed', 'result': {'model_calls': calls}})
                return SimpleNamespace(returncode=0)
            with redirect_stdout(io.StringIO()), patch('jobs.subprocess.run', side_effect=container):
                self.assertEqual(launcher.main(['run', 'comparison', 'source-review', 'publish', '--storage', folder, '--run-id', 'budget-run', '--max-calls', '5']), 0)
            self.assertEqual(observed, [5, 3, 2])
            self.assertEqual(read_json(root / 'runs/budget-run/pipeline.json')['model_calls'], 3)

    def test_job_graph_is_ordered_and_can_start_at_existing_comparisons(self):
        order = job_order('publish')
        for name in order:
            for dependency in JOBS[name].dependencies:
                self.assertLess(order.index(dependency), order.index(name))
        self.assertEqual(job_order('publish', 'comparison'), ['comparison', 'source-review', 'publish'])
        with self.assertRaisesRegex(ValueError, 'not a dependency'):
            job_order('publish', 'finder-data')

    def test_job_audits_distinguish_pending_results_from_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            atomic_json(root / 'config.json', {'election': {'id': 'e'}})
            arguments = ['source-review', '--storage', folder, '--config', str(root / 'config.json'), '--run-id', 'test-run']
            with redirect_stdout(io.StringIO()), patch('election.jobs.__main__.execute', return_value={'pending': [{'candidate_id': 'c'}], 'model_calls': 1}):
                self.assertEqual(main(arguments), 3)
            report = read_json(root / 'runs/test-run/source-review.json')
            self.assertEqual(report['status'], 'partial')
            with redirect_stdout(io.StringIO()), patch('election.jobs.__main__.execute', side_effect=ValueError('Invalid source quotation')):
                self.assertEqual(main([*arguments[:-1], 'failed-run']), 1)
            self.assertEqual(read_json(root / 'runs/failed-run/source-review.json')['status'], 'failed')

    def test_storage_lock_prevents_concurrent_registry_writers(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            atomic_json(root / 'config.json', {'election': {'id': 'e'}})
            with (root / '.job.lock').open('a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with redirect_stdout(io.StringIO()), patch('election.jobs.__main__.execute') as execute:
                    self.assertEqual(main(['profiles', '--storage', folder, '--config', str(root / 'config.json'), '--run-id', 'locked-run']), 1)
                    execute.assert_not_called()


if __name__ == '__main__':
    unittest.main()
