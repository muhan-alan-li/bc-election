import { districtHref } from '../../helpers/routes.js';

export function FinderResult({ result, onClose }) {
    return (
        <>
            {result && (
                <section
                    class="finder-result"
                    aria-labelledby="finder-result-title"
                >
                    <h3 id="finder-result-title">
                        {result.status === 'ambiguous'
                            ? 'Possible constituencies'
                            : result.status === 'no_match'
                              ? 'No constituency match'
                              : 'Approximate constituency'}
                    </h3>
                    <p>
                        {result.method === 'postal_code'
                            ? 'Based on recorded postal-code locations. The pin shows one recorded point; these locations may not cover the entire postal-code area.'
                            : 'Based on your selected location. Your current location may differ from your home.'}
                    </p>
                    {result.districts.map((district) => (
                        <div
                            key={district.official_code}
                            class="finder-district"
                        >
                            <strong>{district.name}</strong>
                            {district.published ? (
                                <a
                                    href={districtHref(district.official_code)}
                                    onClick={onClose}
                                >
                                    View candidates →
                                </a>
                            ) : (
                                <span>
                                    Candidate research is not yet published.
                                </span>
                            )}
                        </div>
                    ))}
                    {!result.districts.length && (
                        <p>
                            Try a point on land in British Columbia, or verify
                            with Elections BC.
                        </p>
                    )}
                </section>
            )}
        </>
    );
}
