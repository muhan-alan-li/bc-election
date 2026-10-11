import { dateLabel } from '../../helpers/labels.js';
import { SourceLink } from '../SourceLink.jsx';

export function Interests({ interests, documents, coverage }) {
    const linkedDocuments = new Set(
        interests.map((interest) => interest.document_id),
    );
    const remainingDocuments = documents.filter(
        (document) => !linkedDocuments.has(document.id),
    );
    return (
        <div class="disclosure-content">
            <p class="note">
                {interests.length
                    ? 'Dated public disclosures, including household interests where identified. These entries do not establish current ownership or misconduct.'
                    : 'No reviewed holdings or interests are available yet. Missing research is not a finding of no interests.'}
            </p>
            {(interests.length > 0 || documents.length > 0) && (
                <div
                    class="table-scroll compact-table disclosure-table"
                    role="region"
                    aria-label="Disclosures and interests"
                    tabIndex={0}
                >
                    <table>
                        <thead>
                            <tr>
                                <th scope="col">Entry</th>
                                <th scope="col">Category</th>
                                <th scope="col">Holder</th>
                                <th scope="col">As of</th>
                                <th scope="col">Reviewed</th>
                                <th scope="col">Source</th>
                            </tr>
                        </thead>
                        <tbody>
                            {interests.map((interest) => {
                                const document = documents.find(
                                    (row) => row.id === interest.document_id,
                                );
                                return (
                                    <tr key={interest.id}>
                                        <td>{interest.description}</td>
                                        <td>{interest.category}</td>
                                        <td>
                                            {interest.holder.replaceAll(
                                                '_',
                                                ' ',
                                            )}
                                        </td>
                                        <td class="date">
                                            {dateLabel(interest.as_of)}
                                        </td>
                                        <td class="date">
                                            {dateLabel(interest.reviewed_at)}
                                        </td>
                                        <td>
                                            <SourceLink
                                                href={
                                                    document?.source?.url ||
                                                    document?.url
                                                }
                                            >
                                                {interest.page
                                                    ? `Disclosure, page ${interest.page}`
                                                    : 'Disclosure'}
                                            </SourceLink>
                                        </td>
                                    </tr>
                                );
                            })}
                            {remainingDocuments.map((document) => (
                                <tr key={document.id}>
                                    <td>
                                        Disclosure document; no reviewed entries
                                        published
                                    </td>
                                    <td>
                                        {{
                                            material_change: 'Material change',
                                            gift: 'Gift declaration',
                                        }[document.document_type] ||
                                            'Public disclosure'}
                                    </td>
                                    <td>—</td>
                                    <td>—</td>
                                    <td>—</td>
                                    <td>
                                        <SourceLink
                                            href={
                                                document.source?.url ||
                                                document.url
                                            }
                                        >
                                            {decodeURIComponent(
                                                (
                                                    document.url ||
                                                    document.source?.url ||
                                                    ''
                                                )
                                                    .split('/')
                                                    .at(-1),
                                            ).replace(/\.pdf$/i, '') ||
                                                'Disclosure'}
                                        </SourceLink>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {coverage?.interests?.errors?.length > 0 && (
                <p class="note">
                    Some disclosure sources could not be collected. Coverage is
                    incomplete.
                </p>
            )}
        </div>
    );
}
