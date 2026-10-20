import { PolicyDialog } from './PolicyDialog.jsx';
import { PolicyDetails } from './PolicyDetails.jsx';
import { PolicySources } from './PolicySources.jsx';

export function ExpandedPolicy({ party, item, onClose }) {
    return (
        <PolicyDialog
            title={item.topic}
            eyebrow={`${party.name} · Platform`}
            color={party.color}
            textColor={party.textColor}
            onClose={onClose}
        >
            <p class="policy-summary">{item.summary}</p>
            <h3>Plan of action</h3>
            <PolicyDetails item={item} />
            {item.note && <p class="note">{item.note}</p>}
            <PolicySources sources={item.sources} />
        </PolicyDialog>
    );
}
