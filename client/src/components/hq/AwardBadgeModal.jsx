import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import Medal from '../ui/Medal';

/**
 * Staff-only "Award Badge" flow for a single HQ Member Profile. Badge choices
 * are constrained to whatever the server's badge catalog returns
 * (server/src/config/badgeCatalog.js) — there is no free-text badge-name
 * field anywhere in this modal, by design.
 */
export default function AwardBadgeModal({ memberId, onClose, onAwarded }) {
  const [catalog, setCatalog] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/hq/badge-catalog').then((d) => setCatalog(d.catalog));
  }, []);

  const selected = catalog?.find((b) => b.key === selectedKey) || null;

  async function handleAward() {
    if (!selectedKey) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await apiFetch(`/hq/members/${memberId}/badges`, {
        method: 'POST',
        body: { catalogKey: selectedKey, reason: reason.trim() || undefined },
      });
      onAwarded(data.badge);
      onClose();
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="card-glass p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold text-navy">Award Badge</h2>
          <p className="text-sm text-ink-secondary">Choose a badge from the catalog to award this member.</p>
        </div>

        {!catalog ? (
          <p className="text-sm text-ink-secondary py-6 text-center">Loading catalog…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {catalog.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setSelectedKey(b.key)}
                aria-pressed={selectedKey === b.key}
                className={`pressable flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-colors ${
                  selectedKey === b.key ? 'border-primary bg-primary/8' : 'border-border/16'
                }`}
              >
                <Medal icon={b.iconEmoji} category={b.badgeType} size={40} />
                <span className="text-xs font-semibold text-navy leading-tight">{b.name}</span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="card p-3 flex items-center gap-3">
            <Medal icon={selected.iconEmoji} category={selected.badgeType} size={48} />
            <div>
              <p className="text-sm font-bold text-navy">{selected.name}</p>
              <p className="text-xs text-ink-secondary">{selected.description}</p>
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-ink-secondary mb-1">
            Reason <span className="normal-case font-normal text-ink-muted">(optional)</span>
          </label>
          <textarea
            className="input"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this member earning this badge?"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAward}
            disabled={!selectedKey || submitting}
            className="btn-bubble flex-1 py-2.5 text-navy gradient-rainbow disabled:opacity-60"
          >
            {submitting ? 'Awarding…' : 'Award Badge'}
          </button>
        </div>
      </div>
    </div>
  );
}
