// 📁 components/SeatMap.jsx
import React, { forwardRef } from 'react';

const SeatMap = forwardRef(function SeatMap({
  seats,
  stops,
  selectedSeats,
  setSelectedSeats,
  moveSourceSeat,
  setMoveSourceSeat,
  popupPassenger,
  setPopupPassenger,
  popupSeat,
  setPopupSeat,
  popupPosition,
  setPopupPosition,
  handleMovePassenger,
  handleSeatClick,
  toggleSeat,
  isSeatFullyOccupiedViaSegments,
  checkSegmentOverlap,
  selectedRoute,
  setToastMessage,
  setToastType,
  driverName = '',
  intentHolds = {},
  isWideView = false,
  wideSeatSize = { width: 260, height: 150 },
  showObservations = false,
  seatTextSize = 11,
  seatTextColor = '#ffffff',
}, ref) {


  /*
  console.log('[SeatMap] Render', {
    selectedRoute,
    stops,
    seats
  });
*/
  if (!Array.isArray(stops) || stops.length === 0) {
    console.log('[SeatMap] NU există stops pe selectedRoute, opresc render-ul SeatMap');
    return <div className="text-red-500 font-bold p-4">Nu există rute sau stații!</div>;
  }




  const seatWidth = isWideView ? wideSeatSize?.width || 260 : 105;
  const seatHeight = isWideView ? wideSeatSize?.height || 150 : 100;
  const maxCol = seats.length > 0 ? Math.max(...seats.map(s => s.seat_col || 1)) : 1;
  const maxRow = seats.length > 0 ? Math.max(...seats.map(s => s.row || 1)) : 1;

  const baseSeatTextSize = Number(seatTextSize) || 11;
  const passengerNameStyle = {
    fontSize: `${baseSeatTextSize + 1}px`,
    color: seatTextColor,
  };
  const passengerLineStyle = {
    fontSize: `${baseSeatTextSize}px`,
    color: seatTextColor,
  };
  const passengerSmallStyle = {
    fontSize: `${Math.max(baseSeatTextSize - 1, 8)}px`,
    color: seatTextColor,
  };




  return (
    <div
      ref={ref}
      className="relative mx-auto"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${maxCol}, ${seatWidth}px)`,   // lățimea locului se ajustează după modul de vizualizare
        gridTemplateRows: `repeat(${maxRow + 1}, ${seatHeight}px)`,
        gap: "5px",
        background: "#f3f4f6",
        padding: 16,
        borderRadius: 16,
        width: "fit-content",   // cheia ca să se adapteze la conținut!
        margin: "0 auto",
        minWidth: 0,
        boxSizing: "border-box"
      }}
    >


      {seats.map((seat) => {




        const normalizedLabel = String(seat.label || '').toLowerCase();
        const isSelected = selectedSeats.find((s) => s.id === seat.id);
        const isDriver =
          normalizedLabel.includes('șofer') ||
          normalizedLabel.includes('sofer') ||
          seat.seat_type === 'driver';
        const isGuide = normalizedLabel.includes('ghid') || seat.seat_type === 'guide';
        const isServiceSeat = isDriver || isGuide;
        const status = seat.status; // 'free', 'partial', 'full'
        const holdInfo = intentHolds?.[seat.id];
        const heldByOther = holdInfo?.isMine === false;
        const heldByMe = holdInfo?.isMine === true;
        const seatTitle = isDriver && driverName ? driverName : seat.label;

        let baseColorClass;

        if (isServiceSeat) {
          baseColorClass = 'bg-gray-600 cursor-not-allowed';
        } else if (status === 'full') {
          baseColorClass = 'bg-red-600 cursor-not-allowed';
        } else if (heldByOther) {
          baseColorClass = 'bg-orange-500 cursor-not-allowed';
        } else if (status === 'partial') {
          baseColorClass = 'bg-yellow-500 hover:bg-yellow-600';
        } else if (isSelected || heldByMe) {
          baseColorClass = 'bg-blue-500 hover:bg-blue-600';
        } else {
          baseColorClass = 'bg-green-500 hover:bg-green-600';
        }



        // ✅ Pasagerii activi de pe loc
        const activePassengers = (seat.passengers || []).filter(
          p => !p.status || p.status === 'active'
        );


        const getPaymentIcon = (p) => {
          if (p?.payment_status === 'paid') {
            if (p?.payment_method === 'cash') return '💵';
            if (p?.payment_method === 'card' && p?.booking_channel === 'online') return '🌐';
            if (p?.payment_method === 'card') return '💳';
            return '💳';
          }
          return '📎';
        };


        const formatAmount = (amount) => {
          if (typeof amount !== 'number' || Number.isNaN(amount)) return null;
          const rounded = Math.round(amount * 100) / 100;
          const isWhole = Number.isInteger(rounded);
          return `${isWhole ? rounded.toFixed(0) : rounded.toFixed(2)} lei`;
        };



        return (
          <div

            key={seat.id}
            data-seat-id={seat.id}
            onClick={(e) => {




              if (isDriver) return;

              if (heldByOther) {
                setToastMessage('Locul e în curs de rezervare de alt agent');
                setToastType('error');
                setTimeout(() => setToastMessage(''), 3000);
                return;
              }

              if (moveSourceSeat && seat.id !== moveSourceSeat.id) {
                const passengerToMove = moveSourceSeat.passengers?.[0];
                if (!passengerToMove) return;


                const overlapExists = seat.passengers?.some((p) =>
                  checkSegmentOverlap(
                    p,
                    passengerToMove.board_at,
                    passengerToMove.exit_at,
                    stops
                  )
                );

                if (!overlapExists) {
                  handleMovePassenger(moveSourceSeat, seat);
                } else {
                  setToastMessage(`Segmentul se suprapune cu rezervările existente pe locul ${seat.label}`);
                  setToastType('error');
                  setTimeout(() => setToastMessage(''), 3000);
                }

                setMoveSourceSeat(null);
              }
              else if (activePassengers.length > 0) {
                handleSeatClick(e, seat);
              } else {
                toggleSeat(seat);
              }
            }}
            className={`relative text-white text-xs md:text-sm text-left rounded cursor-pointer flex flex-col justify-start pl-3 pr-2 pt-2 pb-2 transition-all duration-150 hover:shadow-xl hover:scale-[1.02] overflow-hidden ${baseColorClass}

${isSelected ? 'animate-pulse ring-2 ring-white [animation-duration:2s]' : ''}




  ${moveSourceSeat?.id === seat.id ? 'ring-4 ring-yellow-400' : ''}
`}

            style={{
              gridRowStart: seat.row + 1,
              gridColumnStart: seat.seat_col,
              width: `${seatWidth}px`,
              height: `${seatHeight}px`,
            }}
          >


            {/* NUMĂR LOC – FUNDAL */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{
                fontSize: '64px',
                fontWeight: 800,
                color: 'rgba(255,255,255,0.18)',
                lineHeight: 1,
                zIndex: 0,
              }}
            >
              {seat.label}
            </div>





            <div className="relative z-10">
              <div className="flex justify-between items-start font-semibold text-[13px] leading-tight mb-1">
                <span className="flex items-center gap-1">



                  {activePassengers.length > 0 && (
                    <span className="text-base leading-none">
                      {getPaymentIcon(activePassengers[0])}
                    </span>
                  )}
                </span>


                {activePassengers.length > 0 && (
                  <span
                    className="text-right truncate max-w-[85%]"

                    style={passengerNameStyle}
                  >
                    {activePassengers[0]?.name || '(fără nume)'}
                  </span>

                )}
              </div>


              {isDriver && (
                <>

                  {driverName && (
                    <div className="text-[14px] font-semibold leading-tight">
                      {driverName}
                    </div>
                  )}
                </>
              )}


              {activePassengers.length > 0 && (
                <div className="flex flex-col items-end text-right gap-1 text-[11px] leading-tight">
                  {activePassengers.map((p, i) => (
                    <div key={i} className="w-full">



                      {i > 0 && (
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-base leading-none text-left">
                            {getPaymentIcon(p)}
                          </div>

                          <div
                            className="font-semibold text-[12px] leading-tight truncate text-right flex-1"
                            style={passengerNameStyle}
                          >
                            {p.name || '(fără nume)'}
                          </div>
                        </div>
                      )}




                      <div style={passengerLineStyle}>
                        {p.phone}
                      </div>
                      <div className="flex items-center justify-between gap-2 italic" style={passengerLineStyle}>
                        <div className="flex items-center gap-1 text-left not-italic">
                          {(() => {


                            const amountValue =
                              typeof p.amount === 'number' ? p.amount :
                                typeof p.price === 'number' ? p.price :
                                  typeof p.price_value === 'number' ? p.price_value :
                                    typeof p.total_price === 'number' ? p.total_price :
                                      Number(p.amount ?? p.price ?? p.price_value ?? p.total_price);

                            const amountLabel = formatAmount(amountValue);

                            return (
                              <>
                                <span>{amountLabel || '-'}</span>
                              </>
                            );

                          })()}
                        </div>

                        <span className="truncate text-right italic">
                          {p.board_at} → {p.exit_at}
                        </span>
                      </div>

                      {showObservations && p.observations && (
                        <div
                          className="mt-0.5 text-[10px] text-white/90 italic text-right whitespace-pre-line"
                          style={passengerSmallStyle}
                        >
                          📝 {p.observations}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}




            </div>

            {heldByOther && (
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-45 text-[11px] font-semibold uppercase">
                {holdInfo?.holder_name
                  ? `Ocupat de ${holdInfo.holder_name}`
                  : 'Ocupat online'}

              </div>
            )}



          </div>
        );
      })}
    </div>
  );
});

export default SeatMap;
