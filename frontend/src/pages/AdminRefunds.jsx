import React, { useCallback, useEffect, useMemo, useState } from 'react';

const STATUS_LABELS = {
  pending: 'În curs',
  succeeded: 'Succes',
  failed: 'Eroare',
  voided: 'Anulat',
};

function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('ro-RO');
  } catch {
    return value;
  }
}

function formatCurrency(amount, currency) {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  try {
    return new Intl.NumberFormat('ro-RO', {
      style: 'currency',
      currency: currency || 'RON',
      minimumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${amount} ${currency || 'RON'}`;
  }
}

export default function AdminRefunds() {
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [processingId, setProcessingId] = useState(null);

  const loadRefunds = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/refunds', { credentials: 'include' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error || 'Nu am putut încărca refundurile.');
      }
      setRefunds(Array.isArray(data?.refunds) ? data.refunds : []);
    } catch (err) {
      setError(err?.message || 'Nu am putut încărca refundurile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRefunds();
  }, [loadRefunds]);

  const filteredRefunds = useMemo(() => {
    if (filter === 'all') return refunds;
    return refunds.filter((item) => item?.refund?.status === filter);
  }, [refunds, filter]);

  const formatSeatLabels = (reservations) => {
    const labels = (reservations || [])
      .map((resv) => resv?.seat_label)
      .filter((value) => value && String(value).trim());
    if (!labels.length) return '—';
    return labels.join(', ');
  };

  const formatSegments = (reservations) => {
    const segments = (reservations || [])
      .map((resv) => {
        const board = resv?.board_name ? String(resv.board_name).trim() : '';
        const exit = resv?.exit_name ? String(resv.exit_name).trim() : '';
        if (!board && !exit) return null;
        return `${board || '—'} → ${exit || '—'}`;
      })
      .filter(Boolean);
    if (!segments.length) return '—';
    return segments.join(', ');
  };

  const getDirectionLabel = (order, reservations) => {
    // 1) prioritate: order.trip_direction (public / fallback intern)
    // 2) fallback: reservations[0].trip_direction (intern)
    const raw = order?.trip_direction || reservations?.[0]?.trip_direction || null;
    if (!raw) return null;

    const v = String(raw).trim().toLowerCase();

    if (v === 'retur') return 'Retur';
    if (v === 'tur') return 'Tur';

    // dacă vine alt format din DB, îl afișăm așa cum e
    return String(raw);
  };


  const handleMarkSuccess = async (refundId) => {
    if (!refundId) return;
    if (!window.confirm('Ești sigur că vrei să marchezi acest refund ca reușit?')) return;
    setProcessingId(refundId);
    try {
      const resp = await fetch(`/api/refunds/${refundId}/mark-success`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual_success' }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error || 'Nu am putut marca refundul.');
      }
      await loadRefunds();
    } catch (err) {
      setError(err?.message || 'Nu am putut marca refundul.');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Refunds</h2>
          <p className="text-sm text-gray-600">Gestionare refunduri și erori la procesarea automată.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="border rounded px-3 py-1 text-sm"
          >
            <option value="all">Toate</option>
            <option value="pending">În curs</option>
            <option value="succeeded">Succes</option>
            <option value="failed">Eroare</option>
            <option value="voided">Anulat</option>
          </select>
          <button
            type="button"
            onClick={loadRefunds}
            className="border rounded px-3 py-1 text-sm bg-white"
          >
            Reîncarcă
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500">Se încarcă...</div>
      ) : filteredRefunds.length === 0 ? (
        <div className="text-sm text-gray-500">Nu există refunduri.</div>
      ) : (
        <div className="space-y-3">
          {filteredRefunds.map((item) => {
            const refund = item?.refund || {};
            const order = item?.order || {};
            const paymentPublic = item?.payment_public || {};
            const reservations = Array.isArray(item?.reservations) ? item.reservations : [];
            const seatLabelText = formatSeatLabels(reservations);
            const segmentText = formatSegments(reservations);

            return (
              <div key={refund.id} className="border rounded-lg bg-white p-4 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm text-gray-500">Refund #{refund.id}</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatCurrency(refund.amount, refund.currency)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${refund.status === 'succeeded'
                        ? 'bg-green-100 text-green-700'
                        : refund.status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : refund.status === 'pending'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-700'
                      }`}>
                      {STATUS_LABELS[refund.status] || refund.status || '—'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatDateTime(refund.created_at)}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3 text-sm text-gray-700">
                  <div className="space-y-1">
                    <div className="text-xs uppercase text-gray-400">Comandă</div>
                    <div>ORDER ID: {order.id || '—'}</div>
                    <div>Status: {order.status || '—'}</div>
                    <div>Client: {order.customer_name || '—'}</div>
                    <div>Telefon: {order.customer_phone || '—'}</div>
                    <div>Email: {order.customer_email || '—'}</div>
                    <div>Rută: {order.route_name || '—'}</div>
                    {(() => {
                      const dirLabel = getDirectionLabel(order, reservations);
                      return (
                        <div>
                          Plecare: {order.trip_date || '—'} {order.trip_time || ''}
                          {dirLabel ? ` (${dirLabel})` : ''}
                        </div>
                      );
                    })()}

                    <div>Loc: {seatLabelText}</div>
                    <div>Secțiune: {segmentText}</div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs uppercase text-gray-400">Plată publică</div>
                    <div>Status: {paymentPublic.status || '—'}</div>
                    <div>Amount: {formatCurrency(paymentPublic.amount, refund.currency)}</div>
                    <div>Provider payment ID: {paymentPublic.provider_payment_id || '—'}</div>
                    <div>Order number: {paymentPublic.provider_order_number || '—'}</div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs uppercase text-gray-400">Procesat manual</div>
                    <div>By: {refund.processed_by?.name || '—'}</div>
                    <div>Email: {refund.processed_by?.email || '—'}</div>
                    <div>Procesat la: {formatDateTime(refund.processed_at)}</div>
                    <div>Reason: {refund.reason || '—'}</div>
                  </div>
                </div>

                {refund.status === 'failed' && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleMarkSuccess(refund.id)}
                      disabled={processingId === refund.id}
                      className="px-3 py-1.5 text-xs font-semibold uppercase rounded border border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-50"
                    >
                      {processingId === refund.id ? 'Se salvează...' : 'Marchează ca succes'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
