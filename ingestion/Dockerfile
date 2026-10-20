FROM python:3.12-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates poppler-utils \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 ingest \
    && useradd --uid 1000 --gid ingest --create-home ingest

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY --chown=ingest:ingest election ./election
COPY --chown=ingest:ingest tests ./tests
COPY --chown=ingest:ingest config.json jobs.py publish_release.py .
COPY --chown=ingest:ingest run_candidate_records.py run_platform_collection.py discover_platform_sources.py .
USER ingest
ENTRYPOINT ["python", "-m", "election.jobs"]
CMD ["--help"]
