export const dateLabel = (value) =>
    value
        ? new Date(
              value.length === 10 ? `${value}T12:00:00` : value,
          ).toLocaleDateString('en-CA', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
          })
        : 'Not yet verified';

export const statusLabel = (value) =>
    ({
        not_reviewed: 'Not yet reviewed',
        partial: 'Partial coverage',
        partial_review: 'Partially reviewed',
        documents_found: 'Documents found',
    })[value] || 'Research in progress';
