import React, { useRef, useLayoutEffect, useState, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';
import { useNavigate } from 'react-router-dom'; // adaugă la începutul fișierului



export default function PassengerPopup({
  x, y,
  passenger, seat,
  onDelete, onMove, onEdit,
  onMoveToOtherTrip,    // ← aici
  onPayCash,
  onPayCard,
  onRefundCard,
  onRetryReceipt,
  selectedDate,         // ← aici
  selectedHour,         // ← aici
  originalRouteId,      // ← aici
  onClose,
  tripId,
  showToast,
  globalPaymentLock
}) {



  const openReport = () => {
    if (passenger.person_id) {
      window.open(
        `${window.location.origin}/raport/${passenger.person_id}`,
        '_blank',
        'noopener,noreferrer'
      );
      onClose(); // închidem popupul
    }
  };





  const navigate = useNavigate(); // ✅ necesar pentru a funcționa navigate(...)






  const popupRef = useRef(null);
  const [position, setPosition] = useState({ top: y, left: x });

  // Confirm modals state
  const [showNoShowConfirm, setShowNoShowConfirm] = useState(false);
  const [showBlacklistConfirm, setShowBlacklistConfirm] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState('Are multe neprezentari');



  // ─── 1️⃣ State + fetch no-shows ───
  const [noShowResIds, setNoShowResIds] = useState(new Set());
  const [loadingNoShows, setLoadingNoShows] = useState(true);

  useEffect(() => {
    setLoadingNoShows(true);
    fetch(`/api/no-shows/${tripId}`)
      .then(r => r.json())
      .then(arr => setNoShowResIds(new Set(arr)))
      .catch(console.error)
      .finally(() => setLoadingNoShows(false));
  }, [tripId]);

  // pentru render
  const isNoShow = !loadingNoShows && noShowResIds.has(passenger.reservation_id);








  // ─── 2️⃣ Blacklist State ───
  const [blacklistedIds, setBlacklistedIds] = useState(new Set());
  useEffect(() => {
    fetch('/api/blacklist')
      .then(r => r.json())
      .then(rows => {
        /*  
           /api/blacklist returnează atât persoane din
           blacklist, cât şi persoane doar cu “no-show”.
           Considerăm „blacklistat” DOAR dacă:
             • source === 'blacklist'  (vezi backend)
             • sau blacklist_id !== null
        */
        const ids = new Set(
          rows
            .filter(
              row =>
                row.source === 'blacklist' ||
                row.blacklist_id !== null
            )
            .map(row => row.person_id)
        );
        setBlacklistedIds(ids);
      })
      .catch(console.error);
  }, []);
  const isBlacklisted = blacklistedIds.has(passenger.person_id || passenger.id);




  // ─── 3️⃣ Payment status pentru rezervarea acestui pasager ───
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const isPaid = !!paymentStatus && paymentStatus.status === 'paid';
  const canRefundCard =
    !!paymentStatus &&
    paymentStatus.payment_method === 'card' &&
    (paymentStatus.status === 'paid' || paymentStatus.status === 'pos_ok_waiting_receipt');



  // pentru dezactivare butoane cand avem job uri active
  const hasActiveJob =
    !!globalPaymentLock ||
    (
      !!paymentStatus &&
      paymentStatus.last_job &&
      (paymentStatus.last_job.status === 'in_progress' || paymentStatus.last_job.status === 'queued')
    );




  // La deschiderea popup-ului, încărcăm statusul plății pentru rezervare
  useEffect(() => {
    const reservationId = passenger?.reservation_id;
    if (!reservationId) {
      setPaymentStatus(null);
      setPaymentError(null);
      return;
    }

    let ignore = false;
    const run = async () => {
      try {
        setPaymentLoading(true);
        setPaymentError(null);

        const res = await fetch(`/api/reservations/${reservationId}/payments/status`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          console.error('[PassengerPopup] /payments/status error:', data);
          if (!ignore) {
            setPaymentStatus(null);
            setPaymentError(data?.error || 'Eroare la citirea plății');
          }
          return;
        }

        if (!ignore) {
          setPaymentStatus(
            data?.payment
              ? { ...data.payment, last_job: data?.last_job || null }
              : null
          );

        }
      } catch (err) {
        console.error('[PassengerPopup] /payments/status exception:', err);
        if (!ignore) {
          setPaymentStatus(null);
          setPaymentError(err.message || 'Eroare la citirea plății');
        }
      } finally {
        if (!ignore) {
          setPaymentLoading(false);
        }
      }
    };

    run();
    return () => {
      ignore = true;
    };
  }, [passenger?.reservation_id]);

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState(null);
  const [reservationPricing, setReservationPricing] = useState(null); // pricing[0]
  const [appliedDiscounts, setAppliedDiscounts] = useState([]);       // discounts[]


  useEffect(() => {
    const reservationId = passenger?.reservation_id;
    if (!reservationId) {
      setReservationPricing(null);
      setAppliedDiscounts([]);
      setDetailsError(null);
      return;
    }

    let ignore = false;

    const run = async () => {
      try {
        setDetailsLoading(true);
        setDetailsError(null);

        const res = await fetch(`/api/reservations/${reservationId}/details`, {
          credentials: 'include',
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          if (!ignore) {
            setReservationPricing(null);
            setAppliedDiscounts([]);
            setDetailsError(data?.error || 'Eroare la citirea detaliilor');
          }
          return;
        }

        if (!ignore) {
          setReservationPricing(data?.pricing || null);
          setAppliedDiscounts(Array.isArray(data?.discounts) ? data.discounts : []);
        }
      } catch (err) {
        if (!ignore) {
          setReservationPricing(null);
          setAppliedDiscounts([]);
          setDetailsError(err.message || 'Eroare la citirea detaliilor');
        }
      } finally {
        if (!ignore) setDetailsLoading(false);
      }
    };

    run();
    return () => { ignore = true; };
  }, [passenger?.reservation_id]);




  // Calculăm dacă putem afișa „Re-emite bon”
  // - pentru card: status = 'pos_ok_waiting_receipt' + receipt_status = 'error_needs_retry'
  // - pentru alte cazuri (dacă vei avea): acceptăm și 'paid'
  const canRetryReceipt =
    !!paymentStatus &&
    paymentStatus.receipt_status === 'error_needs_retry' &&
    (paymentStatus.payment_method || '').toLowerCase() === 'card' &&
    (paymentStatus.status === 'pos_ok_waiting_receipt' || paymentStatus.status === 'paid');

















  useLayoutEffect(() => {
    if (popupRef.current) {
      const popupRect = popupRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newLeft = x;
      let newTop = y;

      // Dacă iese în dreapta, mută spre stânga
      if (x + popupRect.width > viewportWidth - 8) {
        newLeft = viewportWidth - popupRect.width - 8;
      }
      if (newLeft < 8) newLeft = 8;

      // Dacă iese jos, urcă deasupra
      if (y + popupRect.height > viewportHeight - 8) {
        newTop = y - popupRect.height;
        if (newTop < 8) newTop = viewportHeight - popupRect.height - 8;
      }
      if (newTop < 8) newTop = 8;

      setPosition({ top: newTop, left: newLeft });
    }
  }, [x, y, passenger]);

  const handleMoveToOtherTripClick = () => {
    if (!onMoveToOtherTrip) return console.error("…");
    onMoveToOtherTrip({
      passenger,
      reservation_id: passenger.reservation_id,
      fromSeat: seat,
      boardAt: passenger.board_at,
      exitAt: passenger.exit_at,
      originalTime: selectedHour,
      originalRouteId,
      originalDate: selectedDate.toISOString().split('T')[0],
    });
    onClose();
  };



  // Handler pentru „Re-emite bon”
  const handleRetryReceipt = () => {
    if (!paymentStatus || !passenger?.reservation_id) return;

    if (!onRetryReceipt) {
      console.error('[PassengerPopup] lipseste prop onRetryReceipt');
      showToast('Eroare internă: lipsește handlerul de retry.', 'error', 8000);
      return;
    }

    onRetryReceipt({
      reservationId: passenger.reservation_id,
      paymentId: paymentStatus.payment_id,
    });

    // doar feedback UI - polling-ul și finalul se rezolvă în ReservationPage
    showToast('Re-emite bon fiscal trimis către agent…', 'info', 0);
  };

  const handleRefundCard = () => {
    if (!paymentStatus || !passenger?.reservation_id) return;
    if (!onRefundCard) {
      console.error('[PassengerPopup] lipseste prop onRefundCard');
      showToast('Eroare internă: lipsește handlerul de refund.', 'error', 8000);
      return;
    }
    if (!window.confirm('Ești sigur că vrei să inițiezi refundul pe POS?')) {
      return;
    }
    onRefundCard({
      reservationId: passenger.reservation_id,
      paymentId: paymentStatus.payment_id,
    });
  };
















  // 1️⃣ Extragi logica „avansată” într-o funcție dedicată
  const markNoShow = async () => {
    if (!passenger.reservation_id) {
      console.error('❌ reservation_id missing');
      return;
    }
    const payload = { reservation_id: passenger.reservation_id };
    console.log("📤 Trimitem către /api/no-shows:", payload);
    await fetch('/api/no-shows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    onClose();
  };

  const addToBlacklist = async (reason) => {

    const payload = {
      person_id: passenger.person_id || passenger.id,
      reason: 'Adăugat manual din popup',
      // added_by_employee_id implicit în backend
    };

    if (!payload.person_id) {
      console.error('❌ person_id lipsă');
      return;
    }

    console.log("📤 Trimitem către /api/blacklist:", payload);

    fetch('/api/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => res.json())
      .then(json => {
        if (json.error) {
          console.error(json.error);
        } else {
          console.log('🚫 Adăugat în blacklist');
        }
      });

    onClose();

  };

  // 2️⃣ handler-ul de confirmare simplu
  const handleConfirmNoShow = () => {
    markNoShow()
      .catch(err => console.error(err));
    setShowNoShowConfirm(false);
    onClose();
  };

  const handleConfirmBlacklist = () => {
    addToBlacklist(blacklistReason)
      .catch(err => console.error(err));
    setShowBlacklistConfirm(false);
    onClose();
  };
























  return (
    <div
      ref={popupRef}
      className="popup-container fixed bg-white shadow-xl border border-gray-300 rounded-lg z-50 text-sm"
      style={{
        top: position.top,
        left: position.left,
        minWidth: '220px',
        maxWidth: '260px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Nume pasager */}
      <button
        onClick={openReport}
        className="w-full text-left px-4 pt-3 pb-2 hover:bg-gray-50"
      >
        <div className="text-gray-800 font-semibold flex items-center gap-2">
          👤 {passenger.name || 'Pasager'}
        </div>
        <div className="text-gray-700 text-sm">
          <div className="flex items-center gap-2">
            📞 <span>{passenger.phone}</span>
          </div>
          <div className="flex items-center gap-2 italic text-gray-600">
            🚌 <span>{passenger.board_at} → {passenger.exit_at}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-700 mt-1">
            💰{' '}
            <span>
              {detailsLoading
                ? '...'
                : (reservationPricing?.price_value != null
                  ? `${Number(reservationPricing.price_value).toFixed(2)} lei`
                  : '—')}
            </span>
          </div>

          {Array.isArray(appliedDiscounts) && appliedDiscounts.length > 0 && (
            <div className="flex items-start gap-2 text-gray-600 mt-1">
              🏷️
              <div className="leading-4">
                {appliedDiscounts.map((d) => {
                  const label =
                    d.discount_label ||
                    d.promo_label ||
                    d.promo_code ||
                    d.discount_code ||
                    'Reducere';

                  const amount = Number(d.discount_amount || 0);
                  return (
                    <div key={d.reservation_discount_id}>
                      {label} {amount > 0 ? `(-${amount.toFixed(2)} lei)` : ''}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {detailsError && (
            <div className="text-xs text-red-500 mt-1">
              {detailsError}
            </div>
          )}

          {passenger.observations && (
            <div className="flex items-start gap-2 text-gray-500 mt-1">
              📝 <span className="whitespace-pre-line">{passenger.observations}</span>
            </div>
          )}
        </div>
      </button>

      {/* Acțiuni */}
      <div className="border-t divide-y">
<button
  onClick={() => {
    if (hasActiveJob) return;
   onEdit({ 
  pricing: reservationPricing, 
  discounts: appliedDiscounts 
});
  }}
  disabled={hasActiveJob}
  title={hasActiveJob ? 'Există o tranzacție în curs.' : ''}
  className={
    `block w-full text-left px-4 py-2 ` +
    (hasActiveJob
      ? 'text-gray-400 bg-gray-50 cursor-not-allowed'
      : 'hover:bg-gray-100')
  }
>
  ✏️ Editare
</button>








        <button
          onClick={() => {
            if (hasActiveJob) return;
            onMove();
          }}
          disabled={hasActiveJob}
          title={hasActiveJob ? 'Există o tranzacție în curs.' : ''}
          className={
            `block w-full text-left px-4 py-2 ` +
            (hasActiveJob ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'hover:bg-gray-100')
          }
        >
          🔁 Mută
        </button>


        <button
          onClick={() => {
            if (hasActiveJob) return;
            handleMoveToOtherTripClick();
          }}
          disabled={hasActiveJob}
          title={hasActiveJob ? 'Există o tranzacție în curs.' : ''}
          className={
            `block w-full text-left px-4 py-2 ` +
            (hasActiveJob ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'hover:bg-gray-100')
          }
        >
          🔁 Mută pe altă cursă
        </button>



        {onPayCash && (
          <button
            onClick={() => {
              if (isPaid || hasActiveJob) return;
              onPayCash();
            }}
            disabled={isPaid || hasActiveJob}
            title={
              isPaid
                ? 'Rezervarea este deja achitată.'
                : hasActiveJob
                  ? 'Există o tranzacție în curs.'
                  : ''
            }
            className={
              `block w-full text-left px-4 py-2 ` +
              (isPaid || hasActiveJob
                ? 'text-gray-400 bg-gray-50 cursor-not-allowed'
                : 'hover:bg-gray-100 text-emerald-700')
            }
          >
            💵 Achită cash
          </button>
        )}

        {onPayCard && (
          <button
            onClick={() => {
              if (isPaid || hasActiveJob) return;
              onPayCard();
            }}
            disabled={isPaid || hasActiveJob}
            title={
              isPaid
                ? 'Rezervarea este deja achitată.'
                : hasActiveJob
                  ? 'Există o tranzacție în curs.'
                  : ''
            }
            className={
              `block w-full text-left px-4 py-2 ` +
              (isPaid || hasActiveJob
                ? 'text-gray-400 bg-gray-50 cursor-not-allowed'
                : 'hover:bg-gray-100 text-emerald-700')
            }
          >
            💳 Achită cu cardul
          </button>
        )}

        {onRefundCard && canRefundCard && (
          <button
            onClick={handleRefundCard}
            disabled={hasActiveJob}
            title={hasActiveJob ? 'Există o tranzacție în curs.' : ''}
            className={
              `block w-full text-left px-4 py-2 ` +
              (hasActiveJob
                ? 'text-gray-400 bg-gray-50 cursor-not-allowed'
                : 'hover:bg-gray-100 text-rose-700')
            }
          >
            ↩️ Refund card (POS)
          </button>
        )}



        {canRetryReceipt && (
          <button
            onClick={handleRetryReceipt}
            className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-amber-700"
          >
            🧾 Re-emite bon fiscal
          </button>
        )}


        <button
          onClick={() => {
            if (hasActiveJob) return;
            onDelete();
          }}
          disabled={hasActiveJob}
          title={hasActiveJob ? 'Există o tranzacție în curs.' : ''}
          className={
            `block w-full text-left px-4 py-2 ` +
            (hasActiveJob ? 'text-gray-400 bg-gray-50 cursor-not-allowed' : 'hover:bg-gray-100 text-red-600')
          }
        >
          🗑️ Șterge
        </button>


        <button
          onClick={() => !isNoShow && setShowNoShowConfirm(true)}
          disabled={isNoShow || loadingNoShows}
          className={
            `flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-gray-100 ` +
            `${isNoShow ? 'opacity-50 cursor-not-allowed' : 'text-orange-600'}`
          }
        >
          ❗ <span>{isNoShow ? 'Înregistrat deja!' : 'Înregistrează neprezentare'}</span>
        </button>

        <button
          onClick={() => !isBlacklisted && setShowBlacklistConfirm(true)}
          disabled={isBlacklisted}
          className={
            `flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-gray-100 ` +
            `${isBlacklisted ? 'opacity-50 cursor-not-allowed' : 'text-orange-600'}`
          }
        >
          🚫 <span>{isBlacklisted ? 'Deja în blacklist' : 'Adaugă în blacklist'}</span>
        </button>









      </div>

      {/* Închidere */}
      <button
        className="text-xs text-gray-400 hover:text-gray-600 hover:underline w-full text-center py-2 border-t"
        onClick={onClose}
      >
        ✖️ Închide
      </button>




      {/*** Modalele de confirmare ***/}
      {/* Confirmare neprezentare */}
      <ConfirmModal
        show={showNoShowConfirm}
        title="Confirmare neprezentare"
        message="Ești sigur că vrei să marchezi ca neprezentat?"
        cancelText="Renunță"
        confirmText="Confirmă"
        onCancel={() => setShowNoShowConfirm(false)}
        onConfirm={async () => {
          try {
            const res = await fetch(`/api/no-shows`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                reservation_id: passenger.reservation_id,
                trip_id: tripId,
              }),
            });
            const json = await res.json();
            if (json.error) throw new Error(json.error);

            // ✅ toast prin handlerul central
            showToast('Neprezentare înregistrată cu succes', 'success', 3000);
          } catch (err) {
            showToast(
              err.message || 'Eroare la înregistrare neprezentare',
              'error',
              6000
            );
          } finally {
            setShowNoShowConfirm(false);
            onClose();
            // ❌ NU mai avem setTimeout aici
          }
        }}

      />

      {/* Confirmare blacklist */}
      <ConfirmModal
        show={showBlacklistConfirm}
        title="Confirmare blacklist"
        cancelText="Renunță"
        confirmText="Adaugă"
        onCancel={() => setShowBlacklistConfirm(false)}
        onConfirm={async () => {
          try {
            const payload = {
              person_id: passenger.person_id || passenger.id,
              reason: blacklistReason,
              // added_by_employee_id implicit în backend
            };

            const res = await fetch('/api/blacklist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (data.already) {
              showToast('Persoana era deja în blacklist', 'info', 3000);
            } else if (!res.ok) {
              showToast(
                data.error || 'Eroare la adăugare în blacklist',
                'error',
                6000
              );
            } else {
              showToast('Adăugat în blacklist cu succes', 'success', 3000);
            }
          } catch (err) {
            showToast(
              err.message || 'Eroare la adăugare în blacklist',
              'error',
              6000
            );
          } finally {
            setShowBlacklistConfirm(false);
            onClose();
            // ❌ fără setTimeout pe toast aici
          }
        }}

      >
        <div className="text-sm mb-2">
          Ești sigur că vrei să adaugi în blacklist?
        </div>
        <textarea
          className="w-full border p-2 rounded text-sm"
          rows={3}
          value={blacklistReason}
          onChange={e => setBlacklistReason(e.target.value)}
        />
      </ConfirmModal>












    </div >
  );
}
