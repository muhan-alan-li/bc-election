import { dateLabel } from '../../helpers/labels.js';
import { SourceLink } from '../SourceLink.jsx';

export function Interests({ interests, documents, coverage }) {
    return (
        <section class="records-section">
            <h4>Disclosed holdings and interests</h4>
            <p class="note">
                {interests.length
                    ? 'Dated public disclosures, including household interests where identified. These entries do not establish current ownership or misconduct.'
                    : 'No reviewed holdings or interests are available yet. Missing research is not a finding of no interests.'}
            </p>
            {interests.length > 0 && (
                <ul class="interests">
                    {interests.map((interest) => {
                        const document = documents.find(
                            (row) => row.id === interest.document_id,
                        );

                        return (
                            <li key={interest.id}>
                                <p>{interest.description}</p>
                                <small>
                                    {interest.category} ·{' '}
                                    {interest.holder.replaceAll('_', ' ')} · As
                                    of {dateLabel(interest.as_of)} · Reviewed{' '}
                                    {dateLabel(interest.reviewed_at)}{' '}
                                    <SourceLink
                                        href={
                                            document?.source?.url ||
                                            document?.url
                                        }
                                    >
                                        Disclosure, page {interest.page}
                                    </SourceLink>
                                </small>
                            </li>
                        );
                    })}
                </ul>
            )}
            {documents.length > 0 && (
                <details class="documents">
                    <summary>Source documents ({documents.length})</summary>
                    <ul>
                        {documents.map((document) => (
                            <li key={document.id}>
                                <SourceLink
                                    href={document.source?.url || document.url}
                                >
                                    {document.document_type ===
                                    'material_change'
                                        ? 'Material change'
                                        : document.document_type === 'gift'
                                          ? 'Gift declaration'
                                          : 'Public disclosure'}{' '}
                                    —{' '}
                                    {decodeURIComponent(
                                        document.url.split('/').at(-1),
                                    ).replace(/\.pdf$/i, '')}
                                </SourceLink>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            {coverage?.interests?.errors?.length > 0 && (
                <p class="note">
                    Some disclosure sources could not be collected. Coverage is
                    incomplete.
                </p>
            )}
        </section>
    );
}
