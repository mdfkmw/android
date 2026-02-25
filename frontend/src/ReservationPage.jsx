import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Calendar from 'react-calendar';
import { format, addDays } from 'date-fns';
import { ro } from 'date-fns/locale';
import 'react-calendar/dist/Calendar.css';
import Select from 'react-select';
import Toast from './components/Toast';
import PassengerPopup from './components/PassengerPopup';
import MultiPassengerPopup from './components/MultiPassengerPopup';
import RouteSelector from './components/RouteSelector';
import HourSelector from './components/HourSelector';
import VehicleSelector from './components/VehicleSelector';
import SeatMap from './components/SeatMap';
import SeatTimeline from './components/SeatTimeline';
import PassengerForm from './components/PassengerForm';
import { isPassengerValid } from './components/utils/validation';

import MoveToOtherTripPanel from './components/MoveToOtherTripPanel';
import CalendarWrapper from './components/CalendarWrapper';
import AddVehicleModal from './components/AddVehicleModal';
import ConfirmModal from './components/ConfirmModal';
import { selectSeats } from './components/reservationLogic';
import { io } from "socket.io-client";


const ONLINE_SETTINGS_DEFAULTS = {
  blockPastReservations: true,
  publicMinNoticeMinutes: 0,
  publicMaxAdvanceMinutes: 0,
};








export default function ReservationPage({ userRole, user }) {



  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(null); // { promo_code_id, code, discount_amount, combinable }

  const [isPromoValidating, setIsPromoValidating] = useState(false);
  const lastPromoApplyKeyRef = useRef(null);
  const promoBaseTotalRef = useRef(null);


  const normalizedRole = typeof userRole === 'string' ? userRole.toLowerCase() : '';
  const bookingChannel = ['admin', 'operator_admin', 'agent'].includes(normalizedRole)
    ? 'agent'
    : 'online';

  const [onlineSettings, setOnlineSettings] = useState(null);
  const [onlineSettingsLoaded, setOnlineSettingsLoaded] = useState(false);

  const [userPreferences, setUserPreferences] = useState(null);
  const [userPrefsLoaded, setUserPrefsLoaded] = useState(false);


  const inFlightPrice = useRef(new Set()); // chei unice pt requesturi de preț aflate în derulare

  const lastRouteIdRef = useRef(null);  //Adaugă un ref ca să ții minte ultimul route_id





  // 📅 Starea pentru data selectată în calendar
  const [selectedDate, setSelectedDate] = useState(new Date());
  // --- Lista stațiilor normalizate pentru ruta selectată ---
  const [routeStations, setRouteStations] = useState([]);
  // 💺 Locurile selectate în diagrama autobuzului
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [seatViewMode, setSeatViewMode] = useState('grid');
  const [isWideView, setIsWideView] = useState(false);
  const [showWideSeatControls, setShowWideSeatControls] = useState(false);
  const [isExportingSeatMap, setIsExportingSeatMap] = useState(false);
  const [isTimelineModalOpen, setIsTimelineModalOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false,
  );
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState('map');
  const [seatMapZoom, setSeatMapZoom] = useState(1);
  const [seatMapPan, setSeatMapPan] = useState({ x: 0, y: 0 });
  const [seatMapMinZoom, setSeatMapMinZoom] = useState(1);
  const gestureStateRef = useRef({ mode: null, startDistance: 0, startZoom: 1, startPan: { x: 0, y: 0 }, startTouch: { x: 0, y: 0 } });
  const mobileSeatMapViewportRef = useRef(null);
  const selectedSeatsRef = useRef([]);
  const previousSelectionKeyRef = useRef(null);
  const seatMapRef = useRef(null);
  useEffect(() => {
    let ignore = false;
    const loadSettings = async () => {
      try {
        const res = await fetch('/api/online-settings', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (ignore) return;
        const rawMaxAdvanceMinutes = Number(
          data?.publicMaxAdvanceMinutes != null
            ? data.publicMaxAdvanceMinutes
            : data?.publicMaxDaysAhead != null
              ? Number(data.publicMaxDaysAhead) * 24 * 60
              : 0,
        );
        const maxAdvanceMinutes = Number.isFinite(rawMaxAdvanceMinutes)
          ? Math.max(0, Math.floor(rawMaxAdvanceMinutes))
          : 0;

        setOnlineSettings({
          blockPastReservations: !!data?.blockPastReservations,
          publicMinNoticeMinutes: Number(data?.publicMinNoticeMinutes) || 0,
          publicMaxAdvanceMinutes: maxAdvanceMinutes,
        });
      } catch (err) {
        if (!ignore) {
          console.warn('Nu am putut încărca setările online:', err);
          setOnlineSettings({ ...ONLINE_SETTINGS_DEFAULTS });
        }
      } finally {
        if (!ignore) setOnlineSettingsLoaded(true);
      }
    };
    loadSettings();
    return () => {
      ignore = true;
    };
  }, []);
  // 👥 Obiect care conține datele fiecărui pasager selectat
  const [passengersData, setPassengersData] = useState({});
  // 💵 Prețurile calculate pentru fiecare loc (seat_id -> price)
  const [pricePerSeat, setPricePerSeat] = useState({});
  // 🛂 Intent-uri active pentru locuri (seat_id -> { expires_at, isMine })
  const [intentHolds, setIntentHolds] = useState({});
  const [intentsReady, setIntentsReady] = useState(false);
  const intentPollTimerRef = useRef(null);
  const intentsSocketRef = useRef(null);


  const intentsRef = useRef({});
  const refreshIntentsRef = useRef(null);
  const fetchCurrentSeatMapRef = useRef(null);






  // 🗺️ ID-ul cursei (trip) curente pentru cereri precise
  const [tripId, setTripId] = useState(null);

  const [seats, setSeats] = useState([]);


  // 🔔 Textul și tipul notificărilor (toast)
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('info');
  const toastHideTimerRef = useRef(null);

  const showToast = useCallback((message, type = 'info', durationMs = 3000) => {
    // setăm toastul
    setToastMessage(message);
    setToastType(type);

    // oprim orice timer vechi
    if (toastHideTimerRef.current) {
      clearTimeout(toastHideTimerRef.current);
      toastHideTimerRef.current = null;
    }

    // dacă durationMs > 0, programăm auto-clear
    if (durationMs > 0) {
      toastHideTimerRef.current = setTimeout(() => {
        setToastMessage('');
        toastHideTimerRef.current = null;
      }, durationMs);
    }
  }, []);
  //toast cleanup
  useEffect(() => {
    return () => {
      if (toastHideTimerRef.current) {
        clearTimeout(toastHideTimerRef.current);
        toastHideTimerRef.current = null;
      }
    };
  }, []);



  // Cheie stabilă pentru stații (prima | ultima) — evită rerender-uri inutile
  const stationsKey = useMemo(() => {
    if (!Array.isArray(routeStations) || routeStations.length < 2) return null;
    const first = routeStations[0]?.station_id ?? null;
    const last = routeStations[routeStations.length - 1]?.station_id ?? null;
    return (first != null && last != null) ? `${first}|${last}` : null;
  }, [routeStations]);

  // Când se schimbă stațiile (ex: comuți tur ↔ retur), resetăm selecțiile și prețurile
  useEffect(() => {
    if (!stationsKey) return;     // așteptăm să existe capete valide
    setSelectedSeats([]);
    setPassengersData({});
    setPricePerSeat({});
    setAutoSelectPaused(false);
  }, [stationsKey]);

  useEffect(() => {
    selectedSeatsRef.current = selectedSeats;
  }, [selectedSeats]);

  useEffect(() => {
    if (!isWideView && showWideSeatControls) {
      setShowWideSeatControls(false);
    }
  }, [isWideView, showWideSeatControls]);


  useEffect(() => {
    if (!isTimelineModalOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsTimelineModalOpen(false);
        setSeatViewMode('grid');
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTimelineModalOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleResize = () => {
      setIsMobileViewport(window.innerWidth < 1024);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const releaseHeldSeats = useCallback(() => {
    if (!tripId) return;

    const ids = new Set();

    // 1) locurile selectate
    const seatsToRelease = Array.isArray(selectedSeatsRef.current) ? selectedSeatsRef.current : [];
    seatsToRelease.forEach((seat) => {
      const id = Number(seat?.id);
      if (Number.isFinite(id)) ids.add(id);
    });

    // 2) toate intent-urile mele (chiar dacă nu mai am selectedSeats)
    Object.entries(intentsRef.current || {}).forEach(([seatId, info]) => {
      if (info?.isMine) {
        const id = Number(seatId);
        if (Number.isFinite(id)) ids.add(id);
      }
    });

    ids.forEach((seatId) => {
      fetch(`/api/intents/${tripId}/${seatId}`, {
        method: 'DELETE',
        credentials: 'include',
      }).catch(() => { });
    });
  }, [tripId]);




  // 🚍 Ruta selectată de utilizator
  const [selectedRoute, setSelectedRoute] = useState(null);
  const addMinutesToTime = useCallback((timeStr, offsetMinutes) => {
    if (!timeStr || !Number.isFinite(offsetMinutes)) return null;
    const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const baseMinutes = Number(match[1]) * 60 + Number(match[2]);
    if (!Number.isFinite(baseMinutes)) return null;
    const total = (baseMinutes + offsetMinutes + 24 * 60) % (24 * 60);
    const hh = String(Math.floor(total / 60)).padStart(2, '0');
    const mm = String(total % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }, []);

  // Derivăm o singură dată lista de nume stații din routeStations
  const stops = useMemo(() => routeStations.map(s => s.name), [routeStations]);

  // ⏰ Programarea selectată pentru cursa aleasă
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [selectedDirection, setSelectedDirection] = useState(null);
  const [scheduleSelectionToken, setScheduleSelectionToken] = useState(0);
  const selectedHour = selectedSchedule?.departure ?? null;
  const selectedScheduleId = (selectedSchedule?.scheduleId ?? selectedSchedule?.id) ?? null;
  const effectiveDirection = selectedSchedule?.direction ?? selectedDirection ?? null;
  const hasActiveSchedule = selectedScheduleId != null;

  useEffect(() => {
    if (!selectedHour) {
      setMobileWorkspaceTab('map');
      setSeatMapZoom(1);
      setSeatMapMinZoom(1);
      setSeatMapPan({ x: 0, y: 0 });
    }
  }, [selectedHour]);

  const clampSeatMapZoom = useCallback((value) => {
    return Math.min(3, Math.max(seatMapMinZoom, value));
  }, [seatMapMinZoom]);

  const recalculateSeatMapFitZoom = useCallback(() => {
    if (!isMobileViewport) return null;
    const viewportEl = mobileSeatMapViewportRef.current;
    const contentEl = seatMapRef.current;
    if (!viewportEl || !contentEl) return null;

    const viewportWidth = viewportEl.clientWidth;
    const contentWidth = contentEl.offsetWidth;

    if (!viewportWidth || !contentWidth) return null;

    const fitScale = Math.min((viewportWidth / contentWidth) * 0.98, 1);
    const safeFitScale = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;
    const centeredX = Math.max(0, (viewportWidth - (contentWidth * safeFitScale)) / 2);

    return {
      minZoom: safeFitScale,
      fitPan: { x: centeredX, y: 0 },
    };
  }, [isMobileViewport]);

  useEffect(() => {
    if (!isMobileViewport || mobileWorkspaceTab !== 'map' || !selectedHour || !Array.isArray(seats) || seats.length === 0) {
      return undefined;
    }

    const rafId = window.requestAnimationFrame(() => {
      const fit = recalculateSeatMapFitZoom();
      if (!fit) return;
      setSeatMapMinZoom(fit.minZoom);
      setSeatMapZoom((prev) => {
        if (!Number.isFinite(prev) || prev <= 1) return fit.minZoom;
        return Math.max(prev, fit.minZoom);
      });
      setSeatMapPan((prev) => {
        if (!Number.isFinite(prev?.x) || !Number.isFinite(prev?.y) || (prev.x === 0 && prev.y === 0)) {
          return fit.fitPan;
        }
        return prev;
      });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [isMobileViewport, mobileWorkspaceTab, selectedHour, seats, recalculateSeatMapFitZoom]);

  const getTouchDistance = useCallback((touchA, touchB) => {
    const dx = touchA.clientX - touchB.clientX;
    const dy = touchA.clientY - touchB.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  const handleSeatMapTouchStart = useCallback((event) => {
    if (!isMobileViewport) return;
    const touches = event.touches;

    if (touches.length === 2) {
      event.preventDefault();
      gestureStateRef.current = {
        mode: 'pinch',
        startDistance: getTouchDistance(touches[0], touches[1]),
        startZoom: seatMapZoom,
        startPan: seatMapPan,
        startTouch: { x: 0, y: 0 },
      };
      return;
    }

    if (touches.length === 1 && seatMapZoom > 1) {
      gestureStateRef.current = {
        mode: 'pan',
        startDistance: 0,
        startZoom: seatMapZoom,
        startPan: seatMapPan,
        startTouch: { x: touches[0].clientX, y: touches[0].clientY },
      };
    }
  }, [getTouchDistance, isMobileViewport, seatMapPan, seatMapZoom]);

  const handleSeatMapTouchMove = useCallback((event) => {
    if (!isMobileViewport) return;
    const gesture = gestureStateRef.current;
    if (!gesture?.mode) return;

    if (gesture.mode === 'pinch' && event.touches.length === 2) {
      event.preventDefault();
      const currentDistance = getTouchDistance(event.touches[0], event.touches[1]);
      if (!Number.isFinite(currentDistance) || !gesture.startDistance) return;
      const nextZoom = clampSeatMapZoom(gesture.startZoom * (currentDistance / gesture.startDistance));
      setSeatMapZoom(nextZoom);
      return;
    }

    if (gesture.mode === 'pan' && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      setSeatMapPan({
        x: gesture.startPan.x + (touch.clientX - gesture.startTouch.x),
        y: gesture.startPan.y + (touch.clientY - gesture.startTouch.y),
      });
    }
  }, [clampSeatMapZoom, getTouchDistance, isMobileViewport]);

  const handleSeatMapTouchEnd = useCallback(() => {
    gestureStateRef.current = {
      mode: null,
      startDistance: 0,
      startZoom: seatMapZoom,
      startPan: seatMapPan,
      startTouch: { x: 0, y: 0 },
    };
  }, [seatMapPan, seatMapZoom]);

  const zoomSeatMap = useCallback((delta) => {
    setSeatMapZoom((prev) => clampSeatMapZoom(prev + delta));
  }, [clampSeatMapZoom]);

  const resetSeatMapViewport = useCallback(() => {
    const fit = recalculateSeatMapFitZoom();
    if (fit) {
      setSeatMapMinZoom(fit.minZoom);
      setSeatMapZoom(fit.minZoom);
      setSeatMapPan(fit.fitPan);
      return;
    }
    setSeatMapZoom(seatMapMinZoom);
    setSeatMapPan({ x: 0, y: 0 });
  }, [recalculateSeatMapFitZoom, seatMapMinZoom]);

  const stopDetailsByName = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(routeStations) || !routeStations.length) return map;
    let cumulative = 0;
    routeStations.forEach((s, index) => {
      const offset = index === 0 ? 0 : cumulative;
      const duration = Number(s.duration_min);
      if (Number.isFinite(duration) && duration > 0) {
        cumulative += duration;
      }
      const note = typeof s.public_note === 'string' ? s.public_note.trim() : '';
      const lat = s.public_latitude != null ? Number(s.public_latitude) : null;
      const lng = s.public_longitude != null ? Number(s.public_longitude) : null;
      map.set(s.name, {
        stationId: Number(s.station_id),
        note: note || null,
        offsetMinutes: offset,
        time: selectedHour ? addMinutesToTime(selectedHour, offset) : null,
        latitude: Number.isFinite(lat) ? lat : null,
        longitude: Number.isFinite(lng) ? lng : null,
      });
    });
    return map;
  }, [routeStations, selectedHour, addMinutesToTime]);
  const stationIdByName = useMemo(() => {
    const map = new Map();
    for (const st of routeStations) {
      map.set(st.name, st.station_id);
    }
    return map;
  }, [routeStations]);
  const stationNameById = useMemo(() => {
    const map = new Map();
    for (const st of routeStations) {
      map.set(String(st.station_id), st.name);
    }
    return map;
  }, [routeStations]);

  const getStationIdByName = useCallback(
    (name) => {
      if (!name) return null;
      return stationIdByName.get(name) ?? null;
    },
    [stationIdByName]
  );

  const getStationNameById = useCallback(
    (stationId) => {
      if (stationId === null || stationId === undefined) return '';
      return stationNameById.get(String(stationId)) ?? '';
    },
    [stationNameById]
  );

  const refreshIntents = useCallback(async () => {
    if (!tripId) {
      setIntentHolds({});
      setIntentsReady(false);
      return {};
    }

    try {
      const res = await fetch(`/api/intents?trip_id=${tripId}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        if (res.status === 404 || res.status === 400) {
          setIntentHolds({});
          setIntentsReady(true);
          return {};
        }
        throw new Error('Eroare la încărcarea intentelor');
      }

      const rows = await res.json();
      if (!Array.isArray(rows)) {
        setIntentHolds({});
        setIntentsReady(true);
        return {};
      }

      const normalized = rows.reduce((acc, row) => {
        const seatId = Number(row?.seat_id);
        if (!Number.isFinite(seatId)) return acc;
        acc[seatId] = {
          expires_at: row.expires_at || null,
          isMine: row.is_mine === 1,
          holder_name: row.holder_name || null,
          holder_agency_id: row.holder_agency_id ?? null,
        };

        return acc;
      }, {});

      setIntentHolds(normalized);
      intentsRef.current = normalized; // (ok că ai deja și useEffect, dar aici ajută imediat)
      setIntentsReady(true);

      // ✅ RECONSTRUIM selecția după refresh dacă avem intent-uri "isMine"
      const mySeatIds = Object.keys(normalized)
        .filter((k) => normalized?.[k]?.isMine)
        .map((k) => Number(k))
        .filter(Number.isFinite);

      const currentSelected = Array.isArray(selectedSeatsRef.current) ? selectedSeatsRef.current : [];

      if (mySeatIds.length > 0 && currentSelected.length === 0) {
        const seatsToSelect = Array.isArray(seats)
          ? seats.filter((s) => mySeatIds.includes(Number(s.id)))
          : [];

        if (seatsToSelect.length > 0) {
          setSelectedSeats(seatsToSelect);

          const stopNames = Array.isArray(routeStations) ? routeStations.map(s => s.name) : [];
          const defaultBoard = stopNames[0] || '';
          const defaultExit = stopNames[stopNames.length - 1] || '';

          setPassengersData((prev) => {
            const next = { ...(prev || {}) };
            seatsToSelect.forEach((seat) => {
              const seatId = seat?.id;
              if (!seatId) return;
              if (next[seatId]) return; // nu suprascriem dacă există deja
              next[seatId] = {
                name: '',
                phone: '',
                board_at: defaultBoard,
                exit_at: defaultExit,
                observations: '',
                payment_method: 'none',
                origin: 'manual',
              };
            });
            return next;
          });
        }
      }

      return normalized;

    } catch (err) {
      console.error('Eroare la refresh intent', err);
      setIntentHolds({});
      intentsRef.current = {};
      setIntentsReady(true);
      return {};
    }

  }, [tripId, seats, routeStations, setSelectedSeats, setPassengersData]);


  useEffect(() => {
    // oprim polling-ul vechi (dacă există)
    if (intentPollTimerRef.current) {
      clearInterval(intentPollTimerRef.current);
      intentPollTimerRef.current = null;
    }

    // închidem socket-ul vechi (dacă există)
    if (intentsSocketRef.current) {
      try { intentsSocketRef.current.disconnect(); } catch { }
      intentsSocketRef.current = null;
    }

    setIntentsReady(false);

    if (!tripId) {
      setIntentHolds({});
      intentsRef.current = {};
      return;
    }

    // 1) încărcare inițială intents
    refreshIntentsRef.current?.();


    // 2) conectare la namespace /intents
    const API_BASE = import.meta.env.VITE_API_URL ?? "";
    const socket = io((API_BASE || window.location.origin) + "/intents", {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    intentsSocketRef.current = socket;

    // 3) intrăm în room-ul trip-ului la connect (și la reconectare)
    const onConnect = () => {
      socket.emit("intents:watch", { tripId });
    };

    // 4) la update refacem refresh la intents
    const onUpdate = (payload = {}) => {
      // dacă serverul trimite tripId în payload, ignorăm update-urile pentru alt trip
      if (payload.tripId && Number(payload.tripId) !== Number(tripId)) return;
      refreshIntentsRef.current?.();

    };

    socket.on("connect", onConnect);
    socket.on("intents:update", onUpdate);

    if (socket.connected) onConnect();


    const onTripUpdate = (payload = {}) => {
      if (payload.tripId && Number(payload.tripId) !== Number(tripId)) return;
      fetchCurrentSeatMapRef.current?.({ force: true });
    };

    socket.on("trip:update", onTripUpdate);



    return () => {
      try { socket.emit("intents:unwatch", { tripId }); } catch { }

      try {
        socket.off("connect", onConnect);
        socket.off("intents:update", onUpdate);
        socket.off("trip:update", onTripUpdate);

        socket.disconnect();
      } catch { }

      intentsSocketRef.current = null;
    };
  }, [tripId]);


  ;

  useEffect(() => {
    const cleanupTripId = tripId;

    const releaseMine = () => {
      if (!cleanupTripId) return;
      const entries = Object.entries(intentsRef.current || {}).filter(([, info]) => info?.isMine);
      if (!entries.length) return;

      entries.forEach(([seatId]) => {
        fetch(`/api/intents/${cleanupTripId}/${seatId}`, {
          method: 'DELETE',
          credentials: 'include',
          keepalive: true, // ✅ foarte important pentru refresh/close tab
        }).catch(() => { });
      });
    };

    // ✅ prinde refresh / închidere tab
    window.addEventListener('pagehide', releaseMine);

    return () => {
      window.removeEventListener('pagehide', releaseMine);
      // fallback (în caz că se demontează componenta normal)
      releaseMine();
    };
  }, [tripId]);


  const ensureSeatsOwnedByMe = useCallback(async () => {
    if (!tripId || selectedSeats.length === 0) {
      return true;
    }

    const latest = await refreshIntents();
    const currentIntents = latest && typeof latest === 'object' ? latest : intentsRef.current || {};
    const conflictingIds = new Set();

    Object.entries(currentIntents).forEach(([key, info]) => {
      const seatId = Number(key);
      if (!Number.isFinite(seatId)) return;
      if (info?.isMine === false && selectedSeats.some((seat) => seat.id === seatId)) {
        conflictingIds.add(seatId);
      }
    });

    if (conflictingIds.size === 0) {
      return true;
    }

    setSelectedSeats((prev) => prev.filter((seat) => !conflictingIds.has(seat.id)));
    setPassengersData((prev) => {
      const next = { ...prev };
      conflictingIds.forEach((seatId) => {
        delete next[seatId];
      });
      return next;
    });

    showToast(
      'Unele locuri sunt în curs de rezervare de alt agent și au fost scoase din selecție.',
      'error',
      4000
    );

    return false;
  }, [tripId, selectedSeats, refreshIntents]);

  const createIdempotencyKey = () => {
    if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `res-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const hydrateSeatPayload = useCallback(
    (payload) => {
      if (!Array.isArray(payload)) return payload;

      return payload.map((item) => {
        if (item && Array.isArray(item.seats)) {
          return { ...item, seats: hydrateSeatPayload(item.seats) };
        }

        if (!item || typeof item !== 'object') {
          return item;
        }

        const passengers = Array.isArray(item.passengers)
          ? item.passengers.map((p) => {
            const numericVersion = Number.isFinite(Number(p?.version))
              ? Number(p.version)
              : null;
            return {
              ...p,
              version: numericVersion,
              board_at: p.board_at ?? getStationNameById(p.board_station_id),
              exit_at: p.exit_at ?? getStationNameById(p.exit_station_id),
            };
          })
          : [];

        return { ...item, passengers };
      });
    },
    [getStationNameById]
  );

  const handleConflictInfoUpdate = useCallback(
    (infos) => {
      const enriched = Array.isArray(infos)
        ? infos.map((info) => ({
          ...info,
          board_at: getStationNameById(info.board_station_id),
          exit_at: getStationNameById(info.exit_station_id),
        }))
        : [];
      setConflictInfo(enriched);
    },
    [getStationNameById]
  );
  const autoSelectEnabled = false;
  // 🧭 Toate locurile disponibile pentru vehiculul curent

  const isGridViewActive = seatViewMode === 'grid';
  const exportButtonsDisabled = !isGridViewActive || seats.length === 0 || isExportingSeatMap;
  // 🛣️ Lista rutelor disponibile din baza de date
  const [routesList, setRoutesList] = useState([]);

  // 💡 Protecție la comutare de rută și pentru oprirea fetch-urilor vechi
  const [isSwitchingRoute, setIsSwitchingRoute] = useState(false);
  const fetchAbortRef = useRef(null);


  // împiedică requesturi duplicate 1:1 pentru același set de parametri
  const lastSeatsFetchKeyRef = useRef(null);
  const lastTvSeatsFetchKeyRef = useRef(null);

  // Ținem minte ultima dată (yyyy-MM-dd) pentru resetări corecte
  const lastDateRef = useRef(format(new Date(), 'yyyy-MM-dd'));
  // 💾 Indicator pentru afișarea spinner-ului la salvare
  const [isSaving, setIsSaving] = useState(false);
  const [shake, setShake] = useState(false); // efect vizual la erori
  // ✅ Mesaj de confirmare sau eroare la salvare
  const [saveMessage, setSaveMessage] = useState('');
  // ✏️ Control pentru afișarea/ascunderea observațiilor per loc
  const [notesVisibility, setNotesVisibility] = useState({});
  // ⚙️ Control pentru dimensiunile locurilor în modul lat
  const [wideSeatSize, setWideSeatSize] = useState({ width: 260, height: 150 });
  // 📝 Afișare observații direct pe diagramă
  const [showSeatObservations, setShowSeatObservations] = useState(false);



  // 🎛 Setări text pentru SeatMap (nume, telefon, traseu, observații)

  // Vedere îngustă (normală)
  const [seatTextSizeNarrow, setSeatTextSizeNarrow] = useState(11);
  const [seatTextColorNarrow, setSeatTextColorNarrow] = useState('#ffffff');

  // Vedere largă
  const [seatTextSizeWide, setSeatTextSizeWide] = useState(11);
  const [seatTextColorWide, setSeatTextColorWide] = useState('#ffffff');

  const [showSeatTextSettings, setShowSeatTextSettings] = useState(false); // popup Text


  // 🔄 Încărcăm preferințele utilizatorului din backend (user_preferences.prefs_json)
  useEffect(() => {
    let cancelled = false;

    const loadUserPrefs = async () => {
      try {
        const res = await fetch('/api/user/preferences', { credentials: 'include' });
        if (!res.ok) {
          console.warn('Nu pot încărca /api/user/preferences:', res.status);
          setUserPrefsLoaded(true);
          return;
        }

        const json = await res.json();
        if (cancelled || !json || typeof json !== 'object') {
          setUserPrefsLoaded(true);
          return;
        }

        setUserPreferences(json);

        const seatmap = json.seatmap && typeof json.seatmap === 'object' ? json.seatmap : {};
        const narrow = seatmap.narrow && typeof seatmap.narrow === 'object' ? seatmap.narrow : {};
        const wide = seatmap.wide && typeof seatmap.wide === 'object' ? seatmap.wide : {};

        // 🔹 Vedere îngustă
        if (typeof narrow.textSize === 'number') {
          setSeatTextSizeNarrow(narrow.textSize);
        }
        if (typeof narrow.textColor === 'string') {
          setSeatTextColorNarrow(narrow.textColor);
        }

        // 🔹 Vedere largă
        if (typeof wide.textSize === 'number') {
          setSeatTextSizeWide(wide.textSize);
        }
        if (typeof wide.textColor === 'string') {
          setSeatTextColorWide(wide.textColor);
        }
        if (typeof wide.width === 'number' || typeof wide.height === 'number') {
          setWideSeatSize(prev => ({
            width: typeof wide.width === 'number' ? wide.width : prev.width,
            height: typeof wide.height === 'number' ? wide.height : prev.height,
          }));
        }

        setUserPrefsLoaded(true);
      } catch (err) {
        console.error('Eroare la încărcarea preferințelor utilizatorului:', err);
        setUserPrefsLoaded(true);
      }
    };

    loadUserPrefs();
    return () => {
      cancelled = true;
    };
  }, []);



  // 💾 Helper: actualizează doar zona seatmap din prefs_json și trimite PUT la /api/user/preferences
  const persistSeatmapPrefs = useCallback((partialSeatmap) => {
    setUserPreferences(prev => {
      const base = prev && typeof prev === 'object' ? prev : {};
      const prevSeatmap = base.seatmap && typeof base.seatmap === 'object' ? base.seatmap : {};

      const nextSeatmap = { ...prevSeatmap };

      if (partialSeatmap.narrow) {
        nextSeatmap.narrow = {
          ...(prevSeatmap.narrow || {}),
          ...partialSeatmap.narrow,
        };
      }

      if (partialSeatmap.wide) {
        nextSeatmap.wide = {
          ...(prevSeatmap.wide || {}),
          ...partialSeatmap.wide,
        };
      }

      const next = { ...base, seatmap: nextSeatmap };

      // fire-and-forget
      fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(next),
      }).catch(err => {
        console.error('Eroare la salvarea /api/user/preferences:', err);
      });

      return next;
    });
  }, []);

  // Salvează automat setările pentru vedere îngustă (text + culoare)
  useEffect(() => {
    if (!userPrefsLoaded) return;
    persistSeatmapPrefs({
      narrow: {
        textSize: seatTextSizeNarrow,
        textColor: seatTextColorNarrow,
      },
    });
  }, [seatTextSizeNarrow, seatTextColorNarrow, userPrefsLoaded, persistSeatmapPrefs]);

  // Salvează automat setările pentru vedere largă (text + culoare + dimensiuni loc)
  useEffect(() => {
    if (!userPrefsLoaded) return;
    persistSeatmapPrefs({
      wide: {
        textSize: seatTextSizeWide,
        textColor: seatTextColorWide,
        width: wideSeatSize.width,
        height: wideSeatSize.height,
      },
    });
  }, [
    seatTextSizeWide,
    seatTextColorWide,
    wideSeatSize.width,
    wideSeatSize.height,
    userPrefsLoaded,
    persistSeatmapPrefs,
  ]);




  // valori efective în funcție de vedere (îngustă / largă)
  const effectiveSeatTextSize = isWideView ? seatTextSizeWide : seatTextSizeNarrow;
  const effectiveSeatTextColor = isWideView ? seatTextColorWide : seatTextColorNarrow;

  const handleSeatTextSizeChange = (value) => {
    if (isWideView) {
      setSeatTextSizeWide(value);
    } else {
      setSeatTextSizeNarrow(value);
    }
  };

  const handleSeatTextColorChange = (value) => {
    if (isWideView) {
      setSeatTextColorWide(value);
    } else {
      setSeatTextColorNarrow(value);
    }
  };


  useEffect(() => {
    refreshIntentsRef.current = refreshIntents;
  }, [refreshIntents]);




  // 🚐 Control pentru afișarea popup-ului de alegere vehicul
  const [showVehiclePopup, setShowVehiclePopup] = useState(false);
  // 🚌 Lista vehiculelor disponibile încărcată din backend
  const [availableVehicles, setAvailableVehicles] = useState([]);
  // ℹ️ Info despre vehiculul atribuit (nume și nr. înmatriculare)
  const [vehicleInfo, setVehicleInfo] = useState(null);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const tripDateTime = useMemo(() => {
    if (!selectedTrip?.date || !selectedTrip?.time) return null;
    const [year, month, day] = String(selectedTrip.date).split('-').map(Number);
    const timeParts = String(selectedTrip.time).split(':');
    const hours = Number(timeParts[0]);
    const minutes = Number(timeParts[1]);
    if (![year, month, day, hours, minutes].every((value) => Number.isFinite(value))) return null;
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }, [selectedTrip?.date, selectedTrip?.time]);
  const [moveSourceSeat, setMoveSourceSeat] = useState(null);
  const [paying, setPaying] = useState(false);
  const lastSelectedSeatIdsRef = useRef([]);

  useEffect(() => {
    intentsRef.current = intentHolds;
  }, [intentHolds]);

  useEffect(() => {
    if (seatViewMode !== 'grid' && isWideView) {
      setIsWideView(false);
    }
  }, [seatViewMode, isWideView]);

  useEffect(() => {
    if (seatViewMode !== 'grid' && showSeatTextSettings) {
      setShowSeatTextSettings(false);
    }
  }, [seatViewMode, showSeatTextSettings]);


  const adjustWideSeatSize = useCallback((dimension, delta) => {
    setWideSeatSize((prev) => {
      const limits = dimension === 'width'
        ? { min: 130, max: 360 }
        : { min: 100, max: 260 };
      const nextValue = Math.min(limits.max, Math.max(limits.min, prev[dimension] + delta));
      if (nextValue === prev[dimension]) return prev;
      return { ...prev, [dimension]: nextValue };
    });
  }, []);

  const [popupPassenger, setPopupPassenger] = useState(null);
  const [popupSeat, setPopupSeat] = useState(null);
  const [popupPosition, setPopupPosition] = useState(null);




  const [multiPassengerOptions, setMultiPassengerOptions] = useState(null);
  const [editingReservationId, setEditingReservationId] = useState(null);

  const [passengers, setPassengers] = useState([]);
  const [showMoveToOtherTrip, setShowMoveToOtherTrip] = useState(false);
  const [moveToOtherTripData, setMoveToOtherTripData] = useState(null);

  const drawSeatMapCanvas = useCallback((driverName = '', options = {}) => {
    if (!Array.isArray(seats) || seats.length === 0) {
      return null;
    }

    const {
      forceSeatWidth,
      forceSeatHeight,
      forceTextSize,
      forceTextColor,
      forceShowObservations = false,
      monochrome = false,
      includeDriverInHeader = false,
    } = options;

    const seatWidth = Number(forceSeatWidth) || (isWideView ? wideSeatSize.width : 150);
    const seatHeight = Number(forceSeatHeight) || (isWideView ? wideSeatSize.height : 130);
    const baseSeatTextSize = Number(forceTextSize) || Number(isWideView ? seatTextSizeWide : seatTextSizeNarrow) || 11;
    const seatTextColor = forceTextColor || (isWideView ? seatTextColorWide : seatTextColorNarrow) || '#ffffff';

    const nameFontPrimary = `600 ${baseSeatTextSize + 1}px "Inter", sans-serif`;
    const nameFontSecondary = `600 ${baseSeatTextSize + 1}px "Inter", sans-serif`;
    const lineFont = `${baseSeatTextSize}px "Inter", sans-serif`;
    const smallFont = `${Math.max(baseSeatTextSize - 1, 8)}px "Inter", sans-serif`;
    const italicFont = `italic ${baseSeatTextSize}px "Inter", sans-serif`;


    const seatGap = 5;
    const padding = 16;
    const seatPadding = 10;
    const maxCol = Math.max(...seats.map((s) => s.seat_col || 1));
    const maxRow = Math.max(...seats.map((s) => s.row || 0));
    const totalWidth = seatWidth * maxCol + seatGap * (maxCol - 1) + padding * 2;
    const headerHeight = 28; // spațiu pentru antet (data/ruta/sens/ora)
    const seatAreaTop = padding + headerHeight;

    const totalHeight =
      seatAreaTop + (seatHeight * (maxRow + 1)) + (seatGap * maxRow) + padding;

    const canvas = document.createElement('canvas');
    canvas.width = totalWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return null;
    }

    ctx.fillStyle = monochrome ? '#ffffff' : '#f3f4f6';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    // ── HEADER EXPORT (stânga sus)
    ctx.fillStyle = '#111827';
    ctx.font = '600 16px "Inter", sans-serif';
    ctx.textAlign = 'left';

    const headerPadding = 12;
    let headerY = headerPadding;

    // text: data, ruta, sens, ora
    const headerMain = `${format(selectedDate, 'dd.MM.yyyy')}, ${selectedRoute?.name || ''}, ${selectedSchedule?.direction?.toUpperCase() || ''} ${selectedSchedule?.departure || ''}`;
    ctx.fillText(headerMain, headerPadding, headerY);
    headerY += 20;

    if (includeDriverInHeader && driverName) {
      ctx.font = '500 14px "Inter", sans-serif';
      ctx.fillText(`Șofer: ${driverName}`, headerPadding, headerY);
      headerY += 18;
    }




    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    const selectedSeatIds = new Set(selectedSeats.map((seat) => seat.id));
    const textWidthLimit = seatWidth - seatPadding * 2;

    const clampText = (value, font) => {
      if (!value) return '';
      const ellipsis = '…';
      ctx.font = font;
      if (ctx.measureText(value).width <= textWidthLimit) {
        return value;
      }
      let truncated = value;
      while (truncated.length > 1 && ctx.measureText(truncated + ellipsis).width > textWidthLimit) {
        truncated = truncated.slice(0, -1);
      }
      return `${truncated}${ellipsis}`;
    };


    const drawRoundedRect = (context, x, y, width, height, radius = 12) => {
      const r = Math.min(radius, width / 2, height / 2);
      context.beginPath();
      context.moveTo(x + r, y);
      context.lineTo(x + width - r, y);
      context.quadraticCurveTo(x + width, y, x + width, y + r);
      context.lineTo(x + width, y + height - r);
      context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      context.lineTo(x + r, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - r);
      context.lineTo(x, y + r);
      context.quadraticCurveTo(x, y, x + r, y);
      context.closePath();
    };

    const baseColors = {
      driver: '#4b5563',
      full: '#dc2626',
      held: '#f97316',
      partial: '#eab308',
      selected: '#3b82f6',
      available: '#22c55e',
    };

    const getPaymentIcon = (passenger) => {
      if (passenger?.payment_status === 'paid') {
        if (passenger?.payment_method === 'cash') return '💵';
        if (passenger?.payment_method === 'card' && passenger?.booking_channel === 'online') return '🌐';
        if (passenger?.payment_method === 'card') return '💳';
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

    seats.forEach((seat) => {
      const col = (seat.seat_col || 1) - 1;
      const row = seat.row || 0;
      const x = padding + col * (seatWidth + seatGap);
      const y = seatAreaTop + row * (seatHeight + seatGap);
      const lowerLabel = (seat.label || '').toLowerCase();
      const isDriverSeat =
        lowerLabel.includes('șofer') ||
        lowerLabel.includes('sofer') ||
        seat.label === 'Șofer' ||
        seat.seat_type === 'driver';
      const isServiceSeat =
        isDriverSeat ||
        lowerLabel.includes('ghid') ||
        seat.label === 'Ghid' ||
        seat.seat_type === 'guide';
      const status = seat.status;
      const holdInfo = intentHolds?.[seat.id];
      const heldByOther = holdInfo?.isMine === false;
      const heldByMe = holdInfo?.isMine === true;
      const isSelected = selectedSeatIds.has(seat.id);
      const isMoveSource = moveSourceSeat?.id === seat.id;

      let fillColor = baseColors.available;
      if (monochrome) {
        fillColor = '#ffffff';
      } else if (isServiceSeat) {
        fillColor = baseColors.driver;
      } else if (status === 'full') {
        fillColor = baseColors.full;
      } else if (heldByOther) {
        fillColor = baseColors.held;
      } else if (status === 'partial') {
        fillColor = baseColors.partial;
      } else if (isSelected || heldByMe) {
        fillColor = baseColors.selected;
      }

      drawRoundedRect(ctx, x, y, seatWidth, seatHeight, 18);
      ctx.fillStyle = fillColor;
      ctx.fill();

      if (isSelected || isMoveSource || monochrome) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = monochrome ? '#000000' : isMoveSource ? '#facc15' : '#fef3c7';
        ctx.stroke();
      }

      ctx.save();
      ctx.fillStyle = monochrome ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.18)';
      ctx.font = '800 64px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(seat.label || '', x + seatWidth / 2, y + seatHeight / 2);
      ctx.restore();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const activePassengers = (seat.passengers || []).filter((p) => !p.status || p.status === 'active');
      const primaryPassenger = activePassengers[0];
      const driverSubtitle = null; // nu afisam "Șofer" la export

      const textLeftX = x + seatPadding;
      const textRightX = x + seatWidth - seatPadding;
      let textY = y + seatPadding;

      const writeRight = (text, font = lineFont) => {
        if (!text) return;
        const value = clampText(String(text), font);
        ctx.font = font;
        ctx.fillStyle = seatTextColor;
        ctx.textAlign = 'right';
        ctx.fillText(value, textRightX, textY);
        ctx.textAlign = 'left';
        textY += baseSeatTextSize + 4;
      };

      const writeObservation = (text) => {
        if (!(forceShowObservations || showSeatObservations) || !text) return;
        const lines = String(text).split(/\r?\n/);
        ctx.fillStyle = seatTextColor;
        ctx.font = smallFont;
        ctx.textAlign = 'right';
        lines.forEach((line, idx) => {
          const prefix = idx === 0 ? '📝 ' : '   ';
          const value = clampText(`${prefix}${line}`, smallFont);
          ctx.fillText(value, textRightX, textY);
          textY += baseSeatTextSize + 2;
        });
        ctx.textAlign = 'left';
      };

      if (primaryPassenger) {
        ctx.font = lineFont;
        ctx.fillStyle = seatTextColor;
        ctx.fillText(getPaymentIcon(primaryPassenger), textLeftX, textY);
        ctx.textAlign = 'right';
        ctx.font = nameFontPrimary;
        ctx.fillText(
          clampText(primaryPassenger.name || '(fără nume)', nameFontPrimary),
          textRightX,
          textY
        );
        ctx.textAlign = 'left';
        textY += baseSeatTextSize + 4;
      }

      // daca e locul de sofer, afisam numele soferului direct in casuta lui
      if (isDriverSeat && driverName) {
        writeRight(driverName, nameFontPrimary);
      }


      const renderPassengerDetails = (passenger) => {
        if (passenger?.phone) {
          writeRight(passenger.phone, lineFont);
        }

        const amountValue =
          typeof passenger.amount === 'number'
            ? passenger.amount
            : typeof passenger.price === 'number'
              ? passenger.price
              : typeof passenger.price_value === 'number'
                ? passenger.price_value
                : typeof passenger.total_price === 'number'
                  ? passenger.total_price
                  : Number(passenger.amount ?? passenger.price ?? passenger.price_value ?? passenger.total_price);
        const amountLabel = formatAmount(amountValue) || '-';

        ctx.font = lineFont;
        ctx.fillStyle = seatTextColor;
        ctx.fillText(clampText(amountLabel, lineFont), textLeftX, textY);
        ctx.font = italicFont;
        ctx.textAlign = 'right';
        ctx.fillText(`${passenger.board_at} → ${passenger.exit_at}`, textRightX, textY);
        ctx.textAlign = 'left';
        textY += baseSeatTextSize + 4;
        writeObservation(passenger.observations);
      };

      if (primaryPassenger) {
        renderPassengerDetails(primaryPassenger);
      }

      if (activePassengers.length > 1) {
        textY += 4;
        activePassengers.slice(1).forEach((passenger) => {
          ctx.font = lineFont;
          ctx.fillStyle = seatTextColor;
          ctx.fillText(getPaymentIcon(passenger), textLeftX, textY);
          ctx.textAlign = 'right';
          ctx.font = nameFontSecondary;
          ctx.fillText(clampText(passenger.name || '(fără nume)', nameFontSecondary), textRightX, textY);
          ctx.textAlign = 'left';
          textY += baseSeatTextSize + 4;
          renderPassengerDetails(passenger);
        });
      }

      if (heldByOther && !monochrome) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x, y, seatWidth, seatHeight);
        ctx.fillStyle = '#ffffff';
        ctx.font = '600 12px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Rezervare în curs', x + seatWidth / 2, y + seatHeight / 2 - 6);
        ctx.textAlign = 'left';
      }
    });

    return canvas;
  }, [
    intentHolds,
    isWideView,
    moveSourceSeat,
    seats,
    selectedSeats,
    showSeatObservations,
    wideSeatSize,
    seatTextSizeNarrow,
    seatTextSizeWide,
    seatTextColorNarrow,
    seatTextColorWide,
  ]);

  const handleSeatMapExport = useCallback(
    async (driverName = '') => {
      if (seatViewMode !== 'grid') {
        showToast('Exportul este disponibil doar în diagrama clasică.', 'warning', 2500);
        return;
      }

      if (!seatMapRef.current || !Array.isArray(seats) || seats.length === 0) {
        showToast('Nu există o diagramă disponibilă pentru export.', 'error', 2500);
        return;
      }

      try {
        setIsExportingSeatMap(true);
        const canvas = drawSeatMapCanvas(driverName);
        if (!canvas) {
          throw new Error('Canvas indisponibil');
        }

        const baseName = vehicleInfo?.name ? `diagrama-${vehicleInfo.name}` : 'diagrama';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `${baseName}-${timestamp}.png`;
        const imageUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error('Export SeatMap error', err);

        showToast('Exportul a eșuat. Încearcă din nou.', 'error', 2500);
      } finally {
        setIsExportingSeatMap(false);
      }
    },
    [drawSeatMapCanvas, seatMapRef, seatViewMode, seats, setToastMessage, setToastType, vehicleInfo]
  );

  const handleSeatMapPrint = useCallback(
    async (driverName = '') => {
      if (seatViewMode !== 'grid') {
        showToast('Tipărirea este disponibilă doar în diagrama clasică.', 'warning', 2500);
        return;
      }

      if (!seatMapRef.current || !Array.isArray(seats) || seats.length === 0) {
        showToast('Nu există o diagramă disponibilă pentru tipărire.', 'error', 2500);
        return;
      }

      try {
        setIsExportingSeatMap(true);
        const maxCol = Math.max(...seats.map((seat) => seat.seat_col || 1));
        const maxRow = Math.max(...seats.map((seat) => seat.row || 0));

        const mmToPx = 96 / 25.4;
        const pageMarginMm = 6;
        const printableWidth = (210 - pageMarginMm * 2) * mmToPx;
        const printableHeight = (297 - pageMarginMm * 2) * mmToPx;

        const seatGap = 5;
        const padding = 16;
        const headerHeight = 28;

        const widthBudget = printableWidth - (seatGap * (maxCol - 1)) - (padding * 2);
        const heightBudget = printableHeight - (seatGap * maxRow) - (padding * 2) - headerHeight;

        const fittedSeatWidth = widthBudget / maxCol;
        const fittedSeatHeight = heightBudget / (maxRow + 1);

        const computedSeatHeight = Math.max(34, Math.min(100, Math.floor(fittedSeatHeight)));
        const computedSeatWidth = Math.max(
          58,
          Math.min(195, Math.floor(Math.min(fittedSeatWidth, computedSeatHeight * 1.9)))
        );
        const computedTextSize = Math.max(8, Math.min(15, Math.floor(computedSeatHeight * 0.17)));

        const canvas = drawSeatMapCanvas(driverName, {
          forceSeatWidth: computedSeatWidth,
          forceSeatHeight: computedSeatHeight,
          forceTextSize: computedTextSize,
          forceTextColor: '#000000',
          forceShowObservations: true,
          monochrome: true,
          includeDriverInHeader: true,
        });

        if (!canvas) {
          throw new Error('Canvas indisponibil');
        }

        const imageUrl = canvas.toDataURL('image/png');
        const printWindow = window.open('', '_blank', 'width=1200,height=900');
        if (!printWindow) {
          showToast('Popup blocat. Permite popup-urile pentru a tipări diagrama. În Microsoft Edge: click pe iconița popup blocat din bara de adrese → Always allow pop-ups from this site → Done.', 'warning', 9000);
          return;
        }

        // Edge poate deschide tab-ul dar să returneze un handle limitat când fereastra e creată cu
        // politici restrictive; dacă nu putem accesa documentul, tratăm explicit ca popup blocat.
        if (!printWindow.document) {
          showToast('Popup blocat. Permite popup-urile pentru a tipări diagrama. În Microsoft Edge: click pe iconița popup blocat din bara de adrese → Always allow pop-ups from this site → Done.', 'warning', 9000);
          return;
        }

        const title = 'Diagramă pentru tipărire';
        printWindow.document.write(`<!doctype html>
          <html>
            <head>
              <meta charset="utf-8" />
              <title>${title}</title>
              <style>
                @page { size: A4 portrait; margin: ${pageMarginMm}mm; }
                html, body {
                  width: 100%;
                  height: 100%;
                  margin: 0;
                  padding: 0;
                }
                body {
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                img {
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
                  page-break-inside: avoid;
                }
              </style>
            </head>
            <body>
              <img src="${imageUrl}" alt="${title}" />
              <script>
                window.onload = function () {
                  window.focus();
                  window.print();
                };
              <\/script>
            </body>
          </html>`);
        printWindow.document.close();
      } catch (err) {
        console.error('Print SeatMap error', err);
        showToast('Tipărirea a eșuat. Încearcă din nou.', 'error', 2500);
      } finally {
        setIsExportingSeatMap(false);
      }
    },
    [drawSeatMapCanvas, seatMapRef, seatViewMode, seats]
  );





  const [tripVehicles, setTripVehicles] = useState([]);
  const [activeTv, setActiveTv] = useState(null);
  const [showAddVeh, setShowAddVeh] = useState(false);
  const [confirmTvToDelete, setConfirmTvToDelete] = useState(null);
  const [driverAssignments, setDriverAssignments] = useState([]);

  const driverAssignmentsByTripVehicle = useMemo(() => {
    const map = new Map();
    driverAssignments.forEach((assignment) => {
      const id = Number(assignment?.trip_vehicle_id);
      if (Number.isFinite(id)) {
        map.set(id, assignment?.employee_name || '');
      }
    });
    return map;
  }, [driverAssignments]);

  const activeTripVehicleId = useMemo(() => {
    if (!Array.isArray(tripVehicles) || tripVehicles.length === 0) {
      return null;
    }
    if (activeTv === 'main') {
      return tripVehicles.find((tv) => tv.is_primary)?.trip_vehicle_id ?? null;
    }
    if (activeTv == null) {
      return null;
    }
    const numericId = Number(activeTv);
    if (!Number.isFinite(numericId)) {
      return null;
    }
    const match = tripVehicles.find((tv) => tv.trip_vehicle_id === numericId);
    return match?.trip_vehicle_id ?? null;
  }, [activeTv, tripVehicles]);

  const currentDriverName = activeTripVehicleId
    ? driverAssignmentsByTripVehicle.get(activeTripVehicleId) || ''
    : '';

  const activeTripVehicle = useMemo(() => {
    if (!Array.isArray(tripVehicles) || tripVehicles.length === 0) {
      return null;
    }

    if (activeTv === 'main') {
      return tripVehicles.find((tv) => tv.is_primary) ?? null;
    }

    const numericId = Number(activeTv);
    if (!Number.isFinite(numericId)) {
      return null;
    }

    return tripVehicles.find((tv) => tv.trip_vehicle_id === numericId) ?? null;
  }, [activeTv, tripVehicles]);

  const boardingStarted = useMemo(() => {
    if (activeTripVehicle && activeTripVehicle.boarding_started != null) {
      return Boolean(activeTripVehicle.boarding_started);
    }

    const primaryTv = Array.isArray(tripVehicles)
      ? tripVehicles.find((tv) => tv.is_primary)
      : null;

    if (primaryTv && primaryTv.boarding_started != null) {
      return Boolean(primaryTv.boarding_started);
    }

    return Boolean(selectedTrip?.boarding_started);
  }, [activeTripVehicle, tripVehicles, selectedTrip]);

  const blockNewReservations =
    !!onlineSettingsLoaded &&
    !!onlineSettings?.blockPastReservations &&
    tripDateTime instanceof Date &&
    tripDateTime.getTime() < Date.now();

  const blockBannerMessage = useMemo(() => {
    if (blockNewReservations) {
      return 'Rezervările noi nu sunt disponibile pentru curse care au plecat deja.';
    }

    if (boardingStarted) {
      return 'Îmbarcarea a început pentru această cursă. Nu se mai pot face rezervări noi din aplicația internă.';
    }

    return null;
  }, [blockNewReservations, boardingStarted]);

  useEffect(() => {
    if (!tripId || !selectedDate || !selectedScheduleId) {
      setDriverAssignments([]);
      return;
    }

    const controller = new AbortController();
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const params = new URLSearchParams({ date: dateStr });
    const operatorId = selectedSchedule?.operatorId ?? null;
    if (operatorId) {
      params.set('operator_id', operatorId);
    }

    fetch(`/api/trip_assignments?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setDriverAssignments(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        console.error('Eroare la încărcarea asignărilor de șoferi', err);
        setDriverAssignments([]);
      });

    return () => controller.abort();
  }, [selectedDate, selectedScheduleId, selectedSchedule?.operatorId, tripId]);





  // ── Text personalizat pe bon (persistat local)
  const [receiptNote, setReceiptNote] = useState('');
  const [autoSelectPaused, setAutoSelectPaused] = useState(false);
  const autoSeatTargetRef = useRef(1);
  const [pendingAutoSuggestion, setPendingAutoSuggestion] = useState(null);

  useEffect(() => {
    let ignore = false;

    const fetchFiscalSettings = async () => {
      try {
        const res = await fetch('/api/fiscal-settings');
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (!ignore) {
          setReceiptNote(typeof data?.receipt_note === 'string' ? data.receipt_note : '');
        }
      } catch (err) {
        console.error('Eroare la citirea setărilor fiscale', err);
      }
    };

    fetchFiscalSettings();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    setAutoSelectPaused(false);
  }, [selectedRoute?.id, selectedScheduleId, selectedDate, stationsKey]);

  useEffect(() => {
    autoSeatTargetRef.current = 1;
  }, [selectedRoute?.id, selectedScheduleId, selectedDate, stationsKey]);

  useEffect(() => {
    const newSeatCount = selectedSeats.reduce((count, seat) => {
      const data = passengersData?.[seat.id];
      return data?.reservation_id ? count : count + 1;
    }, 0);

    if (newSeatCount > 0) {
      autoSeatTargetRef.current = newSeatCount;
    }
  }, [selectedSeats, passengersData]);

  // ── Fereastră de eroare la neemiterea bonului
  const [receiptErrorOpen, setReceiptErrorOpen] = useState(false);
  const [receiptErrorMsg, setReceiptErrorMsg] = useState('');



  // 🔍 statusul ultimei plăți (din tabela payments)
  const [lastPaymentStatus, setLastPaymentStatus] = useState(null);
  const paymentStatusTimerRef = useRef(null);


  // 🔒 LOCK GLOBAL UI cât timp există un job de plată în execuție (pe terminalul ăsta)
  const [globalPaymentLock, setGlobalPaymentLock] = useState(false);



  // pornește polling către /payments/status pentru o rezervare
  const startPaymentStatusPolling = useCallback(
    (reservationId) => {
      if (!reservationId) return;
      setGlobalPaymentLock(true);


      // oprim orice polling vechi
      if (paymentStatusTimerRef.current) {
        clearInterval(paymentStatusTimerRef.current);
        paymentStatusTimerRef.current = null;
      }

      const fetchOnce = async () => {
        try {
          const r = await fetch(
            `/api/reservations/${reservationId}/payments/status`,
            { credentials: 'include', cache: 'no-store' },
          );

          const data = await r.json().catch(() => ({}));

          if (r.status === 304) {
            // nu s-a schimbat nimic; nu e eroare
            return;
          }


          if (!r.ok) {
            console.error('[payments/status] eroare:', data);
            return;
          }

          const p = data?.payment || null;
          const lastJob = data?.last_job || null;

          setLastPaymentStatus(p);

          if (!p) {
            // încă nu există payment în DB, continuăm să poll-uim
            return;
          }





          const status = p.status;
          const receiptStatus = p.receipt_status;
          const methodLabel =
            p.payment_method === 'card'
              ? 'cu cardul'
              : p.payment_method === 'cash'
                ? 'cash'
                : 'necunoscută';
          const amountStr =
            typeof p.amount === 'number' ? `${p.amount.toFixed(2)} RON` : '';
          const errorMsg = lastJob?.error_message || '';

          if (lastJob?.status === 'error') {
            // oprim polling-ul
            if (paymentStatusTimerRef.current) {
              clearInterval(paymentStatusTimerRef.current);
              setGlobalPaymentLock(false);

              paymentStatusTimerRef.current = null;
            }

            const isRefundJob = lastJob?.job_type === 'card_refund';
            const msgFinal = [
              isRefundJob
                ? `Refund ${methodLabel} ${amountStr} a eșuat.`
                : `Plata ${methodLabel} ${amountStr} a eșuat.`,
              errorMsg ? `Eroare: ${errorMsg}` : 'Eroare necunoscută.',
            ]
              .filter(Boolean)
              .join('\n');

            showToast(msgFinal, 'error', 10000);

            // 🔄 reîncărcăm seat-map ca să se actualizeze iconițele de plata imediat
            if (fetchCurrentSeatMapRef.current) {
              fetchCurrentSeatMapRef.current({ force: true });
            }


            return;
          }



          const jobType = lastJob?.job_type || null;
          const jobStatus = lastJob?.status || null;

          const isRefundJob = jobType === 'card_refund';
          const isJobRunning = jobStatus === 'queued' || jobStatus === 'in_progress';

          // ✅ Final corect:
          // - pentru refund: așteptăm status=refunded (sau job error)
          // - pentru plăți: final doar când status/receipt sunt într-o combinație stabilă
          const isFinal = isRefundJob
            ? (!isJobRunning && (status === 'refunded' || jobStatus === 'done' || jobStatus === 'error'))
            : (
              (status === 'paid' && receiptStatus === 'ok') ||
              status === 'failed' ||
              status === 'voided' ||
              (status === 'pos_ok_waiting_receipt' && receiptStatus === 'error_needs_retry') ||
              status === 'refunded'
            );


          if (isFinal) {
            // oprim polling-ul
            if (paymentStatusTimerRef.current) {
              clearInterval(paymentStatusTimerRef.current);
              setGlobalPaymentLock(false);

              paymentStatusTimerRef.current = null;
            }

            // 🧾 TOAST FINAL – folosim doar showToast

            if (status === 'paid' && receiptStatus === 'ok') {
              // ✅ SUCCES – 10 secunde pe ecran
              showToast(
                `Plată ${methodLabel} ${amountStr} – finalizată ✅ (bon OK)`,
                'success',
                10000
              );
            } else if (status === 'refunded') {
              showToast(
                `Refund ${methodLabel} ${amountStr} – finalizat ✅`,
                'success',
                10000
              );
            } else if (status === 'failed') {
              const msgFinal = [
                `Plata ${methodLabel} ${amountStr} a eșuat.`,
                errorMsg ? `Eroare: ${errorMsg}` : '',
              ]
                .filter(Boolean)
                .join('\n');
              // ❌ EROARE – 10 secunde
              showToast(msgFinal, 'error', 10000);
            } else if (receiptStatus === 'error_needs_retry') {
              const msgFinal = [
                `POS OK ${amountStr}, dar bonul fiscal are eroare.`,
                'Este necesară reemiterea bonului (retry fiscal).',
              ].join('\n');
              // ⚠️ POS OK, bon cu eroare – 10 secunde
              showToast(msgFinal, 'warning', 10000);
            }

            // 🔄 reîncărcăm seat-map ca să se actualizeze iconițele de plata imediat
            if (fetchCurrentSeatMapRef.current) {
              fetchCurrentSeatMapRef.current({ force: true });
            }

          }
        } catch (err) {
          console.error('[payments/status] eroare la polling', err);
        }
      };

      // primul call imediat
      fetchOnce();
      // apoi poll la X ms (modifici valoarea 2000 după preferință)
      paymentStatusTimerRef.current = setInterval(fetchOnce, 1000);
    },
    [showToast],
  );






  // cleanup la unmount
  useEffect(() => {
    return () => {
      if (paymentStatusTimerRef.current) {
        clearInterval(paymentStatusTimerRef.current);
        paymentStatusTimerRef.current = null;
        setGlobalPaymentLock(false);

      }
    };
  }, []);




  // stocăm lista de conflicte (acum array) venit din backend
  const [conflictInfo, setConflictInfo] = useState([]);
  // control pentru ConfirmModal
  const [showConflictModal, setShowConflictModal] = useState(false);
  // în ReservationPage.jsx, înainte de JSX-ul modalului, adaugă:

  //Dacă conflictCount === 1 „Mai există 1 rezervare conflictuală (în aceeași zi):”
  //Dacă conflictCount > 1, va afișa: „Mai există 3 rezervări conflictuale (în aceeași zi):”
  const conflictCount = conflictInfo?.length ?? 0;
  const rezervareWord = conflictCount === 1
    ? 'rezervare conflictuală'
    : 'rezervări conflictuale';








  // Taburi masini
  const tabs = tripVehicles;


  //copiere datele primului pasager la ceilalti pasageri
  // Unde ai logica de copiere date pasager principal
  // After: use JSON deep‐clone so mutations don’t bleed through
  const handleCopyPassengerData = () => {
    if (selectedSeats.length < 2) return;
    const firstSeatId = selectedSeats[0].id;
    const firstPassenger = passengersData[firstSeatId];
    if (!firstPassenger) return;

    // 1) Copiem datele, DAR fără preț/price_list etc
    setPassengersData(prev => {
      const updated = { ...prev };
      const baseCopy = JSON.parse(JSON.stringify(firstPassenger));

      const {
        discount,
        discount_type_id,

        // ✅ scoatem orice “preț vechi”
        price,
        price_list_id,
        pricing_category_id,

        ...rest
      } = baseCopy;

      selectedSeats.slice(1).forEach(seat => {
        updated[seat.id] = {
          ...rest,
          discount_type_id: null,

          // ✅ opțional: curățăm explicit prețul din passengersData
          price: null,
          price_list_id: null,
        };
      });

      return updated;
    });

    // 2) ✅ Forțăm recalcularea prețului pentru celelalte locuri
    setPricePerSeat(prev => {
      const next = { ...prev };
      selectedSeats.slice(1).forEach(seat => {
        next[seat.id] = null; // important: useEffect vede null și reface fetchPrice
      });
      return next;
    });
  };




  const handleApplyPromo = async () => {
    const code = (promoCode || '').trim().toUpperCase();
    const baseTotal = getTotalWithoutPromo(); // ✅ fără promo (doar reduceri de tip)

    if (!code || baseTotal <= 0) {
      setPromoApplied(null);
      lastPromoApplyKeyRef.current = null;
      promoBaseTotalRef.current = null;
      setIsPromoValidating(false);
      return;
    }

    // ✅ anti-spam
    if (isPromoValidating) return;

    // ✅ cheie context (dacă e același context, nu re-aplicăm)
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const applyKey = `${code}|${selectedRoute?.id ?? 'r'}|${selectedScheduleId ?? 'sid'}|${selectedHour ?? 'h'}|${dateStr}|${bookingChannel}|${baseTotal}`;

    if (lastPromoApplyKeyRef.current === applyKey && promoApplied?.code === code) {
      return;
    }

    setIsPromoValidating(true);

    const body = {
      code,
      route_id: selectedRoute?.id || null,
      route_schedule_id: selectedScheduleId,
      date: dateStr,
      time: selectedHour,
      channel: bookingChannel,
      price_value: baseTotal,
      phone: (passengers?.[0]?.phone || '').trim() || null
    };

    try {
      const r = await fetch('/api/promo-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await r.json();

      if (data.valid) {
        setPromoApplied({
          promo_code_id: data.promo_code_id,
          code,
          discount_amount: data.discount_amount,
          combinable: !!data.combinable
        });

        lastPromoApplyKeyRef.current = applyKey;
        promoBaseTotalRef.current = baseTotal;



        showToast(`Cod aplicat: -${data.discount_amount} lei`, 'success', 2500);
      }
      else {
        setPromoApplied(null);
        lastPromoApplyKeyRef.current = null;
        promoBaseTotalRef.current = null;
        showToast('Cod invalid', 'error', 3000);
      }
    } catch (e) {
      setPromoApplied(null);
      lastPromoApplyKeyRef.current = null;
      promoBaseTotalRef.current = null;
      showToast('Eroare la validare cod', 'error', 3000);
    } finally {
      setIsPromoValidating(false);
    }
  };


  const handleRemovePromo = () => {
    setPromoApplied(null);
    lastPromoApplyKeyRef.current = null;
    promoBaseTotalRef.current = null;

    // ✅ ștergem codul din input DOAR la Sterge
    setPromoCode('');

    showToast('Cod promo eliminat', 'info', 2000);
  };








  //calcul automat afisare pret in functie de reducere
  function calculeazaPretCuReducere(pret, discount) {
    if (!pret || isNaN(pret)) return pret;
    switch (discount) {
      case "pensionar":
      case "copil":
        return pret / 2;
      case "veteran":
      case "das":
      case "vip":
        return 0;
      default:
        return pret;
    }
  }







  const [blacklistInfo, setBlacklistInfo] = useState(null);
  const [showBlacklistModal, setShowBlacklistModal] = useState(false);



  //loader sa apara intre schimbatul orelor
  const [isLoadingSeats, setIsLoadingSeats] = useState(false);






  const handleAddVehicle = () => {
    // momentan inactiv, se poate extinde
    setToastMessage('Funcționalitate neimplementată');
    setToastType('info');
    setTimeout(() => setToastMessage(''), 3000);
  };





  // reducerile valabile pentru ruta + oră
  const [routeDiscounts, setRouteDiscounts] = useState([]);
  //reduceri pe categorii
  const [pricingCategories, setPricingCategories] = useState([]);
  const [allowedPricingCategories, setAllowedPricingCategories] = useState(null);

  const effectivePricingCategories = useMemo(() => {
    if (Array.isArray(allowedPricingCategories) && allowedPricingCategories.length > 0) {
      return allowedPricingCategories;
    }
    return pricingCategories;
  }, [allowedPricingCategories, pricingCategories]);

  const defaultPricingCategoryId = effectivePricingCategories[0]?.id ?? null;




  // fetch reduceri de fiecare dată când ruta sau ora se schimbă
  useEffect(() => {
    if (!selectedRoute?.id) {
      setRouteDiscounts([]);
      return;
    }

    const params = new URLSearchParams();
    if (selectedScheduleId) {
      params.set('route_schedule_id', selectedScheduleId);
    } else {
      if (selectedHour) params.set('time', selectedHour);
      if (effectiveDirection) params.set('direction', effectiveDirection);
    }

    if (!params.has('route_schedule_id') && !params.has('time')) {
      setRouteDiscounts([]);
      return;
    }

    fetch(`/api/routes/${selectedRoute.id}/discounts?${params.toString()}`)
      .then(res => (res.ok ? res.json() : []))
      .then(setRouteDiscounts)
      .catch(() => setRouteDiscounts([]));

  }, [selectedRoute, selectedScheduleId, selectedHour, effectiveDirection]);

  useEffect(() => {
    if (!selectedRoute?.id) {
      setAllowedPricingCategories(null);
      return;
    }

    const params = new URLSearchParams();
    if (selectedScheduleId) {
      params.set('route_schedule_id', String(selectedScheduleId));
    } else {
      if (selectedHour) params.set('time', selectedHour);
      if (effectiveDirection) params.set('direction', effectiveDirection);
    }

    if (!params.toString()) {
      setAllowedPricingCategories(null);
      return;
    }

    const ac = new AbortController();
    fetch(`/api/routes/${selectedRoute.id}/pricing-categories?${params.toString()}`, { signal: ac.signal })
      .then(res => (res.ok ? res.json() : []))
      .then(data => {
        if (ac.signal.aborted) return;
        if (Array.isArray(data) && data.length > 0) {
          setAllowedPricingCategories(data);
        } else {
          setAllowedPricingCategories(null);
        }
      })
      .catch(err => {
        if (ac.signal.aborted) return;
        console.error('Eroare la fetch categorii pe programare', err);
        setAllowedPricingCategories(null);
      });

    return () => ac.abort();
  }, [selectedRoute, selectedScheduleId, selectedHour, effectiveDirection]);

  // --- Când se schimbă ruta, încarcă stațiile normalizate ---
  useEffect(() => {
    if (!selectedRoute?.id) { setRouteStations([]); return; }

    const params = new URLSearchParams();
    if (selectedScheduleId) {
      params.set('route_schedule_id', selectedScheduleId);
    } else if (effectiveDirection) {
      params.set('direction', effectiveDirection);
    }

    if (!params.toString()) {
      // nu avem încă direcția selectată => așteptăm până când utilizatorul alege
      //setRouteStations([]);
      return;
    }

    (async () => {
      try {


        const res = await fetch(`/api/routes/${selectedRoute.id}/stations?${params.toString()}`);
        if (!res.ok) {
          console.error("❌ Eroare la fetch /stations:", res.status);
          return;
        }

        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // sortăm corect
          data.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
          setRouteStations(data);
        } else {
          console.warn("⚠️ Răspuns gol pentru /stations, păstrăm lista veche");
          // atenție: nu mai chemăm setRouteStations([])!
        }
      } catch (err) {
        console.error('❌ Eroare la /api/routes/:id/stations', err);
        // păstrăm stațiile existente, nu le ștergem
      }
    })();
  }, [selectedRoute?.id, selectedScheduleId, effectiveDirection]);


  //fetch pret categorii
  useEffect(() => {
    fetch('/api/pricing-categories')
      .then(r => r.ok ? r.json() : [])
      .then(data => setPricingCategories(Array.isArray(data) ? data : []))
      .catch(() => setPricingCategories([]));
  }, []);

  useEffect(() => {
    if (!Array.isArray(effectivePricingCategories) || effectivePricingCategories.length === 0) {
      return;
    }

    const validIds = new Set(effectivePricingCategories.map(c => c.id));
    const updatedSeats = [];

    setPassengersData(prev => {
      let changed = false;
      const next = { ...prev };

      selectedSeats.forEach(seat => {
        const seatId = seat?.id;
        if (!seatId) return;
        const current = next[seatId]?.category_id ?? null;
        const fallbackId = effectivePricingCategories[0]?.id ?? null;
        const target = current != null && validIds.has(current) ? current : fallbackId;
        if (target != null && target !== current) {
          next[seatId] = { ...next[seatId], category_id: target };
          updatedSeats.push(seatId);
          changed = true;
        }
      });

      return changed ? next : prev;
    });

    if (updatedSeats.length) {
      setPricePerSeat(prev => {
        const next = { ...prev };
        updatedSeats.forEach(id => {
          next[id] = null;
        });
        return next;
      });
    }
  }, [effectivePricingCategories, selectedSeats, setPassengersData]);











  // Calculează totalul de plată pentru pasagerii selectați (aplică reducerile)
  const getTotalToPay = () => {
    let total = 0;
    selectedSeats.forEach(seat => {
      const price = pricePerSeat[seat.id];
      if (typeof price !== 'number') return;

      const discId = passengersData[seat.id]?.discount_type_id;
      const disc = routeDiscounts.find(d => d.id === discId);

      if (!disc) {
        total += price;
      } else {
        const v = parseFloat(disc.discount_value);
        let raw = disc.discount_type === 'percent'
          ? price * (1 - v / 100)
          : price - v;
        total += Math.max(raw, 0);
      }
    });
    // total final nu poate fi negativ
    let t = Number(Math.max(total, 0).toFixed(2));
    if (promoApplied?.discount_amount) {
      t = Math.max(0, +(t - Number(promoApplied.discount_amount)).toFixed(2));
    }
    return t;
  };



  // ✅ total fără promo (doar preț pe segment + reduceri de tip)
  const getTotalWithoutPromo = () => {
    let total = 0;

    selectedSeats.forEach(seat => {
      const price = pricePerSeat[seat.id];
      if (typeof price !== 'number') return;

      const discId = passengersData[seat.id]?.discount_type_id;
      const disc = routeDiscounts.find(d => d.id === discId);

      if (!disc) {
        total += price;
      } else {
        const v = parseFloat(disc.discount_value);
        const raw = disc.discount_type === 'percent'
          ? price * (1 - v / 100)
          : price - v;

        total += Math.max(raw, 0);
      }
    });

    return Number(Math.max(total, 0).toFixed(2));
  };

  // ✅ dacă se schimbă baza (stații / categorie / reducere etc.) după aplicarea promo, anulăm promo (trebuie reaplicat)
  useEffect(() => {
    if (!promoApplied) return;

    const nowBase = getTotalWithoutPromo();
    const oldBase = promoBaseTotalRef.current;

    if (typeof oldBase === 'number' && nowBase !== oldBase) {
      console.log('[PROMO] baza s-a schimbat după aplicare. Reset promo.', { oldBase, nowBase });
      setPromoApplied(null);
      lastPromoApplyKeyRef.current = null;
      promoBaseTotalRef.current = null;
      setIsPromoValidating(false);
    }
  }, [promoApplied, selectedSeats, passengersData, pricePerSeat, routeDiscounts]);




  const handlePaymentChange = (seatId, method) => {
    setPassengers((prev) =>
      prev.map((p) =>
        p.seat_id === seatId ? { ...p, payment_method: method } : p
      )
    );
  };







  // ✅ La schimbare rută: NU alegem oră. Oprimi orice request în zbor și curățăm starea sincron.
  const handleSelectRoute = (route, direction = null) => {
    setIsSwitchingRoute(true);

    setPromoApplied(null);
    setPromoCode('');
    setIsPromoValidating(false);
    lastPromoApplyKeyRef.current = null;
    promoBaseTotalRef.current = null;


    // oprește orice fetch vechi (ex: /api/trips/find, /api/seats)
    try { fetchAbortRef.current?.abort(); } catch { }
    fetchAbortRef.current = null;

    // resetăm instant dependențele de rută/oră
    setSelectedSchedule(null);
    setSeats([]);
    setVehicleInfo(null);
    setTripId(null);
    setSelectedTrip(null);
    setTripVehicles([]);
    setActiveTv(null);
    setSelectedSeats([]);
    setPassengersData({});
    setPricePerSeat({});

    // setăm noua rută (fără a porni încărcări)
    setSelectedRoute(route);

    const availableDirections = Array.isArray(route?.schedules)
      ? [...new Set(route.schedules.map((s) => s.direction || 'tur'))]
      : [];
    const resolvedDirection = direction
      || (availableDirections.includes('tur') ? 'tur' : availableDirections[0] || null);
    setSelectedDirection(resolvedDirection || null);

    // eliberăm blocarea după acest lot de setState-uri
    queueMicrotask(() => setIsSwitchingRoute(false));
  };

  const handleSelectSchedule = useCallback((schedule) => {
    const resetForNewSchedule = (showLoader = false) => {
      releaseHeldSeats();
      lastSelectedSeatIdsRef.current = [];
      selectedSeatsRef.current = [];
      try { fetchAbortRef.current?.abort(); } catch { }
      fetchAbortRef.current = null;
      setSelectedSeats([]);
      setPassengersData({});
      setPricePerSeat({});
      setIntentHolds({});
      intentsRef.current = {};
      setPassengers([]);
      setPromoApplied(null);
      setPromoCode('');
      setIsPromoValidating(false);
      lastPromoApplyKeyRef.current = null;
      promoBaseTotalRef.current = null;

      setSelectedTrip(null);
      setTripId(null);
      setSelectedPriceListId(null);
      setAutoSelectPaused(false);
      autoSeatTargetRef.current = 0;
      setSeats([]);
      setVehicleInfo(null);
      setTripVehicles([]);
      setActiveTv(null);
      setIsLoadingSeats(showLoader);
      setMoveSourceSeat(null);
      setPopupPassenger(null);
      setPopupSeat(null);
      setPopupPosition(null);
      setMultiPassengerOptions(null);
      setNotesVisibility({});
      previousSelectionKeyRef.current = null;
      lastSeatsFetchKeyRef.current = null;
      lastTvSeatsFetchKeyRef.current = null;
      if (showLoader) {
        setScheduleSelectionToken((prev) => prev + 1);
      }
    };

    if (!schedule) {
      resetForNewSchedule(false);
      setSelectedSchedule(null);
      return;
    }
    let resolved = schedule;
    if (typeof schedule === 'string') {
      resolved = selectedRoute?.schedules?.find((s) => s.departure === schedule) || null;
    }
    if (!resolved) {
      resetForNewSchedule(false);
      setSelectedSchedule(null);
      return;
    }
    resetForNewSchedule(true);
    setSelectedSchedule(resolved);
    //setSelectedDirection(resolved.direction || null);
    // direcția se ia din selectedSchedule.direction la calculul effectiveDirection
  }, [releaseHeldSeats, selectedRoute]);






  const handleTransactionChange = (seatId, value) => {
    setPassengers((prev) =>
      prev.map((p) =>
        p.seat_id === seatId ? { ...p, provider_transaction_id: value } : p
      )
    );
  };


  const fetchPrice = async (seatId, from, to) => {
    // cheie unică pentru combinația curentă
    const key = [
      seatId,
      from,
      to,
      selectedRoute?.id ?? 'r',
      selectedScheduleId ?? 'sid',
      selectedHour ?? 'h',
      selectedTrip?.id ?? 't'
    ].join('|');

    // dacă deja avem un request identic în zbor, ieșim
    if (inFlightPrice.current.has(key)) return;


    // fără oră, nu cerem preţ
    if (!selectedScheduleId || !selectedTrip) return;
    // dacă nu avem categorii încă, așteptăm
    if (effectivePricingCategories.length === 0) return;

    // preia categoria curentă pentru acest seat sau default prima categorie
    let categoryId = passengersData[seatId]?.category_id ?? null;
    if (categoryId != null && !effectivePricingCategories.some(c => c.id === categoryId)) {
      categoryId = null;
    }
    if (categoryId == null) {
      categoryId = defaultPricingCategoryId;
    }
    if (!from || !to || !selectedRoute?.id || categoryId == null) return;


    try {
      inFlightPrice.current.add(key);
      const fromId = getStationIdByName(from);
      const toId = getStationIdByName(to);
      if (fromId === null || toId === null) {
        setPricePerSeat(prev => ({ ...prev, [seatId]: 'N/A' }));
        inFlightPrice.current.delete(key);
        return;
      }

      const qs = new URLSearchParams({
        route_id: String(selectedRoute.id),
        from_station_id: String(fromId),
        to_station_id: String(toId),
        category: String(categoryId),
        date: format(selectedDate, 'yyyy-MM-dd')
      });
      if (selectedScheduleId) {
        qs.set('route_schedule_id', String(selectedScheduleId));
      }

      const res = await fetch(`/api/routes/price?${qs.toString()}`);

      if (!res.ok) {
        console.error('fetchPrice HTTP error', res.status);
        setPricePerSeat(prev => ({ ...prev, [seatId]: 'N/A' }));
        inFlightPrice.current.delete(key);
        return;
      }

      const { price, price_list_id, pricing_category_id } = await res.json();
      // Salvează preț și ID-uri pentru payload
      // ─── persistăm identificatorul listei şi la nivel global ───
      setSelectedPriceListId(curr => curr ?? price_list_id);

      setPassengersData(prev => ({
        ...prev,
        [seatId]: {
          ...prev[seatId],
          price: parseFloat(price),
          price_list_id,
          category_id: pricing_category_id
        }
      }));
      setPricePerSeat(prev => ({ ...prev, [seatId]: parseFloat(price) }));
    } catch (err) {
      console.error('Eroare la fetchPrice:', err);
      setPricePerSeat(prev => ({ ...prev, [seatId]: 'N/A' }));
    } finally {
      inFlightPrice.current.delete(key);
    }
  };




























  const isSeatFullyOccupiedViaSegments = (seat) => {
    const stops = routeStations.map(s => s.name);
    if (!seat.passengers || stops.length < 2) return false;

    const occupancy = Array(stops.length - 1).fill(false);
    const normalize = (s) => s.trim().toLowerCase();

    for (const p of seat.passengers) {
      const i = stops.findIndex((s) => normalize(s) === normalize(p.board_at));
      const j = stops.findIndex((s) => normalize(s) === normalize(p.exit_at));
      if (i !== -1 && j !== -1 && i < j) {
        for (let k = i; k < j; k++) {
          occupancy[k] = true;
        }
      }
    }

    return occupancy.every(Boolean);
  };


  const resetDefaultSeat = useCallback(() => {
    if (!autoSelectEnabled) return;
    if (autoSelectPaused) return;
    if (!intentsReady) return;
    if (selectedSeats.length > 0) return;
    if (!selectedScheduleId) return;
    if (!selectedRoute || !selectedDate || !seats.length) return;

    const stops = routeStations.map((s) => s.name).filter(Boolean);
    if (stops.length < 2) return;

    const board_at = stops[0];
    const exit_at = stops[stops.length - 1];
    const desiredCount = Math.max(1, autoSeatTargetRef.current || 1);

    const availableSeats = (seats || []).filter((seat) => {
      const hold = intentHolds?.[seat.id];
      return !hold || hold.isMine === true;
    });

    const pickedSeats = selectSeats(
      availableSeats,
      board_at,
      exit_at,
      stops,
      desiredCount,
    );

    if (!pickedSeats.length) return;

    setSelectedSeats(pickedSeats);
    setPassengersData(() => {
      const map = {};
      pickedSeats.forEach((seat) => {
        map[seat.id] = {
          name: '',
          phone: '',
          board_at,
          exit_at,
          observations: '',
          payment_method: 'none',
          origin: 'auto',
        };
      });
      return map;
    });

    pickedSeats.forEach((seat) => {
      fetchPrice(seat.id, board_at, exit_at);
    });

    autoSeatTargetRef.current = pickedSeats.length;
  }, [
    autoSelectPaused,
    intentsReady,
    selectedSeats.length,
    selectedScheduleId,
    selectedRoute,
    selectedDate,
    seats,
    routeStations,
    intentHolds,
    selectSeats,
    setSelectedSeats,
    setPassengersData,
    fetchPrice,
  ]);


  const handleMovePassenger = async (sourceSeat, targetSeat) => {
    const sourcePassenger = sourceSeat.passengers?.[0];
    if (!sourcePassenger || !tripId || !selectedScheduleId) return;

    const normalize = (s) => s.trim().toLowerCase();
    const stops = routeStations.map(s => s.name);

    const boardIndex = stops.findIndex((s) => normalize(s) === normalize(sourcePassenger.board_at));
    const exitIndex = stops.findIndex((s) => normalize(s) === normalize(sourcePassenger.exit_at));

    if (boardIndex === -1 || exitIndex === -1 || boardIndex >= exitIndex) return;

    const existingPassengers = targetSeat.passengers || [];
    const hasOverlap = existingPassengers.some((p) => {
      const pBoard = stops.findIndex((s) => normalize(s) === normalize(p.board_at));
      const pExit = stops.findIndex((s) => normalize(s) === normalize(p.exit_at));
      return !(exitIndex <= pBoard || boardIndex >= pExit);
    });

    if (hasOverlap) return;

    try {
      const res = await fetch('/api/reservations/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reservation_id: sourcePassenger.reservation_id,
          trip_id: tripId,
          to_seat_id: targetSeat.id,
          board_station_id: sourcePassenger.board_station_id ?? null,
          exit_station_id: sourcePassenger.exit_station_id ?? null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 423) {
        showToast(data?.error || 'Există o tranzacție în curs. Așteaptă finalizarea.', 'warning', 10000);
        return;
      }

      if (!res.ok) {
        showToast(data?.error || `Eroare la mutare (HTTP ${res.status})`, 'error', 8000);
        return;
      }


      // determină ce vehicul e activ (principal sau dublură)
      const tv = tripVehicles.find(tv => tv.trip_vehicle_id === activeTv);
      const vehicleId = tv ? tv.vehicle_id : selectedTrip.vehicle_id;
      const firstStopId = getStationIdByName(stops[0]);
      const lastStopId = getStationIdByName(stops.slice(-1)[0]);
      const refreshed = await fetch(
        `/api/seats/${vehicleId}` +
        `?route_id=${selectedRoute.id}` +
        `&route_schedule_id=${selectedScheduleId}` +
        `&date=${format(selectedDate, 'yyyy-MM-dd')}` +
        (selectedHour ? `&time=${encodeURIComponent(selectedHour)}` : '') +
        `&board_station_id=${firstStopId}` +
        `&exit_station_id=${lastStopId}`
      );
      const updatedSeats = await refreshed.json();
      setSeats(hydrateSeatPayload(updatedSeats));

      resetDefaultSeat();
    } catch (err) {
      console.error('Eroare la mutare:', err);
    } finally {
      setMoveSourceSeat(null);
    }
  };


  const handleEditPassenger = async (passenger, seat) => {
    setEditingReservationId(passenger.reservation_id);

    const newSeat = seats.find((s) => s.id === seat.id);
    if (!newSeat) return;

    // Resetăm promo și discount înainte de a încărca
    setPromoApplied(null);
    setPromoCode('');

    // Datele de bază din passenger (ce avem deja)
    setPassengersData({
      [newSeat.id]: {
        name: passenger.name,
        phone: passenger.phone,
        board_at: passenger.board_at,
        exit_at: passenger.exit_at,
        observations: passenger.observations || '',
        reservation_id: passenger.reservation_id,
        version: passenger.version ?? null,
        discount_type_id: null,  // se va actualiza după fetch
      },
    });

    // Fetch discount-uri din backend
    try {
      const res = await fetch(`/api/reservations/${passenger.reservation_id}/details`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        const discounts = data.discounts || [];

        // Găsim reducerea de tip (pensionar/elev etc.)
        const typeDiscount = discounts.find(d => d.discount_type_id != null);
        // Găsim promo-ul
        const promoDiscount = discounts.find(d => d.promo_code_id != null);

        // Actualizăm discount_type_id în passenger
        if (typeDiscount) {
          setPassengersData(prev => ({
            ...prev,
            [newSeat.id]: {
              ...prev[newSeat.id],
              discount_type_id: typeDiscount.discount_type_id,
            },
          }));
        }

        // Actualizăm promo
        if (promoDiscount) {
          setPromoCode(promoDiscount.promo_code || '');
          setPromoApplied({
            promo_code_id: promoDiscount.promo_code_id,
            code: promoDiscount.promo_code || '',
            discount_amount: promoDiscount.discount_amount,
          });
        }

        // Setăm și prețul corect (cel din pricing, deja net)
        if (data.pricing?.price_value != null) {
          setPricePerSeat(prev => ({
            ...prev,
            [newSeat.id]: Number(data.pricing.price_value),
          }));
        }
      }
    } catch (err) {
      console.error('Eroare la încărcarea detaliilor rezervării:', err);
    }

    setPopupPassenger(null);
    setPopupSeat(null);
    setMultiPassengerOptions(null);
  };
  const norm = useCallback((value) => (value ?? '').toString().trim().toLowerCase(), []);

  const computeAutoSeatSuggestion = useCallback(() => {
    if (!Array.isArray(stops) || stops.length < 2) {
      return { status: 'no-route' };
    }

    const stopList = stops.filter(Boolean);
    if (stopList.length < 2) {
      return { status: 'no-route' };
    }

    const stopIndexByKey = new Map();
    stopList.forEach((stop, index) => {
      const key = norm(stop);
      if (!stopIndexByKey.has(key)) {
        stopIndexByKey.set(key, index);
      }
    });

    const candidateSeats = selectedSeats.filter((seat) => {
      const entry = passengersData?.[seat.id];
      if (!entry || entry.reservation_id) return false;
      const origin = entry.origin || 'manual';
      return origin === 'auto';
    });

    if (!candidateSeats.length) {
      return { status: 'no-candidates' };
    }

    const candidateEntries = [];
    for (const seat of candidateSeats) {
      const entry = passengersData?.[seat.id];
      if (!entry?.board_at || !entry?.exit_at) {
        return { status: 'missing-segment' };
      }

      const boardNorm = norm(entry.board_at);
      const exitNorm = norm(entry.exit_at);
      const boardIndex = stopIndexByKey.get(boardNorm);
      const exitIndex = stopIndexByKey.get(exitNorm);

      if (boardIndex == null || exitIndex == null) {
        return { status: 'segment-not-on-route' };
      }

      if (boardIndex >= exitIndex) {
        return { status: 'invalid-segment' };
      }

      candidateEntries.push({
        seat,
        entry,
        board: entry.board_at,
        exit: entry.exit_at,
        boardNorm,
        exitNorm,
        boardIndex,
        exitIndex,
      });
    }

    const candidateIds = new Set(candidateEntries.map(({ seat }) => seat.id));
    const availableSeats = (seats || []).filter((seat) => {
      if (!seat?.id) return false;
      if (candidateIds.has(seat.id)) return true;
      const hold = intentHolds?.[seat.id];
      return !hold || hold.isMine === true;
    });

    if (!availableSeats.length) {
      return { status: 'no-availability' };
    }

    let workingSeats = [...availableSeats];
    const assignments = [];

    const groupMap = new Map();
    for (const item of candidateEntries) {
      const key = `${item.boardNorm}|${item.exitNorm}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          board: item.board,
          exit: item.exit,
          boardNorm: item.boardNorm,
          exitNorm: item.exitNorm,
          boardIndex: item.boardIndex,
          exitIndex: item.exitIndex,
          entries: [],
        });
      }
      groupMap.get(key).entries.push(item);
    }

    const groupList = [...groupMap.values()].sort((a, b) => {
      if (a.boardIndex !== b.boardIndex) return a.boardIndex - b.boardIndex;
      if (a.exitIndex !== b.exitIndex) return a.exitIndex - b.exitIndex;
      return b.entries.length - a.entries.length;
    });

    const sortSeat = (seat) => ({
      row: Number.isFinite(seat?.row) ? seat.row : 9999,
      col: Number.isFinite(seat?.seat_col) ? seat.seat_col : 9999,
      label: String(seat?.label ?? ''),
    });

    const compareSeats = (a, b) => {
      const sa = sortSeat(a);
      const sb = sortSeat(b);
      if (sa.row !== sb.row) return sa.row - sb.row;
      if (sa.col !== sb.col) return sa.col - sb.col;
      return sa.label.localeCompare(sb.label);
    };

    for (const group of groupList) {
      const desiredCount = group.entries.length;
      const suggestion = selectSeats(workingSeats, group.board, group.exit, stopList, desiredCount);

      if (!suggestion.length || suggestion.length < desiredCount) {
        return { status: 'no-availability' };
      }

      const suggestionSorted = suggestion.slice().sort(compareSeats);
      const entrySorted = group.entries.slice().sort((a, b) => compareSeats(a.seat, b.seat));

      for (let i = 0; i < desiredCount; i += 1) {
        const fromSeat = entrySorted[i]?.seat || null;
        assignments.push({
          fromSeat,
          toSeat: suggestionSorted[i] || null,
          board: group.board,
          exit: group.exit,
        });
      }

      const suggestionIds = new Set(suggestion.map((seat) => seat.id));
      workingSeats = workingSeats.filter((seat) => !suggestionIds.has(seat.id));
    }

    const changed = assignments.some(({ fromSeat, toSeat }) => (fromSeat?.id ?? null) !== (toSeat?.id ?? null));

    if (!changed) {
      return { status: 'already-optimal' };
    }

    const moves = assignments
      .filter(({ fromSeat, toSeat }) => (fromSeat?.id ?? null) !== (toSeat?.id ?? null))
      .map(({ fromSeat, toSeat, board, exit }) => ({
        fromLabel: fromSeat?.label ?? (fromSeat?.id != null ? `#${fromSeat.id}` : null),
        toLabel: toSeat?.label ?? (toSeat?.id != null ? `#${toSeat.id}` : null),
        board,
        exit,
      }));

    const signature = assignments
      .map(({ fromSeat, toSeat, board, exit }) =>
        `${fromSeat?.id ?? 'x'}:${norm(board)}>${norm(exit)}->${toSeat?.id ?? 'x'}`,
      )
      .sort()
      .join(';');

    const segments = [];
    const seenSegments = new Set();
    assignments.forEach(({ board, exit }) => {
      const key = `${norm(board)}|${norm(exit)}`;
      if (!seenSegments.has(key)) {
        seenSegments.add(key);
        segments.push({ board, exit });
      }
    });

    return {
      status: 'needs-reopt',
      assignments,
      moves,
      segments,
      signature,
    };
  }, [selectedSeats, passengersData, seats, intentHolds, stops, selectSeats, norm]);

  useEffect(() => {
    const result = computeAutoSeatSuggestion();
    if (result?.status === 'needs-reopt') {
      setPendingAutoSuggestion((prev) => (prev?.signature === result.signature ? prev : result));
    } else if (pendingAutoSuggestion != null) {
      setPendingAutoSuggestion(null);
    }
  }, [computeAutoSeatSuggestion, pendingAutoSuggestion]);

  const handleAutoAddPassengers = useCallback(
    (rawCount = 1) => {
      if (!Array.isArray(stops) || stops.length < 2) {
        setToastMessage('Selectează o rută pentru a atribui automat locuri.');
        setToastType('error');
        setTimeout(() => setToastMessage(''), 3000);
        return;
      }
      if (!seats.length) {
        setToastMessage('Nu există locuri încărcate pentru cursa curentă.');
        setToastType('error');
        setTimeout(() => setToastMessage(''), 3000);
        return;
      }

      // 1) determinăm segmentul implicit (capetele rutei)
      let defaultBoard = stops[0];
      let defaultExit = stops[stops.length - 1];
      // dacă ai deja locuri NOI selectate, preluăm segmentul din primul
      const existingNewSeats = selectedSeats.filter((seat) => {
        const data = passengersData[seat.id];
        return data && !data.reservation_id;
      });
      if (existingNewSeats.length) {
        const anchorData = passengersData[existingNewSeats[0].id] || {};
        if (stops.includes(anchorData.board_at)) defaultBoard = anchorData.board_at;
        if (stops.includes(anchorData.exit_at)) defaultExit = anchorData.exit_at;
      }

      // 2) vrem să RESELECTĂM DE LA ZERO: noul total = câte locuri noi ai deja + 1
      const add = Math.max(1, Number(rawCount) || 1);
      const desired = existingNewSeats.length + add;

      // 3) alegem lista ideală (4-5, 4-5-6, 4-5-7-8 etc.), ignorând GHID-ul și locurile ținute de alții
      const availableSeats = (seats || []).filter((seat) => {
        const hold = intentHolds?.[seat.id];
        return !hold || hold.isMine === true;
      });

      const list = selectSeats(availableSeats, defaultBoard, defaultExit, stops, desired);
      if (!list.length) {
        setToastMessage('Nu există loc disponibil pentru segmentul selectat.');
        setToastType('error');
        setTimeout(() => setToastMessage(''), 3000);
        return;
      }

      if (list.length < desired) {
        setToastMessage('Nu există suficiente locuri libere pentru numărul selectat.');
        setToastType('error');
        setTimeout(() => setToastMessage(''), 3000);
        return;
      }

      const newIds = new Set(list.map((seat) => seat.id));
      const removedSeatIds = selectedSeats
        .filter((seat) => !newIds.has(seat.id))
        .map((seat) => seat.id);

      if (removedSeatIds.length) {
        if (tripId) {
          removedSeatIds.forEach((seatId) => {
            fetch(`/api/intents/${tripId}/${seatId}`, {
              method: 'DELETE',
              credentials: 'include',
            }).catch(() => { });
          });
        }

        setIntentHolds((prev) => {
          if (!prev) return prev;
          let changed = false;
          const next = { ...prev };
          removedSeatIds.forEach((seatId) => {
            if (next[seatId]?.isMine) {
              delete next[seatId];
              changed = true;
            }
          });
          return changed ? next : prev;
        });
      }

      // 4) înlocuim COMPLET selecția curentă cu lista nouă
      setAutoSelectPaused(false);
      setSelectedSeats(list);

      // 5) reconstruim passengersData DOAR pentru locurile nou selectate
      setPassengersData(() => {
        const map = {};
        for (const seat of list) {
          map[seat.id] = {
            name: '',
            phone: '',
            board_at: defaultBoard,
            exit_at: defaultExit,
            observations: '',
            payment_method: 'none',
            origin: 'auto',
          };
        }
        return map;
      });

      autoSeatTargetRef.current = list.length;

      // 6) cerem preț pentru fiecare loc selectat
      list.forEach((seat) => {
        fetchPrice(seat.id, defaultBoard, defaultExit);
      });
    },
    [
      stops,
      seats,
      selectedSeats,
      passengersData,
      fetchPrice,
      setSelectedSeats,
      setPassengersData,
      setToastMessage,
      setToastType,
      intentHolds,
      selectSeats,
      tripId,
      setIntentHolds,
    ],
  );

  const handleRedistributeSelectedSeats = useCallback(() => {
    const result = computeAutoSeatSuggestion();

    const showToast = (message, type = 'error', duration = 3000) => {
      setToastMessage(message);
      setToastType(type);
      setTimeout(() => setToastMessage(''), duration);
    };

    if (!result || result.status === 'no-route') {
      showToast('Selectează o rută pentru a rearanja automat locurile.');
      return;
    }

    switch (result.status) {
      case 'no-candidates':
        showToast('Nu există locuri adăugate automat pentru reoptimizare.');
        return;
      case 'missing-segment':
        showToast('Completează segmentul pentru locurile adăugate automat înainte de reoptimizare.');
        return;
      case 'segment-not-on-route':
        showToast('Segmentul selectat nu aparține rutei curente.');
        return;
      case 'invalid-segment':
        showToast('Segmentul selectat este invalid. Verifică ordinea stațiilor.');
        return;
      case 'no-availability':
        showToast('Nu am găsit o configurație disponibilă pentru segmentele selectate.');
        return;
      case 'already-optimal':
        showToast('Locurile adăugate automat sunt deja optimizate.', 'info');
        return;
      case 'needs-reopt':
        break;
      default:
        showToast('Reoptimizarea nu este disponibilă în acest moment.');
        return;
    }

    const assignments = Array.isArray(result.assignments) ? result.assignments : [];
    if (!assignments.length) {
      showToast('Nu am găsit o propunere de reoptimizare în acest moment.');
      return;
    }

    const replacementMap = new Map();
    const oldIds = [];

    assignments.forEach(({ fromSeat, toSeat }) => {
      if (fromSeat?.id != null) {
        oldIds.push(fromSeat.id);
      }
      if (fromSeat?.id != null && toSeat) {
        replacementMap.set(fromSeat.id, toSeat);
      }
    });

    setSelectedSeats((prev) => {
      if (!Array.isArray(prev)) return prev;
      return prev.map((seat) => {
        const replacement = replacementMap.get(seat.id);
        return replacement || seat;
      });
    });

    setPassengersData((prev) => {
      const next = { ...prev };
      oldIds.forEach((id) => {
        if (id != null && Object.prototype.hasOwnProperty.call(next, id)) {
          delete next[id];
        }
      });

      assignments.forEach(({ fromSeat, toSeat, board, exit }) => {
        const toId = toSeat?.id;
        if (toId == null) {
          return;
        }
        const prevEntry = prev[fromSeat?.id] || {};
        const { price: _ignoredPrice, ...rest } = prevEntry;
        next[toId] = {
          ...rest,
          board_at: board,
          exit_at: exit,
          origin: 'auto',
        };
      });

      return next;
    });

    setPricePerSeat((prev) => {
      const next = { ...prev };
      oldIds.forEach((id) => {
        if (id != null && Object.prototype.hasOwnProperty.call(next, id)) {
          delete next[id];
        }
      });

      assignments.forEach(({ fromSeat, toSeat }) => {
        const toId = toSeat?.id;
        if (toId == null) {
          return;
        }
        const priceValue = prev[fromSeat?.id];
        if (priceValue != null) {
          next[toId] = priceValue;
        }
      });

      return next;
    });

    assignments.forEach(({ toSeat, board, exit }) => {
      if (toSeat?.id != null) {
        fetchPrice(toSeat.id, board, exit);
      }
    });

    setPendingAutoSuggestion(null);
    setAutoSelectPaused(false);
    setToastMessage('Locurile au fost rearanjate automat.');
    setToastType('success');
    setTimeout(() => setToastMessage(''), 3000);
  }, [
    computeAutoSeatSuggestion,
    fetchPrice,
    setSelectedSeats,
    setPassengersData,
    setPricePerSeat,
    setAutoSelectPaused,
    setToastMessage,
    setToastType,
  ]);

  const checkSegmentOverlap = (existing, board_at, exit_at, stops) => {
    const normalize = (s) => s?.trim().toLowerCase();
    const boardIndex = stops.findIndex((s) => normalize(s) === normalize(board_at));
    const exitIndex = stops.findIndex((s) => normalize(s) === normalize(exit_at));
    const rBoardIndex = stops.findIndex((s) => normalize(s) === normalize(existing.board_at));
    const rExitIndex = stops.findIndex((s) => normalize(s) === normalize(existing.exit_at));

    return !(exitIndex <= rBoardIndex || boardIndex >= rExitIndex);
  };


  // 🔄 Funcție care încarcă vehiculele disponibile din backend și deschide popup-ul de alegere




  useEffect(() => {
    const handleGlobalClick = (e) => {
      // dacă ai popup activ
      if (popupPassenger || multiPassengerOptions) {
        const clickedInsidePopup = e.target.closest('.popup-container');
        const clickedOnSeat = e.target.closest('[data-seat-id]');

        // dacă nu e click pe popup sau pe un loc
        if (!clickedInsidePopup && !clickedOnSeat) {
          setPopupPassenger(null);
          setPopupSeat(null);
          setMultiPassengerOptions(null);
        }
      }
    };

    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [popupPassenger, multiPassengerOptions]);


  // ═════ Încărcare rute pentru data selectată + sincronizare selectedRoute ═════
  useEffect(() => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    fetch(`/api/routes?fe=1&date=${dateStr}`)
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then((data) => {
        setRoutesList(data);
        // dacă aveai deja o rută selectată, încercăm s-o actualizăm
        if (selectedRoute) {
          const updated = data.find((r) => r.id === selectedRoute.id);
          if (updated) {
            // nu mai rescriem selectedRoute aici ca să nu declanșăm bucle
            setSelectedRoute(updated);
            if (selectedScheduleId) {
              const refreshed = updated.schedules?.find(
                (s) => (s.scheduleId ?? s.id) === selectedScheduleId
              );
              if (refreshed) {
                setSelectedSchedule(refreshed);
                // direcția o luăm din selectedSchedule la calc. effectiveDirection
              } else {
                setSelectedSchedule(null);
              }
            }
          } else {
            // nu o anulăm: păstrăm ruta curentă, dar golim ora (programările pot fi diferite)
            setSelectedSchedule(null);
            setSelectedDirection(null);
          }
        }
      })
      .catch((err) =>
        console.error('Eroare la încărcarea rutelor pentru', dateStr, err)
      );
  }, [selectedDate, selectedRoute?.id, selectedScheduleId]);











  // ✅ Marchează / demarchează locurile selectate și actualizează pasagerii
  const toggleSeat = async (seat) => {
    if (!seat || !seat.id) return;

    if (!tripId) {
      setToastMessage('Selectează întâi cursa înainte de a alege locuri.');
      setToastType('error');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    const seatId = Number(seat.id);
    const holdInfo = intentHolds?.[seatId] ?? null;

    if (holdInfo && holdInfo.isMine === false) {
      setToastMessage('Locul e în curs de rezervare de alt agent');
      setToastType('error');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }

    const alreadySelected = selectedSeats.some((s) => s.id === seatId);

    if (alreadySelected) {
      const willBeEmpty = selectedSeats.length === 1;
      try {
        await fetch(`/api/intents/${tripId}/${seatId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      } catch (err) {
        console.error('Eroare la ștergerea intentului', err);
      }

      setIntentHolds((prev) => {
        if (!prev || !Object.prototype.hasOwnProperty.call(prev, seatId)) {
          return prev;
        }
        const next = { ...prev };
        delete next[seatId];
        return next;
      });

      setSelectedSeats((prev) => prev.filter((s) => s.id !== seatId));
      if (willBeEmpty) {
        setAutoSelectPaused(true);
      }
      setPassengersData((prev) => {
        if (!prev || !prev[seatId]) return prev;
        const copy = { ...prev };
        delete copy[seatId];
        return copy;
      });

      await refreshIntents();
      return;
    }

    try {
      const response = await fetch('/api/intents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ trip_id: tripId, seat_id: seatId }),
      });

      if (response.status === 409) {
        setToastMessage('Locul e în curs de rezervare de alt agent');
        setToastType('error');
        setTimeout(() => setToastMessage(''), 3000);
        await refreshIntents();
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const errorMessage = payload?.error || 'Eroare la crearea intentului';
        throw new Error(errorMessage);
      }

      const payload = await response.json();
      setIntentHolds((prev) => ({
        ...prev,
        [seatId]: {
          expires_at: payload?.expires_at || null,
          isMine: true,
        },
      }));
    } catch (err) {
      console.error('toggleSeat intent error', err);
      setToastMessage(err.message || 'Eroare la rezervarea locului');
      setToastType('error');
      setTimeout(() => setToastMessage(''), 3000);
      await refreshIntents();
      return;
    }

    setSelectedSeats((prev) => {
      if (prev.some((s) => s.id === seatId)) return prev;
      return [...prev, seat];
    });

    setPassengersData((prev) => {
      if (prev?.[seatId]) return prev;

      const stopsList = routeStations.map((s) => s.name).filter(Boolean);
      const defaultBoard = stopsList[0] || seat.passenger?.board_at || '';
      const defaultExit = stopsList[stopsList.length - 1] || seat.passenger?.exit_at || '';

      let board_at = defaultBoard;
      let exit_at = defaultExit;

      const reservedSegment = seat.passenger
        ? {
          board: seat.passenger.board_at,
          exit: seat.passenger.exit_at,
        }
        : null;

      if (reservedSegment && seat.status === 'partial' && stopsList.length > 1) {
        const reservedStart = stopsList.indexOf(reservedSegment.board);
        const reservedEnd = stopsList.indexOf(reservedSegment.exit);

        for (let i = 0; i < stopsList.length - 1; i += 1) {
          const currentStart = i;
          const currentEnd = i + 1;
          if (currentEnd <= reservedStart || currentStart >= reservedEnd) {
            board_at = stopsList[currentStart];
            exit_at = stopsList[currentEnd];
            break;
          }
        }
      }

      return {
        ...prev,
        [seatId]: {
          name: '',
          phone: '',
          board_at,
          exit_at,
          observations: '',
          payment_method: 'none',
          origin: 'manual',
        },
      };
    });

    await refreshIntents();
  };




  useEffect(() => {
    selectedSeats.forEach(seat => {
      const data = passengersData[seat.id];
      // Dacă există datele, și nu avem deja preț pentru seat-ul acesta, îl cerem
      if (
        data &&
        data.board_at &&
        data.exit_at &&
        (pricePerSeat[seat.id] === undefined || pricePerSeat[seat.id] === null) &&
        !inFlightPrice.current.has([
          seat.id,
          data.board_at,
          data.exit_at,
          selectedRoute?.id ?? 'r',
          selectedScheduleId ?? 'sid',
          selectedHour ?? 'h',
          selectedTrip?.id ?? 't'
        ].join('|'))
      ) {
        fetchPrice(seat.id, data.board_at, data.exit_at);
      }
    });
  }, [selectedSeats, passengersData, pricePerSeat]);

  useEffect(() => {
    const prevIds = Array.isArray(lastSelectedSeatIdsRef.current)
      ? lastSelectedSeatIdsRef.current
      : [];
    const currentIds = selectedSeats.map((seat) => seat.id);
    const removed = prevIds.filter((id) => !currentIds.includes(id));
    const added = currentIds.filter((id) => !prevIds.includes(id));

    if (removed.length > 0 && tripId) {
      removed.forEach((seatId) => {
        if (intentsRef.current?.[seatId]?.isMine) {
          fetch(`/api/intents/${tripId}/${seatId}`, {
            method: 'DELETE',
            credentials: 'include',
          }).catch(() => { });
        }
      });

      setIntentHolds((prev) => {
        if (!prev) return prev;
        let changed = false;
        const next = { ...prev };
        removed.forEach((seatId) => {
          if (Object.prototype.hasOwnProperty.call(next, seatId)) {
            delete next[seatId];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }

    if (added.length > 0 && tripId) {
      added.forEach((seatId) => {
        if (intentsRef.current?.[seatId]?.isMine) {
          return;
        }

        const seat = selectedSeats.find((s) => s.id === seatId);
        if (!seat) return;

        const passengerEntry = passengersData?.[seatId];
        if (passengerEntry?.reservation_id) {
          return;
        }

        (async () => {
          try {
            const res = await fetch('/api/intents', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ trip_id: tripId, seat_id: seatId }),
            });

            if (res.status === 409) {
              setToastMessage('Locul e în curs de rezervare de alt agent');
              setToastType('error');
              setTimeout(() => setToastMessage(''), 3000);
              setSelectedSeats((prev) => prev.filter((s) => s.id !== seatId));
              setPassengersData((prev) => {
                if (!prev || !prev[seatId]) return prev;
                const copy = { ...prev };
                delete copy[seatId];
                return copy;
              });
              await refreshIntents();
              return;
            }

            if (!res.ok) {
              const payload = await res.json().catch(() => ({}));
              const errorMessage = payload?.error || 'Eroare la crearea intentului';
              throw new Error(errorMessage);
            }

            const payload = await res.json().catch(() => ({}));
            setIntentHolds((prev) => ({
              ...prev,
              [seatId]: {
                expires_at: payload?.expires_at || null,
                isMine: true,
              },
            }));
          } catch (err) {
            console.error('Eroare la alocarea intentului pentru loc', seatId, err);
            setToastMessage(err.message || 'Eroare la rezervarea locului');
            setToastType('error');
            setTimeout(() => setToastMessage(''), 3000);
            setSelectedSeats((prev) => prev.filter((s) => s.id !== seatId));
            setPassengersData((prev) => {
              if (!prev || !prev[seatId]) return prev;
              const copy = { ...prev };
              delete copy[seatId];
              return copy;
            });
            await refreshIntents();
          }
        })();
      });
    }

    lastSelectedSeatIdsRef.current = currentIds;
  }, [selectedSeats, tripId, refreshIntents, passengersData]);

  useEffect(() => {
    const prevIds = Array.isArray(lastSelectedSeatIdsRef.current)
      ? lastSelectedSeatIdsRef.current
      : [];
    const currentIds = selectedSeats.map((seat) => seat.id);
    const removed = prevIds.filter((id) => !currentIds.includes(id));
    const added = currentIds.filter((id) => !prevIds.includes(id));

    if (removed.length > 0 && tripId) {
      removed.forEach((seatId) => {
        if (intentsRef.current?.[seatId]?.isMine) {
          fetch(`/api/intents/${tripId}/${seatId}`, {
            method: 'DELETE',
            credentials: 'include',
          }).catch(() => { });
        }
      });

      setIntentHolds((prev) => {
        if (!prev) return prev;
        let changed = false;
        const next = { ...prev };
        removed.forEach((seatId) => {
          if (Object.prototype.hasOwnProperty.call(next, seatId)) {
            delete next[seatId];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }

    if (added.length > 0 && tripId) {
      added.forEach((seatId) => {
        if (intentsRef.current?.[seatId]?.isMine) {
          return;
        }

        const seat = selectedSeats.find((s) => s.id === seatId);
        if (!seat) return;

        const passengerEntry = passengersData?.[seatId];
        if (passengerEntry?.reservation_id) {
          return;
        }

        (async () => {
          try {
            const res = await fetch('/api/intents', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ trip_id: tripId, seat_id: seatId }),
            });

            if (res.status === 409) {
              setToastMessage('Locul e în curs de rezervare de alt agent');
              setToastType('error');
              setTimeout(() => setToastMessage(''), 3000);
              setSelectedSeats((prev) => prev.filter((s) => s.id !== seatId));
              setPassengersData((prev) => {
                if (!prev || !prev[seatId]) return prev;
                const copy = { ...prev };
                delete copy[seatId];
                return copy;
              });
              await refreshIntents();
              return;
            }

            if (!res.ok) {
              const payload = await res.json().catch(() => ({}));
              const errorMessage = payload?.error || 'Eroare la crearea intentului';
              throw new Error(errorMessage);
            }

            const payload = await res.json().catch(() => ({}));
            setIntentHolds((prev) => ({
              ...prev,
              [seatId]: {
                expires_at: payload?.expires_at || null,
                isMine: true,
              },
            }));
          } catch (err) {
            console.error('Eroare la alocarea intentului pentru loc', seatId, err);
            setToastMessage(err.message || 'Eroare la rezervarea locului');
            setToastType('error');
            setTimeout(() => setToastMessage(''), 3000);
            setSelectedSeats((prev) => prev.filter((s) => s.id !== seatId));
            setPassengersData((prev) => {
              if (!prev || !prev[seatId]) return prev;
              const copy = { ...prev };
              delete copy[seatId];
              return copy;
            });
            await refreshIntents();
          }
        })();
      });
    }

    lastSelectedSeatIdsRef.current = currentIds;
  }, [selectedSeats, tripId, refreshIntents, passengersData]);


  const [selectedPricingCategoryId, setSelectedPricingCategoryId] = useState( /* valoare inițială */);
  const [selectedPriceListId, setSelectedPriceListId] = useState( /* valoare inițială */);

  const performCashReceipt = useCallback(
    async ({ reservationId, description, employeeId }) => {
      if (!reservationId) {
        throw new Error('ID rezervare invalid pentru plata cash');
      }

      // 🔎 Citim statusul DIRECT din DB pentru această rezervare (nu folosim cache global)
      //     Asta previne bug-ul în care lastPaymentStatus rămâne de la altă rezervare.
      let fresh = null;
      try {
        const rStatus = await fetch(`/api/reservations/${reservationId}/payments/status`, {
          credentials: 'include',
        });
        const dStatus = await rStatus.json().catch(() => ({}));
        if (rStatus.ok) {
          fresh = dStatus?.payment || null;
        } else {
          console.warn('[performCashReceipt] /payments/status nu e OK:', dStatus);
        }
      } catch (e) {
        console.warn('[performCashReceipt] /payments/status exception:', e);
      }

      // ✅ Caz normal: nu avem payment retry-abil -> inițiem plata cash (creăm payment + job nou)
      const payload = {
        employeeId: employeeId ?? user?.id,
      };
      if (description && description.trim()) {
        payload.description = description.trim();
      }

      const res = await fetch(`/api/reservations/${reservationId}/payments/cash-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        const msg =
          data?.error ||
          data?.message ||
          `Eroare la inițierea plății cash (HTTP ${res.status})`;
        const err = new Error(msg);
        // pentru debug: atașăm payloadul primit de la backend
        err.payload = data;
        throw err;
      }

      return {
        amount: data.amount,
        paymentId: data.payment_id,
        jobId: data.job_id,
      };
    },
    [user?.id, startPaymentStatusPolling, showToast]
  );



  const performCardPayment = useCallback(
    async ({ reservationId, employeeId }) => {
      if (!reservationId) {
        throw new Error('ID rezervare invalid pentru plata cu card');
      }

      const r = await fetch(`/api/reservations/${reservationId}/payments/card-agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: employeeId ?? user?.id,
        }),
        credentials: 'include',

      });

      if (!r.ok) {
        const payload = await r.json().catch(() => ({}));
        const msg =
          payload?.error ||
          payload?.message ||
          `Eroare inițiere plată cash (agent) (${r.status})`;

        const err = new Error(msg);
        err.payload = payload;

        if (r.status === 423) {
          err.isLock = true;
        }

        throw err;
      }



      const data = await r.json().catch(() => ({}));
      if (!data?.ok) {
        const msg =
          data?.error ||
          data?.message ||
          'Răspuns invalid de la /payments/card-agent';
        const err = new Error(msg);
        err.payload = data;
        throw err;
      }

      // UI-ul nu folosește acum valorile, dar le întoarcem pentru viitor
      return {
        amount: data.amount,
        paymentId: data.payment_id,
        jobId: data.job_id,
      };
    },
    [user?.id]
  );

  const performCardRefund = useCallback(async ({ reservationId }) => {
    if (!reservationId) {
      throw new Error('ID rezervare invalid pentru refund');
    }

    const res = await fetch(`/api/reservations/${reservationId}/refunds/card-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      credentials: 'include',
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || `Eroare inițiere refund (agent) (${res.status})`);
    }
    if (!data?.ok) {
      throw new Error(data?.error || 'Răspuns invalid de la /refunds/card-agent');
    }

    return data;
  }, []);

  const handleRetryReceipt = useCallback(
    async ({ reservationId, paymentId }) => {
      if (!reservationId || !paymentId) {
        showToast('ID rezervare / plată invalid pentru retry bon.', 'error', 8000);
        return;
      }

      try {
        const res = await fetch(
          `/api/reservations/${reservationId}/payments/${paymentId}/retry-receipt`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({}),
          }
        );

        const data = await res.json().catch(() => ({}));

        if (res.status === 423) {
          showToast(data?.error || 'Există o tranzacție în curs. Așteaptă finalizarea.', 'warning', 10000);
          return;
        }

        if (!res.ok || !data?.ok) {
          const msg =
            data?.error ||
            data?.message ||
            `Eroare la inițierea reemiterii bonului (HTTP ${res.status})`;
          showToast(msg, 'error', 8000);
          return;
        }


        // ✅ FOARTE IMPORTANT: repornim polling-ul (altfel rămâi blocat pe last_job=error)
        startPaymentStatusPolling(reservationId);

        showToast('Re-emite bon fiscal trimis către agent…', 'info', 0);
      } catch (e) {
        console.error('[handleRetryReceipt] exception:', e);
        showToast('Eroare la retry bon fiscal (network).', 'error', 8000);
      }
    },
    [startPaymentStatusPolling, showToast]
  );



  // 💾 Trimite rezervarea către backend și afișează notificare + reîncarcă locurile
  const submitReservation = async () => {
    setIsSaving(true);

    const reloadSeatsForCurrentTrip = async () => {
      try {
        if (!Array.isArray(stops) || stops.length === 0) return;
        const currentVehId =
          activeTv === 'main'
            ? selectedTrip?.vehicle_id
            : tripVehicles.find((tv) => tv.trip_vehicle_id === activeTv)?.vehicle_id;
        if (!currentVehId) return;

        const firstStopId = getStationIdByName(stops[0]);
        const lastStopId = getStationIdByName(stops.slice(-1)[0]);
        if (firstStopId === null || lastStopId === null) return;

        const url =
          `/api/seats/${currentVehId}` +
          `?route_id=${selectedRoute.id}` +
          `&route_schedule_id=${selectedScheduleId}` +
          `&date=${format(selectedDate, 'yyyy-MM-dd')}` +
          (selectedHour ? `&time=${encodeURIComponent(selectedHour)}` : '') +
          `&board_station_id=${firstStopId}` +
          `&exit_station_id=${lastStopId}` +
          (effectiveDirection ? `&direction=${effectiveDirection}` : '');

        const seatRes = await fetch(url, { credentials: 'include' });
        if (!seatRes.ok) return;

        const seatData = await seatRes.json();
        setSeats(hydrateSeatPayload(seatData));
      } catch (err) {
        console.error('Eroare la reîncărcarea locurilor:', err);
      }
    };

    try {
      if (!selectedRoute?.id || !hasActiveSchedule) {
        showToast('Selectează ruta și ora înainte de a salva.', 'error', 3000);
        return;
      }

      const seatsAreMine = await ensureSeatsOwnedByMe();
      if (!seatsAreMine) {
        return;
      }

      // Mesaj clar că se salvează (fără timeout – se va înlocui de mesajele următoare)
      showToast('Se salvează rezervarea...', 'info', 0);

      const derivedListId =
        selectedPriceListId || (passengersData[selectedSeats[0]?.id]?.price_list_id ?? null);

      let passengersPayload;
      try {
        passengersPayload = selectedSeats.map((seat) => {
          const d = passengersData[seat.id];
          const boardStationId = getStationIdByName(d.board_at);
          const exitStationId = getStationIdByName(d.exit_at);
          if (boardStationId === null || exitStationId === null) {
            throw new Error('Stațiile selectate nu sunt valide pentru această rută.');
          }

          const passengerPayload = {
            seat_id: seat.id,
            reservation_id: d.reservation_id || null,
            person_id: d.person_id || null,
            name: d.name,
            phone: d.phone,
            board_station_id: boardStationId,
            exit_station_id: exitStationId,
            price_list_id: d.price_list_id || derivedListId,
            category_id: d.category_id ?? defaultPricingCategoryId ?? null,
            observations: d.observations || '',
            discount_type_id: d.discount_type_id || null,
            price: pricePerSeat[seat.id],
            payment_method: d.payment_method || 'none',
            provider_transaction_id: d.provider_transaction_id || null,
          };

          if (d?.reservation_id) {
            const version = Number(d.version);
            if (!Number.isInteger(version)) {
              throw new Error(
                'Nu am putut încărca versiunea rezervării. Reîncarcă pagina și încearcă din nou.',
              );
            }
            passengerPayload.version = version;
          }

          return passengerPayload;
        });
      } catch (err) {
        showToast(err.message, 'error', 3000);
        return;
      }

      const payload = {
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: selectedHour,
        route_schedule_id: selectedScheduleId,
        direction: effectiveDirection,
        route_id: selectedRoute.id,
        vehicle_id: selectedTrip.vehicle_id,
        pricing_category_id: selectedPricingCategoryId,
        price_list_id: derivedListId,
        passengers: passengersPayload,
        promo_apply: promoApplied
          ? {
            promo_code_id: promoApplied.promo_code_id,
            code: promoApplied.code,
            discount_amount: promoApplied.discount_amount,
          }
          : null,
      };

      const idempotencyKey = createIdempotencyKey();

      const response = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (response.status === 423) {
        showToast(data?.error || 'Există o tranzacție în curs. Așteaptă finalizarea.', 'warning', 10000);
        return;
      }


      if (response.status === 409) {
        showToast(data.error || 'Loc ocupat pe segment', 'error', 4000);
        await refreshIntents();
        await reloadSeatsForCurrentTrip();
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Eroare la salvare');
      }

      const isIdempotentHit = data?.idempotent === true;
      const createdReservationIds = Array.isArray(data?.createdReservationIds)
        ? data.createdReservationIds
        : data?.id
          ? [data.id]
          : [];

      // curățăm UI-ul dupa ce se salveaza rezervarea
      setSelectedSeats([]);
      setPassengersData({});
      setIntentHolds({});
      setAutoSelectPaused(true);
      setPromoCode('');
      setPromoApplied(null);
      await refreshIntents();
      await reloadSeatsForCurrentTrip(); // ✅ vezi imediat prețul nou în hartă la editare

      // 👉 verificăm dacă avem cash și/sau card
      const hadCash =
        !isIdempotentHit &&
        Array.isArray(payload?.passengers) &&
        payload.passengers.some((p) => p.payment_method === 'cash');

      const hadCard =
        !isIdempotentHit &&
        Array.isArray(payload?.passengers) &&
        payload.passengers.some((p) => p.payment_method === 'card');

      // Mesaj inițial după salvare (fără timeout sau cu mic timeout, dar prin showToast)
      if (isIdempotentHit) {
        showToast('Rezervarea era deja salvată (cerere repetată).', 'info', 2500);
      } else if (hadCash && !hadCard) {
        showToast('Rezervare salvată. Se tipărește bonul...', 'info', 0);
      } else if (hadCard && !hadCash) {
        showToast('Rezervare salvată. Se inițiază plata cu cardul...', 'info', 0);
      } else if (hadCash && hadCard) {
        showToast('Rezervare salvată. Se procesează plățile (cash + card)...', 'info', 0);
      } else {
        showToast('Rezervare salvată ✅', 'success', 2500);
      }

      // 📠 PLATĂ CASH – prin agent (payments + agent_jobs)
      if (!isIdempotentHit && hadCash) {
        for (const id of createdReservationIds) {
          try {
            await performCashReceipt({
              reservationId: id,
              description: `Rezervare #${id}`,
              employeeId: user?.id,
            });
          } catch (e) {
            console.error('[handlePayReservation] eroare inițiere plată cash pentru', id, e);

            const msg =
              e?.message ||
              e?.payload?.error ||
              `Eroare la inițierea plății cash pentru #${id}`;

            if (e?.isLock) {
              showToast(msg, 'warning', 4000);
            } else {
              showToast(msg, 'error', 6000);
            }
          }

        }

        if (createdReservationIds.length > 0) {
          // urmărim statusul ultimei rezervări create
          startPaymentStatusPolling(
            createdReservationIds[createdReservationIds.length - 1],
          );
        }

        // mesaj clar că jobul a plecat spre agent
        showToast('Rezervare salvată. Plată cash inițiată (agent)…', 'info', 0);
      }

      // 💳 PLATĂ CARD – prin agent (payments + agent_jobs)
      if (!isIdempotentHit && hadCard) {
        for (const id of createdReservationIds) {
          try {
            await performCardPayment({
              reservationId: id,
              employeeId: user?.id,
            });
          } catch (e) {
            console.error(
              '[handleSaveReservation] eroare inițiere plată card (agent) pentru',
              id,
              e,
            );
            const msg =
              e?.message ||
              e?.payload?.error ||
              `Eroare la inițierea plății cu cardul pentru #${id}`;
            showToast(msg, 'error', 6000);
          }
        }

        if (createdReservationIds.length > 0) {
          // urmărim statusul ultimei rezervări create
          startPaymentStatusPolling(
            createdReservationIds[createdReservationIds.length - 1],
          );
        }

        // mesaj clar că jobul a plecat spre agent
        showToast('Rezervare salvată. Plată cu cardul inițiată (agent)…', 'info', 0);
      }


      await reloadSeatsForCurrentTrip();
    } catch (err) {
      console.error('Eroare la salvarea rezervării:', err);
      showToast(err.message || 'A apărut o eroare.', 'error', 4000);
    } finally {
      setIsSaving(false);
    }
  };





  // salvează cu verificare + efecte vizuale dacă lipsesc câmpuri
  const handleStartSave = () => {
    if (globalPaymentLock) {
      showToast('Există o tranzacție în curs. Așteaptă finalizarea.', 'warning', 10000);
      return;
    }

    if (blockNewReservations) {
      setToastMessage('Nu poți salva rezervări pentru curse care au plecat deja.');
      setToastType('error');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }
    // validează fiecare pasager selectat folosind utilitarul existent
    const invalidSeatIds = selectedSeats
      .filter(seat => {
        const d = passengersData[seat.id];
        const v = isPassengerValid(d);
        return !v?.valid;
      })
      .map(seat => seat.id);

    if (invalidSeatIds.length > 0) {
      setShake(true);
      setTimeout(() => setShake(false), 600);
      // evidențiază câmpurile din fiecare formular al locului invalid
      invalidSeatIds.forEach(id => {
        const container = document.querySelector(`.passenger-form[data-seat="${id}"]`);
        if (!container) return;
        container.classList.add('animate-shake', 'border-red-500');
        setTimeout(() => container.classList.remove('border-red-500'), 800);
        const inputs = container.querySelectorAll('input, select, textarea');
        inputs.forEach(inp => {
          inp.classList.add('border-red-500');
          setTimeout(() => inp.classList.remove('border-red-500'), 800);
        });
      });
      setToastMessage('Completează toate câmpurile obligatorii înainte de salvare');
      setToastType('error');
      setTimeout(() => setToastMessage(''), 2000);
      return;
    }
    if (blacklistInfo?.blacklisted) {
      setShowBlacklistModal(true);
      return;
    }
    handleSaveReservation();
  };






  const handleSaveReservation = async () => {
    if (blockNewReservations) {
      setToastMessage('Nu poți salva rezervări pentru curse care au plecat deja.');
      setToastType('error');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }
    // 1) verificăm conflicte same-day, same-direction, altă oră
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const firstSeatId = selectedSeats[0]?.id;
    const d = passengersData[firstSeatId] || {};
    const boardStationId = getStationIdByName(d.board_at);
    const exitStationId = getStationIdByName(d.exit_at);
    if (boardStationId === null || exitStationId === null) {
      setToastMessage('Stațiile selectate nu sunt valide pentru această rută.');
      setToastType('error');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }


    let conflict = false;
    let infos = [];



    // dacă nu avem person_id (telefon nou, persoană inexistentă), nu verificăm conflictul
    if (!d.person_id) {
      console.log('Conflict skipped: no person_id');
    } else {
      const qs = new URLSearchParams({
        person_id: String(d.person_id),
        date: dateStr,
        board_station_id: String(boardStationId),
        exit_station_id: String(exitStationId),
        time: selectedHour
      });
      if (selectedRoute?.id) qs.set('route_id', String(selectedRoute.id));
      if (selectedScheduleId) qs.set('route_schedule_id', String(selectedScheduleId));
      if (effectiveDirection) qs.set('direction', effectiveDirection);
      const resp = await fetch(`/api/reservations/conflict?${qs.toString()}`);
      const data = await resp.json();
      conflict = data.conflict;
      infos = data.infos;
      if (conflict) {
        handleConflictInfoUpdate(infos);
        setShowConflictModal(true);
        return; // nu continuăm până nu confirmă user-ul
      }

    }

    if (conflict) {
      handleConflictInfoUpdate(infos);
      setShowConflictModal(true);
      return; // nu continuăm până nu confirmă user-ul
    }

    // 2) validări locale (pasageri, trip)
    const invalids = Object.values(passengersData)
      .map(p => isPassengerValid(p))
      .filter(v => !v.valid);
    if (invalids.length > 0) {
      const firstError = invalids[0].errors;
      setToastMessage(firstError.general || firstError.name || firstError.phone);
      setToastType('error');
      setTimeout(() => setToastMessage(''), 3000);
      return;
    }
    if (!selectedTrip) {
      setToastMessage('Tripul nu este încărcat. Încearcă din nou.');
      setToastType('error');
      return;
    }

    // 3) dacă ajungem aici, nu-s conflicte → trimitem rezervarea

    submitReservation();
  };


  // ═════ Când SE SCHIMBĂ cu adevărat ruta (alt ID), resetăm ora și harta ═════
  useEffect(() => {
    const rid = selectedRoute?.id ?? null;
    if (rid == null) return;
    if (lastRouteIdRef.current === rid) return; // aceeași rută → nu resetăm
    lastRouteIdRef.current = rid;
    setSelectedSchedule(null);
    setSelectedDirection(null);
    setSeats([]);
    setVehicleInfo(null);
    setTripId(null);
  }, [selectedRoute?.id]);





  const previousActiveTvRef = useRef(null);

  useEffect(() => {
    const previous = previousActiveTvRef.current;
    if (previous === activeTv) {
      previousActiveTvRef.current = activeTv;
      return;
    }

    if (previous !== null || activeTv !== null) {
      releaseHeldSeats();
      setSelectedSeats([]);
      setPassengersData({});
      setPricePerSeat({});
      setIntentHolds({});
      setSelectedPriceListId(null);
      setAutoSelectPaused(false);
      autoSeatTargetRef.current = 0;
    }

    previousActiveTvRef.current = activeTv;
  }, [activeTv, releaseHeldSeats]);

  useEffect(() => {
    const dateKey = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : 'nodate';
    const key = `${selectedRoute?.id ?? 'noroute'}|${selectedScheduleId ?? 'noschedule'}|${selectedHour ?? 'nohour'}|${dateKey}|${scheduleSelectionToken}`;
    const previousKey = previousSelectionKeyRef.current;

    if (previousKey === key) {
      previousSelectionKeyRef.current = key;
      return;
    }

    if (previousKey !== null) {
      releaseHeldSeats();
      setSelectedSeats([]);
      setPassengersData({});
      setPricePerSeat({});
      setIntentHolds({});
      setSelectedPriceListId(null);
      setAutoSelectPaused(false);
      autoSeatTargetRef.current = 0;
      // 🔁 s-a schimbat contextul (data/rută/oră) => reset promo
      setPromoApplied(null);
      setPromoCode('');
      setIsPromoValidating(false);
      lastPromoApplyKeyRef.current = null;
      promoBaseTotalRef.current = null;

    }

    previousSelectionKeyRef.current = key;
  }, [selectedRoute?.id, selectedScheduleId, selectedHour, selectedDate, scheduleSelectionToken, releaseHeldSeats]);

  useEffect(() => {
    // Așteptăm să fie încărcate stațiile rutei (altfel nu avem capetele segmentului)
    if (!selectedRoute || !hasActiveSchedule || !selectedDate || !stationsKey) return;
    // așteptăm să avem stațiile pentru direcția efectivă (tur/retur)
    if (!routeStations.length || routeStations[0]?.direction !== effectiveDirection) return;
    if (isSwitchingRoute) return; // ⛔ nu porni încărcarea în timp ce schimbăm ruta
    // determinăm capetele segmentului pe ID (mai robust decât pe nume)
    const firstStopId = routeStations[0].station_id;
    const lastStopId = routeStations[routeStations.length - 1].station_id;

    // cheie unică (folosește IDs ca să nu depindem de stringuri)
    const fetchKey =
      `${selectedRoute.id}|${format(selectedDate, 'yyyy-MM-dd')}|${selectedScheduleId ?? 'sid'}|${selectedHour}|${firstStopId}|${lastStopId}|main|${scheduleSelectionToken}`;

    if (lastSeatsFetchKeyRef.current === fetchKey) {
      return; // există deja o cerere identică
    }
    lastSeatsFetchKeyRef.current = fetchKey;

    // abia acum resetăm UI-ul și pornim loaderul
    setActiveTv('main');
    setSeats([]);
    setVehicleInfo(null);
    setTripId(null);
    setIsLoadingSeats(true);

    const loadSeats = async () => {
      try {
        const controller = new AbortController();
        fetchAbortRef.current = controller;

        const tripRes = await fetch(
          `/api/trips/find?route_id=${selectedRoute.id}` +
          `&schedule_id=${selectedScheduleId}` +
          `&date=${format(selectedDate, 'yyyy-MM-dd')}` +
          (selectedHour ? `&time=${encodeURIComponent(selectedHour)}` : '') +
          (effectiveDirection ? `&direction=${effectiveDirection}` : ''),
          { signal: controller.signal }
        );
        if (!tripRes.ok) {
          if (tripRes.status === 404) {
            // NU există cursă la ora selectată → curățăm tot și ieșim
            lastSeatsFetchKeyRef.current = null;
            setTripId(null);
            setSelectedTrip(null);
            setTripVehicles([]);
            setVehicleInfo(null);
            setSeats([]);
            setActiveTv(null);
            setSelectedSeats([]);
            setPassengersData({});
            setPricePerSeat({});
            setToastMessage(`Nu există cursă la ${selectedHour || 'ora selectată'} pe ruta aleasă.`);
            setToastType('info');
            setTimeout(() => setToastMessage(''), 2500);
            setIsLoadingSeats(false);
            return;
          }
          // alte erori
          throw new Error(`HTTP ${tripRes.status}`);
        }
        const tripData = await tripRes.json();
        const trip_id = tripData?.id;
        if (!trip_id) {
          lastSeatsFetchKeyRef.current = null; // permite reîncărcarea la următorul click
          setIsLoadingSeats(false);
          return;
        }
        setTripId(trip_id);
        refreshIntents();
        setSelectedTrip(tripData);
        await fetchTripVehicles(tripData.id);

        if (!tripData?.vehicle_id) {
          lastSeatsFetchKeyRef.current = null;   // eliberează cheia ca să poți reîncărca la următorul click
          setIsLoadingSeats(false);
          return;
        }

        const seatRes = await fetch(
          `/api/seats/${tripData.vehicle_id}` +
          `?route_id=${selectedRoute.id}` +
          `&route_schedule_id=${selectedScheduleId}` +
          `&date=${format(selectedDate, 'yyyy-MM-dd')}` +
          (selectedHour ? `&time=${encodeURIComponent(selectedHour)}` : '') +
          `&board_station_id=${firstStopId}` +
          `&exit_station_id=${lastStopId}` +
          (effectiveDirection ? `&direction=${effectiveDirection}` : ''),
          { signal: controller.signal }
        );
        const seatsData = await seatRes.json();
        setSeats(hydrateSeatPayload(seatsData));

        if (seatsData.length > 0) {
          setVehicleInfo({
            name: seatsData[0].vehicle_name,
            plate: seatsData[0].plate_number,
          });
        }
      } catch (err) {
        if (err?.name === 'AbortError') {
          // eliberăm cheia ca să putem reîncerca ulterior
          lastSeatsFetchKeyRef.current = null;
        } else {
          console.error('Eroare la încărcarea datelor:', err);
        }
      } finally {
        setIsLoadingSeats(false); // termină loader oricum, și la eroare și la succes!
      }
    };

    loadSeats();
    return () => { try { fetchAbortRef.current?.abort(); } catch { } };
  }, [
    selectedRoute?.id,
    selectedScheduleId,
    selectedHour,
    selectedDate,
    stationsKey,
    effectiveDirection,
    scheduleSelectionToken,
  ]);
  ;





  const fetchTripVehicles = async (tripId) => {
    const res = await fetch(`/api/trips/${tripId}/vehicles`);
    if (!res.ok) {
      // 400/500 -> setează gol, ca să nu crape data.map
      setTripVehicles([]);
      return [];
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      setTripVehicles([]);
      return [];
    }

    // atașează plate_number din availableVehicles (fallback dacă lipsește)
    const enriched = data.map(tv => {
      const veh = availableVehicles.find(v => v.id === tv.vehicle_id);
      return {
        ...tv,
        plate_number: tv.plate_number || veh?.plate_number || veh?.plate || ''
      };
    });

    setTripVehicles(enriched);
    return enriched;
  };




  // ─── Setăm tab-ul implicit pe "main" (mașina principală) când se încarcă cursa ───
  // SETEAZĂ activeTv PE CEL CORECT când tripVehicles se schimbă!
  useEffect(() => {
    if (!tripVehicles || tripVehicles.length === 0) return;

    // Caută tab-ul principal ("main"), altfel pune primul tab
    const mainTab = tripVehicles.find(tv => tv.is_primary);
    if (mainTab) {
      setActiveTv('main');
    } else {
      setActiveTv(tripVehicles[0].trip_vehicle_id);
    }
  }, [tripVehicles, selectedScheduleId, selectedDate, selectedRoute]);









  useEffect(() => {
    // de fiecare dată când selecția orei sau tripId se schimbă,
    // retragem lista de vehicule pentru noua cursă+oră
    if (!tripId || !hasActiveSchedule) return;
    fetchTripVehicles(tripId);

    // 🔄 încarcă vehiculele disponibile (doar ale operatorului)
    fetch(`/api/vehicles/${tripId}/available`)
      .then(r => (r.ok ? r.json() : []))
      .then(setAvailableVehicles)
      .catch(() => setAvailableVehicles([]));
  }, [tripId, selectedScheduleId]);







  const fetchCurrentSeatMap = useCallback(
    async (options = {}) => {
      const { force = false, signal } = options;

      if (!activeTv || !tripId || !selectedRoute || !hasActiveSchedule || !stationsKey) {
        return null;
      }

      if (!routeStations.length || routeStations[0]?.direction !== effectiveDirection) {
        return null;
      }

      const current =
        activeTv === 'main'
          ? { vehicle_id: selectedTrip?.vehicle_id }
          : tripVehicles.find((tv) => tv.trip_vehicle_id === activeTv);

      if (!current || !current.vehicle_id) {
        return null;
      }

      const firstStopId = routeStations[0]?.station_id ?? null;
      const lastStopId = routeStations[routeStations.length - 1]?.station_id ?? null;
      if (firstStopId == null || lastStopId == null) {
        return null;
      }

      const tvKey = `${current.vehicle_id}|${selectedRoute.id}|${format(selectedDate, 'yyyy-MM-dd')}|${selectedScheduleId ?? 'sid'}|${selectedHour}|${stationsKey}|${scheduleSelectionToken}`;

      if (!force && lastTvSeatsFetchKeyRef.current === tvKey) {
        return null;
      }

      lastTvSeatsFetchKeyRef.current = tvKey;

      try {
        const url =
          `/api/seats/${current.vehicle_id}` +
          `?route_id=${selectedRoute.id}` +
          `&route_schedule_id=${selectedScheduleId}` +
          `&date=${format(selectedDate, 'yyyy-MM-dd')}` +
          (selectedHour ? `&time=${encodeURIComponent(selectedHour)}` : '') +
          `&board_station_id=${firstStopId}` +
          `&exit_station_id=${lastStopId}` +
          (effectiveDirection ? `&direction=${effectiveDirection}` : '');

        const fetchOptions = signal ? { signal } : undefined;
        const res = await fetch(url, fetchOptions);

        if (!res.ok) {
          if (!force) {
            lastTvSeatsFetchKeyRef.current = null;
          }
          return null;
        }

        const data = await res.json();
        setSeats(hydrateSeatPayload(data));

        if (Array.isArray(data) && data.length > 0) {
          setVehicleInfo({ name: data[0].vehicle_name, plate: data[0].plate_number });
        }

        return data;
      } catch (err) {
        if (err?.name !== 'AbortError') {
          console.error('Eroare la actualizarea seat map', err);
        }
        if (!force) {
          lastTvSeatsFetchKeyRef.current = null;
        }
        return null;
      }
    },
    [
      activeTv,
      tripId,
      selectedRoute,
      hasActiveSchedule,
      stationsKey,
      routeStations,
      effectiveDirection,
      selectedTrip,
      tripVehicles,
      selectedDate,
      selectedScheduleId,
      selectedHour,
      scheduleSelectionToken,
      hydrateSeatPayload,
    ],
  );

  useEffect(() => {
    fetchCurrentSeatMapRef.current = fetchCurrentSeatMap;
  }, [fetchCurrentSeatMap]);

  useEffect(() => {
    const controller = new AbortController();
    fetchCurrentSeatMap({ signal: controller.signal });
    return () => controller.abort();
  }, [fetchCurrentSeatMap]);

  useEffect(() => {


    // fără trip / fără schedule => nu cerem seats
    if (!tripId || !hasActiveSchedule) {
      return;
    }

    // un singur fetch (fără polling)
    fetchCurrentSeatMap({ force: true });
  }, [tripId, hasActiveSchedule, fetchCurrentSeatMap]);


  // Dacă s-a schimbat setul de stații (de ex. ai comutat tur ↔ retur),
  // permitem un refetch nou pentru tab-ul curent
  useEffect(() => {
    lastTvSeatsFetchKeyRef.current = null;
  }, [stationsKey]);
  //Eliberează și cheia principală dacă se schimbă direcția
  useEffect(() => {
    lastSeatsFetchKeyRef.current = null;
  }, [effectiveDirection]);




  useEffect(() => {
    if (!selectedRoute || !hasActiveSchedule || !selectedDate || !seats.length) return;
    resetDefaultSeat();
  }, [
    selectedRoute,
    selectedScheduleId,
    selectedDate,
    seats,
    hasActiveSchedule,
    resetDefaultSeat,
  ]);


  const closePopups = () => {
    setPopupPassenger(null);
    setPopupSeat(null);
    setPopupPosition(null);
    setMultiPassengerOptions(null);
  };




  const handlePayReservation = useCallback(async () => {
    try {
      if (!popupPassenger?.reservation_id) return;

      setPaying(true);

      // verificăm dacă nu e deja plătită
      const res = await fetch(
        `/api/reservations/${popupPassenger.reservation_id}/summary`,
      );
      const sum = await res.json();
      if (sum?.paid) {
        showToast('Rezervarea este deja achitată.', 'info', 3000);
        setPaying(false);
        return;
      }

      const descParts = [];
      if (receiptNote && receiptNote.trim()) descParts.push(receiptNote.trim());
      const fromTo = `${popupPassenger?.board_at || ''} → ${popupPassenger?.exit_at || ''
        }`.trim();
      if (fromTo && fromTo !== '→') descParts.push(`Bilet ${fromTo}`);
      const description = descParts.join(' | ');

      try {
        await performCashReceipt({
          reservationId: popupPassenger.reservation_id,
          description,
          employeeId: user?.id,
        });
      } catch (err) {
        console.error('[handlePayReservation] performCashReceipt error:', err);
        const msg =
          err?.message ||
          err?.payload?.error ||
          'Eroare la inițierea plății cash';
        showToast(msg, 'error', 6000);
        return;
      }

      // anunțăm inițierea (scurt), apoi polling-ul va afișa rezultatul final
      showToast('Plată cash inițiată. Așteptăm confirmarea agentului…', 'info', 3000);

      // pornim polling pe statusul plății în DB
      startPaymentStatusPolling(popupPassenger.reservation_id);



      // marcăm nevoie de refresh la seat-map (se va actualiza din DB)
      try {
        lastSeatsFetchKeyRef.current = null;
      } catch {
        // ignorăm
      }
    } catch (e) {
      console.error('[handlePayReservation] eroare generală:', e);
      // în catch general
      showToast(e.message || 'Eroare la plată', 'error', 6000);
    } finally {
      setPaying(false);
      // închidem popupurile
      setPopupPassenger(null);
      setPopupSeat(null);
      setPopupPosition(null);
    }
  }, [
    popupPassenger?.reservation_id,
    popupPassenger?.board_at,
    popupPassenger?.exit_at,
    receiptNote,
    user?.id,
    performCashReceipt,
    startPaymentStatusPolling,
  ]);


  // [NEW] Achitare rapidă (card) a rezervării din popup – via AGENT
  const handlePayReservationCard = useCallback(async () => {
    try {
      if (!popupPassenger?.reservation_id) return;

      setPaying(true);

      // verificăm dacă nu e deja plătită
      const res = await fetch(`/api/reservations/${popupPassenger.reservation_id}/summary`);
      const sum = await res.json();
      if (sum?.paid) {
        showToast('Rezervarea este deja achitată.', 'info', 4000);
        setPaying(false);
        return;
      }

      // trimitem plata la AGENT
      try {
        await performCardPayment({
          reservationId: popupPassenger.reservation_id,
          employeeId: user?.id,
        });
      } catch (err) {
        console.error('[handlePayReservationCard] performCardPayment error:', err);

        const baseMsg = String(err?.message || 'Eroare la plata cu cardul (agent)');
        const detail = err?.payload?.error || err?.payload?.message || '';
        const finalMsg = detail ? `${baseMsg}\n${detail}` : baseMsg;

        if (err?.isLock) {
          showToast(finalMsg, 'warning', 4000);
        } else {
          showToast(finalMsg, 'error', 8000);
        }

        setPaying(false);
        return;
      }


      // anunțăm inițierea (scurt), apoi polling-ul va afișa rezultatul final
      showToast('Plată cu cardul inițiată (agent)…', 'info', 3000);

      // pornim polling pe statusul plății în DB
      startPaymentStatusPolling(popupPassenger.reservation_id);


      // marcăm nevoie de refresh la seat-map (se va actualiza din DB)
      try {
        lastSeatsFetchKeyRef.current = null;
      } catch {
        // ignorăm
      }
    } catch (e) {
      console.error('[handlePayReservationCard] eroare generală:', e);
      showToast(e.message || 'Eroare generală la plata cu cardul', 'error', 8000);
    } finally {
      setPaying(false);
      // închidem popupurile
      setPopupPassenger(null);
      setPopupSeat(null);
      setPopupPosition(null);
    }
  }, [
    popupPassenger?.reservation_id,
    user?.id,
    performCardPayment,
    startPaymentStatusPolling,
  ]);

  const handleRefundReservationCard = useCallback(async () => {
    if (!popupPassenger?.reservation_id) return;

    if (globalPaymentLock) {
      showToast('Există o tranzacție în curs. Așteaptă finalizarea.', 'warning', 4000);
      return;
    }

    try {
      setPaying(true);
      await performCardRefund({ reservationId: popupPassenger.reservation_id });
      showToast('Refund inițiat pe POS…', 'info', 3000);
      startPaymentStatusPolling(popupPassenger.reservation_id);

      try {
        lastSeatsFetchKeyRef.current = null;
      } catch {
        // ignorăm
      }
    } catch (e) {
      console.error('[handleRefundReservationCard] eroare:', e);
      showToast(e.message || 'Eroare la refundul cu cardul', 'error', 8000);
    } finally {
      setPaying(false);
      setPopupPassenger(null);
      setPopupSeat(null);
      setPopupPosition(null);
    }
  }, [
    popupPassenger?.reservation_id,
    globalPaymentLock,
    performCardRefund,
    showToast,
    startPaymentStatusPolling,
  ]);




  const handleDeletePassenger = async (passenger) => {
    try {
      const confirm = window.confirm(`Sigur vrei să ștergi pasagerul ${passenger.name}?`);
      if (!confirm) return;

      const res = await fetch(`/api/reservations/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: passenger.phone,
          board_station_id: passenger.board_station_id,
          exit_station_id: passenger.exit_station_id,
          trip_id: tripId,
          seat_id: popupSeat?.id,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 423) {
        showToast(data?.error || 'Există o tranzacție în curs.', 'warning', 10000);
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Eroare la ștergere');


      setToastMessage('Pasager șters cu succes ✅');
      setToastType('success');
      setTimeout(() => setToastMessage(''), 3000);
      closePopups();

      if (!selectedScheduleId) return;
      const firstStopId = getStationIdByName(stops[0]);
      const lastStopId = getStationIdByName(stops[stops.length - 1]);
      const refreshed = await fetch(
        `/api/seats/${selectedTrip.vehicle_id}` +
        `?route_id=${selectedRoute.id}` +
        `&route_schedule_id=${selectedScheduleId}` +
        `&date=${format(selectedDate, 'yyyy-MM-dd')}` +
        (selectedHour ? `&time=${encodeURIComponent(selectedHour)}` : '') +
        `&board_station_id=${firstStopId}` +
        `&exit_station_id=${lastStopId}` +
        (effectiveDirection ? `&direction=${effectiveDirection}` : '')
      );
      const updated = await refreshed.json();
      setSeats(hydrateSeatPayload(updated));
    } catch (err) {
      console.error('Eroare la ștergere pasager:', err);
      setToastMessage('Eroare la ștergere');
      setToastType('error');
      setTimeout(() => setToastMessage(''), 3000);
    }
  };

  const handleSeatClick = (e, seat) => {
    if (!seat || !seat.passengers || seat.passengers.length === 0) return;
    const { clientX, clientY } = e;

    closePopups();

    if (seat.passengers.length === 1) {
      setPopupPassenger({
        ...seat.passengers[0],
        route_id: selectedRoute?.id    // ← AICI!
      });
      setPopupSeat(seat);
      setPopupPosition({ x: clientX, y: clientY });
    } else {
      setMultiPassengerOptions({ x: clientX, y: clientY, seat });
    }

  };


  const canApplyReopt = pendingAutoSuggestion?.status === 'needs-reopt';

  // === AUTOSELECT de la zero, pentru N locuri ===
  function autoselectReplace(count) {
    if (!seats?.length || !stops?.length) return;

    const list = selectSeats(seats, boardAt, exitAt, stops, count);
    const ids = list.map((s) => s.id);

    console.log('🔁 AutoselectReplace: ', ids);

    // Actualizează selecția din state-ul tău real:
    setSelectedSeats(list);
  }








  return (

    <div className="min-h-screen bg-gray-300 flex justify-center items-start py-4 sm:py-8 lg:py-10 px-2 sm:px-4 lg:px-6 w-full">
      <Toast message={toastMessage} type={toastType} />


      <ConfirmModal
        show={receiptErrorOpen}
        title="Eroare emitere bon"
        message={(
          <div className="whitespace-pre-line">
            {receiptErrorMsg || 'Nu s-a emis bonul fiscal.'}
          </div>
        )}
        confirmText="OK"
        cancelText="Închide"
        onConfirm={() => setReceiptErrorOpen(false)}
        onCancel={() => setReceiptErrorOpen(false)}
      />


      <div className="w-full max-w-[1700px] space-y-4 sm:space-y-6 mx-auto">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch lg:items-start lg:justify-center">
          <div className="bg-white rounded shadow p-4 w-full lg:w-fit">
            <label className="block font-semibold mb-2">Selectează data:</label>
            <CalendarWrapper selectedDate={selectedDate} setSelectedDate={setSelectedDate} />

          </div>

          <div className="bg-white rounded shadow p-4 space-y-4 w-full lg:w-fit">
            <div className="flex justify-between items-center flex-wrap gap-4">
              {/* Butoane rapide */}
              <div className="flex gap-2">
                {['Azi', 'Mâine', 'Poimâine'].map((label, idx) => {
                  const date = addDays(new Date(), idx);
                  const isActive =
                    format(selectedDate, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd');

                  return (
                    <button
                      key={label}
                      onClick={() => {
                        setSelectedDate(date);
                        //handleSelectSchedule(null);
                        setSelectedSeats([]);
                        setPassengersData({});
                        setSeats([]);
                      }}
                      className={`px-3 py-1 rounded text-sm font-medium transition ${isActive
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-100 text-black hover:bg-blue-200'
                        }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Afișare dată + zi pronunțat */}
              <div className="text-base font-semibold text-gray-800">
                {format(selectedDate, 'EEEE, dd MMMM yyyy', { locale: ro })}
              </div>
            </div>

            <div>


              <RouteSelector
                routes={routesList}
                selectedRoute={selectedRoute}
                onSelectRoute={handleSelectRoute}
              />

            </div>



            {selectedRoute && (
              <div>

                <div className="flex flex-wrap gap-3 mb-6">
                  <HourSelector
                    selectedRoute={selectedRoute}
                    selectedSchedule={selectedSchedule}
                    onSelectSchedule={handleSelectSchedule}
                  />
                </div>

                {selectedHour && (
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex gap-4">
                      <VehicleSelector
                        availableVehicles={availableVehicles}
                        vehicleInfo={vehicleInfo}
                        setVehicleInfo={setVehicleInfo}
                        showPopup={showVehiclePopup}
                        setShowPopup={setShowVehiclePopup}
                        setSelectedSeats={setSelectedSeats}
                        setSeats={setSeats}
                        //setSelectedRoute={setSelectedRoute}
                        tripId={tripId}
                        setToastMessage={setToastMessage}
                        setToastType={setToastType}
                        stops={routeStations.map(s => s.name)}

                      />
                    </div>


                  </div>
                )}

                {blockBannerMessage && (
                  <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {blockBannerMessage}
                  </div>
                )}

                {selectedHour && (
                  <div className="mb-4 flex items-center border-b space-x-4">
                    {tabs.map((tv, idx) => (
                      <div
                        key={tv.trip_vehicle_id}
                        className="flex items-center -mb-px space-x-1"
                      >
                        {/* Tab propriu-zis */}
                        <button
                          onClick={() => setActiveTv(tv.is_primary ? 'main' : tv.trip_vehicle_id)}
                          className={`px-4 py-2 rounded-t-lg text-sm font-medium mr-1 transition-all duration-300
  ${(tabs.length === 1 || activeTv === (tv.is_primary ? 'main' : tv.trip_vehicle_id))
                              ? 'bg-white text-gray-900 border border-b-transparent shadow-md'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200 border border-transparent'
                            }
`}
                        >
                          {tv.is_primary ? 'Principal' : `Dublură ${idx}`}
                        </button>

                        {/* Iconiță Modifică */}
                        <button
                          onClick={() => {
                            setActiveTv(tv.is_primary ? 'main' : tv.trip_vehicle_id);
                            setShowAddVeh(true);
                          }}
                          className="p-1 hover:bg-gray-200 rounded"
                          title="Modifică maşină"
                        >
                          ✏️
                        </button>

                        {/* Iconiță Șterge */}
                        {!tv.is_primary && (
                          <button
                            onClick={() => setConfirmTvToDelete(tv.trip_vehicle_id)}
                            className="p-1 hover:bg-gray-200 rounded"
                            title="Șterge maşină"
                          >
                            ❌
                          </button>
                        )}

                        <ConfirmModal
                          show={confirmTvToDelete === tv.trip_vehicle_id}
                          title="Confirmare ștergere"
                          message="Ești sigur că vrei să ștergi această mașină?"
                          onCancel={() => setConfirmTvToDelete(null)}
                          onConfirm={async () => {
                            const id = confirmTvToDelete;
                            setConfirmTvToDelete(null);

                            // 1) DELETE
                            const res = await fetch(
                              `/api/trips/${id}`,
                              { method: 'DELETE' }
                            );
                            const json = await res.json();
                            if (!res.ok) {
                              console.error('DELETE trip vehicle error', res.status, json);
                              setToastMessage(json.error);
                              setToastType('error');
                              setTimeout(() => setToastMessage(''), 3000);
                              return;
                            }

                            // 2) Toast de succes
                            setToastMessage('Mașina a fost ștearsă cu succes');
                            setToastType('success');
                            setTimeout(() => setToastMessage(''), 3000);

                            // 3) Refresh lista și seat-map
                            await fetchTripVehicles(tripId);
                            setActiveTv(prev => (prev === id ? 'main' : prev));
                          }}
                        />





                      </div>
                    ))}



                    {/* Butonul “Adaugă maşină” rămâne la fel */}
                    <button
                      onClick={() => {
                        setActiveTv(null);
                        setShowAddVeh(true);
                      }}
                      className="
    ml-4 
    flex-shrink-0 
    w-10 h-10 
    bg-green-500 hover:bg-green-600 
    text-white 
    rounded-full 
    flex items-center justify-center 
    shadow-md 
    transition-transform duration-150 
    hover:scale-110
  "
                      title="Adaugă mașină"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-7 h-7"
                        viewBox="0 0 36 36"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path
                          d="M6 6v6m-3-3h6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12 12.5h18a3 3 0 0 1 3 3v8.5a2 2 0 0 1-2 2h-1v1.5a1.5 1.5 0 0 1-1.5 1.5H27"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12 24.5h-1.5A2.5 2.5 0 0 1 8 22v-9a3 3 0 0 1 3-3h1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path d="M15 14h6M23 14h4" strokeLinecap="round" />
                        <circle cx="16" cy="27" r="2" fill="currentColor" stroke="none" />
                        <circle cx="26" cy="27" r="2" fill="currentColor" stroke="none" />
                      </svg>
                    </button>
                  </div>
                )}





              </div>
            )}
          </div>





        </div>

        {selectedHour && (
          isLoadingSeats ? (
            <div style={{ padding: 40, textAlign: "center", fontSize: 22 }}>
              Se încarcă harta locurilor...
            </div>
          ) : seats.length > 0 && (
            <div className="bg-white rounded shadow p-3 sm:p-4 flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch lg:items-start w-full lg:w-fit mx-auto relative">
              {isMobileViewport && (
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setMobileWorkspaceTab('map')}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${mobileWorkspaceTab === 'map'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-700 hover:bg-white'
                      }`}
                  >
                    Hartă locuri
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileWorkspaceTab('passengers')}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${mobileWorkspaceTab === 'passengers'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-700 hover:bg-white'
                      }`}
                  >
                    Date pasageri
                  </button>
                </div>
              )}

              {/* Harta locurilor */}
              <div className={`${isMobileViewport && mobileWorkspaceTab !== 'map' ? 'hidden' : 'block'} w-full lg:w-auto`}>
                <div className="flex flex-wrap items-center gap-3 mb-3">

                  <div className="inline-flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setSeatViewMode((prevMode) => {
                          const nextMode = prevMode === 'grid' ? 'timeline' : 'grid';
                          setIsTimelineModalOpen(nextMode === 'timeline');
                          return nextMode;
                        });
                      }}
                      className="px-3 py-1 rounded-full text-xs font-semibold border transition-colors bg-blue-600 text-white border-blue-600"
                      title={
                        seatViewMode === 'timeline'
                          ? 'Vezi rezervările pe axa stațiilor'
                          : 'Vezi diagrama clasică a locurilor'
                      }
                    >
                      {seatViewMode === 'timeline' ? 'Timeline' : 'Diagramă'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isGridViewActive) return;
                        setIsWideView((prev) => !prev);
                      }}
                      disabled={!isGridViewActive}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${isWideView
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                        } ${!isGridViewActive ? 'opacity-60 cursor-not-allowed' : ''}`}
                      title="Mărește lățimea locurilor din diagramă pentru a vedea toate detaliile"
                    >
                      {isWideView ? 'Larg' : 'Îngust'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!isGridViewActive) return;
                        setShowSeatTextSettings((prev) => !prev);
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${showSeatTextSettings
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                        } ${!isGridViewActive ? 'opacity-60 cursor-not-allowed' : ''}`}
                      title="Reglează dimensiunea și culoarea textelor din diagramă"
                    >
                      Text
                    </button>


                    {isWideView && (
                      <button
                        type="button"
                        onClick={() => setShowWideSeatControls((prev) => !prev)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${showWideSeatControls
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                          }`}
                        title="Afișează sau ascunde controalele pentru dimensiunea locurilor"
                      >
                        {showWideSeatControls ? 'Ascunde dimensiuni' : 'Dimensiune locuri'}
                      </button>
                    )}
                  </div>
                  <div className="inline-flex items-center gap-2 flex-wrap ml-auto">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={showSeatObservations}
                        onChange={(e) => setShowSeatObservations(e.target.checked)}
                      />
                      Obs.
                    </label>
                    <button
                      type="button"
                      onClick={() => handleSeatMapExport(currentDriverName)}
                      disabled={exportButtonsDisabled}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${exportButtonsDisabled
                        ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed opacity-70'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                        }`}
                      title="Descarcă diagrama în format imagine PNG"
                      aria-busy={isExportingSeatMap}
                    >
                      {isExportingSeatMap ? 'Se pregătește PNG…' : 'Export PNG'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSeatMapPrint(currentDriverName)}
                      disabled={exportButtonsDisabled}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${exportButtonsDisabled
                        ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed opacity-70'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                        }`}
                      title="Tipărește diagrama în format alb-negru"
                      aria-busy={isExportingSeatMap}
                    >
                      {isExportingSeatMap ? 'Se pregătește tipărirea…' : 'Print diagramă'}
                    </button>
                  </div>
                </div>
                {vehicleInfo && (
                  <div className="text-sm text-gray-700 mb-2 font-semibold text-center">
                    Vehicul: {vehicleInfo.name} ({vehicleInfo.plate})
                  </div>
                )}
                {seats.length > 0 && seatViewMode === 'grid' && (
                  <div className="relative inline-block w-full">
                    {isWideView && showWideSeatControls && (
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 bg-white border border-gray-200 shadow-lg rounded-lg px-4 py-3 flex flex-col gap-3 w-64 text-xs">
                        <div className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide text-center">
                          Dimensiune locuri
                        </div>

                        <div>
                          <label className="block mb-1 text-[11px] text-gray-700">
                            Lățime loc ({wideSeatSize.width}px)
                          </label>
                          <input
                            type="range"
                            min="130"
                            max="360"
                            step="5"
                            value={wideSeatSize.width}
                            onChange={(e) =>
                              setWideSeatSize((prev) => ({
                                ...prev,
                                width: Number(e.target.value),
                              }))
                            }
                            className="w-full"
                          />
                        </div>

                        <div>
                          <label className="block mb-1 text-[11px] text-gray-700">
                            Înălțime loc ({wideSeatSize.height}px)
                          </label>
                          <input
                            type="range"
                            min="100"
                            max="260"
                            step="5"
                            value={wideSeatSize.height}
                            onChange={(e) =>
                              setWideSeatSize((prev) => ({
                                ...prev,
                                height: Number(e.target.value),
                              }))
                            }
                            className="w-full"
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-gray-500">
                            Curent: {wideSeatSize.width}×{wideSeatSize.height}
                          </span>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setWideSeatSize({ width: 260, height: 150 })}
                              className="px-2 py-1 text-[11px] rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
                            >
                              Reset
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowWideSeatControls(false)}
                              className="px-2 py-1 text-[11px] rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
                            >
                              Închide
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {isMobileViewport ? (
                      <div className={`relative ${isWideView ? (showWideSeatControls ? 'pt-20' : 'pt-12') : ''}`}>
                        <div className="mb-2 flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => zoomSeatMap(-0.2)}
                            className="px-2 py-1 text-xs rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                          >
                            −
                          </button>
                          <button
                            type="button"
                            onClick={resetSeatMapViewport}
                            className="px-2 py-1 text-xs rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                          >
                            Reset zoom
                          </button>
                          <button
                            type="button"
                            onClick={() => zoomSeatMap(0.2)}
                            className="px-2 py-1 text-xs rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                          >
                            +
                          </button>
                        </div>

                        <div
                          ref={mobileSeatMapViewportRef}
                          className="overflow-hidden rounded-lg border border-gray-200 bg-gray-100 touch-none h-[52vh] min-h-[300px]"
                          onTouchStart={handleSeatMapTouchStart}
                          onTouchMove={handleSeatMapTouchMove}
                          onTouchEnd={handleSeatMapTouchEnd}
                          onTouchCancel={handleSeatMapTouchEnd}
                        >
                          <div
                            style={{
                              transform: `translate(${seatMapPan.x}px, ${seatMapPan.y}px) scale(${seatMapZoom})`,
                              transformOrigin: 'top left',
                              transition: 'transform 80ms linear',
                            }}
                          >
                            <SeatMap
                              ref={seatMapRef}
                              seats={seats}
                              stops={stops}
                              selectedSeats={selectedSeats}
                              setSelectedSeats={setSelectedSeats}
                              moveSourceSeat={moveSourceSeat}
                              setMoveSourceSeat={setMoveSourceSeat}
                              popupPassenger={popupPassenger}
                              setPopupPassenger={setPopupPassenger}
                              popupSeat={popupSeat}
                              setPopupSeat={setPopupSeat}
                              popupPosition={popupPosition}
                              setPopupPosition={setPopupPosition}
                              handleMovePassenger={handleMovePassenger}
                              handleSeatClick={handleSeatClick}
                              toggleSeat={toggleSeat}
                              isSeatFullyOccupiedViaSegments={isSeatFullyOccupiedViaSegments}
                              checkSegmentOverlap={checkSegmentOverlap}
                              selectedRoute={selectedRoute}
                              setToastMessage={setToastMessage}
                              setToastType={setToastType}
                              driverName={currentDriverName}
                              intentHolds={intentHolds}
                              vehicleId={
                                tabs.find(tv => tv.trip_vehicle_id === activeTv)?.vehicle_id
                              }
                              isWideView={isWideView}
                              wideSeatSize={wideSeatSize}
                              showObservations={showSeatObservations}
                              seatTextSize={effectiveSeatTextSize}
                              seatTextColor={effectiveSeatTextColor}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className={`overflow-auto ${isWideView ? (showWideSeatControls ? 'pt-20' : 'pt-12') : ''}`}>
                        <SeatMap
                          ref={seatMapRef}
                          seats={seats}
                          stops={stops}
                          selectedSeats={selectedSeats}
                          setSelectedSeats={setSelectedSeats}
                          moveSourceSeat={moveSourceSeat}
                          setMoveSourceSeat={setMoveSourceSeat}
                          popupPassenger={popupPassenger}
                          setPopupPassenger={setPopupPassenger}
                          popupSeat={popupSeat}
                          setPopupSeat={setPopupSeat}
                          popupPosition={popupPosition}
                          setPopupPosition={setPopupPosition}
                          handleMovePassenger={handleMovePassenger}
                          handleSeatClick={handleSeatClick}
                          toggleSeat={toggleSeat}
                          isSeatFullyOccupiedViaSegments={isSeatFullyOccupiedViaSegments}
                          checkSegmentOverlap={checkSegmentOverlap}
                          selectedRoute={selectedRoute}
                          setToastMessage={setToastMessage}
                          setToastType={setToastType}
                          driverName={currentDriverName}
                          intentHolds={intentHolds}
                          vehicleId={
                            tabs.find(tv => tv.trip_vehicle_id === activeTv)?.vehicle_id
                          }
                          isWideView={isWideView}
                          wideSeatSize={wideSeatSize}
                          showObservations={showSeatObservations}
                          seatTextSize={effectiveSeatTextSize}
                          seatTextColor={effectiveSeatTextColor}
                        />
                      </div>
                    )}

                      {showSeatTextSettings && (
                        <div className="absolute top-2 right-2 z-30 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
                          <div className="font-semibold text-gray-800 mb-2">
                            Setări text diagramă
                          </div>

                          <div className="mb-1 text-[10px] text-gray-500">
                            Mod curent: <span className="font-semibold">{isWideView ? 'Vedere largă' : 'Vedere îngustă'}</span>
                          </div>

                          <div className="mb-3">
                            <label className="block mb-1 text-[11px] text-gray-700">
                              Dimensiune text ({effectiveSeatTextSize}px)
                            </label>
                            <input
                              type="range"
                              min="8"
                              max="26"
                              value={effectiveSeatTextSize}
                              onChange={(e) => handleSeatTextSizeChange(Number(e.target.value))}
                              className="w-full"
                            />
                          </div>

                          <div className="mb-3">
                            <label className="block mb-1 text-[11px] text-gray-700">
                              Culoare text
                            </label>
                            <input
                              type="color"
                              value={effectiveSeatTextColor}
                              onChange={(e) => handleSeatTextColorChange(e.target.value)}
                              className="w-16 h-8 p-0 border border-gray-300 rounded cursor-pointer"
                            />
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setShowSeatTextSettings(false)}
                              className="px-2 py-1 text-[11px] rounded border border-gray-300 text-gray-700 hover:bg-gray-100"
                            >
                              Închide
                            </button>
                          </div>
                        </div>
                      )}


                    </div>
                )}



              </div>

              {/* Formulare pasageri */}
              <div className={`${isMobileViewport && mobileWorkspaceTab !== 'passengers' ? 'hidden' : 'block'} space-y-4 w-full lg:max-w-md lg:min-w-[420px]`}>
                <div className="flex justify-between items-center">
                  <div className="font-semibold">Completează datele pasagerilor:</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAutoAddPassengers(1)}
                      className="w-10 h-10 flex items-center justify-center rounded-full text-white transition-colors bg-green-500 hover:bg-green-600"
                      title="Adaugă automat un loc"
                      aria-label="Adaugă automat un loc"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-6 h-6"
                        viewBox="0 0 32 32"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path d="M6 6v6m-3-3h6" strokeLinecap="round" strokeLinejoin="round" />
                        <path
                          d="M14 7h8a2 2 0 0 1 2 2v8h2.5a1.5 1.5 0 0 1 1.5 1.5v6.5h-2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M14 7a4 4 0 0 0-4 4v5h-1.5A1.5 1.5 0 0 0 7 17.5V25h3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path d="M12 16h10v7.5a2.5 2.5 0 0 1-2.5 2.5H13a2 2 0 0 1-2-2v-8" strokeLinecap="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={handleRedistributeSelectedSeats}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${canApplyReopt
                        ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
                        : 'bg-gray-200 text-gray-600 border-gray-300 cursor-not-allowed'
                        }`}
                      title={
                        canApplyReopt
                          ? 'Rearanjează locurile selectate folosind logica de autoselecție'
                          : 'Reoptimizarea devine disponibilă după ce locurile adăugate automat au segmente valide și există o propunere mai bună.'
                      }
                      disabled={!canApplyReopt}
                    >
                      Rearanjează locurile
                    </button>
                  </div>
                </div>

                {pendingAutoSuggestion?.status === 'needs-reopt' && (
                  <div className="mt-2 text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded px-3 py-2 space-y-1">
                    <div className="font-medium">
                      Reoptimizare disponibilă pentru locurile adăugate automat.
                      {Array.isArray(pendingAutoSuggestion.segments) && pendingAutoSuggestion.segments.length > 0 && (
                        <span>
                          {' '}Segmente vizate:{' '}
                          {pendingAutoSuggestion.segments.map((segment, idx) => (
                            <span key={`${segment.board || 'board'}-${segment.exit || 'exit'}-${idx}`}>
                              <span className="font-semibold">{segment.board}</span> →{' '}
                              <span className="font-semibold">{segment.exit}</span>
                              {idx < pendingAutoSuggestion.segments.length - 1 ? ', ' : '.'}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    {Array.isArray(pendingAutoSuggestion.moves) && pendingAutoSuggestion.moves.length > 0 && (
                      <ul className="list-disc list-inside space-y-0.5">
                        {pendingAutoSuggestion.moves.map((move, idx) => {
                          const from = move?.fromLabel || null;
                          const to = move?.toLabel || null;
                          const segmentBoard = move?.board || null;
                          const segmentExit = move?.exit || null;
                          const segmentText = segmentBoard && segmentExit ? ` (${segmentBoard} → ${segmentExit})` : '';
                          let text = '';
                          if (from && to) {
                            text = `Loc ${from} → ${to}${segmentText}`;
                          } else if (from && !to) {
                            text = `Locul ${from} va fi eliberat${segmentText}`;
                          } else if (!from && to) {
                            text = `Se ocupă locul ${to}${segmentText}`;
                          } else {
                            text = segmentText
                              ? `Locurile vor fi reasociate automat${segmentText}`
                              : 'Locurile vor fi reasociate automat';
                          }
                          return (
                            <li key={`${from || 'from'}-${to || 'to'}-${segmentBoard || 'board'}-${segmentExit || 'exit'}-${idx}`}>
                              {text}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div>
                      Apasă „Rearanjează locurile” pentru a aplica propunerea fără a pierde datele introduse.
                    </div>
                  </div>
                )}

                {selectedSeats.map((seat, index) => (
                  <div
                    key={seat.id + "-" + index}
                    data-seat={seat.id}
                    className={`passenger-form border p-4 bg-gray-50 rounded space-y-2 ${shake ? 'animate-shake' : ''
                      }`}
                  >

                    <div className="flex gap-4">



                      <PassengerForm
                        seat={seat}
                        stops={stops}
                        stopDetailsByName={stopDetailsByName}
                        passengersData={passengersData}
                        setPassengersData={setPassengersData}
                        selectedRoute={selectedRoute}
                        selectedSeats={selectedSeats}
                        setSelectedSeats={setSelectedSeats}
                        autoSelectEnabled={autoSelectEnabled}
                        fetchPrice={fetchPrice}
                        setToastMessage={setToastMessage}
                        setToastType={setToastType}
                        toggleSeat={toggleSeat}
                        seats={seats}
                        selectedDate={format(selectedDate, 'yyyy-MM-dd')}
                        selectedHour={selectedHour}
                        selectedScheduleId={selectedScheduleId}
                        selectedDirection={effectiveDirection}
                        onConflictInfo={handleConflictInfoUpdate}
                        onBlacklistInfo={setBlacklistInfo}
                        getStationIdByName={getStationIdByName}
                        getStationNameById={getStationNameById}

                      />


                    </div>



                    <div className="h-1 flex justify-end items-center">
                      <button
                        type="button"
                        className="text-blue-600 text-xl font-bold hover:text-blue-800"
                        onClick={() =>
                          setNotesVisibility((prev) => ({
                            ...prev,
                            [seat.id]: !prev[seat.id],
                          }))
                        }
                        title="Adaugă observații"
                      >
                        {notesVisibility[seat.id] ? '−' : '+'}
                      </button>
                    </div>

                    {notesVisibility[seat.id] && (
                      <textarea
                        className="w-full border p-2 rounded"
                        placeholder="Observații"
                        value={passengersData[seat.id]?.observations || ''}
                        onChange={(e) =>
                          setPassengersData((prev) => ({
                            ...prev,
                            [seat.id]: {
                              ...prev[seat.id],
                              observations: e.target.value,
                            },
                          }))
                        }
                      />


                    )}



                    <div className="flex items-center mb-2 gap-4">
                      <div className="flex items-center gap-2">
                        <label className="font-medium whitespace-nowrap">Categorie:</label>
                        <select
                          className="border rounded px-2 py-1 text-sm"
                          value={passengersData[seat.id]?.category_id ?? defaultPricingCategoryId ?? ''}
                          onChange={e => {
                            const catId = e.target.value ? Number(e.target.value) : null;
                            setPassengersData(prev => ({
                              ...prev,
                              [seat.id]: {
                                ...prev[seat.id],
                                category_id: catId
                              }
                            }));
                            // forțăm re-fetch price
                            setPricePerSeat(prev => ({ ...prev, [seat.id]: null }));
                          }}
                          disabled={effectivePricingCategories.length === 0}
                        >
                          {effectivePricingCategories.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="font-medium whitespace-nowrap">Tip:</label>
                        <select
                          className="border rounded px-2 py-1 text-sm"
                          style={{ minWidth: 140, maxWidth: 180 }}
                          value={passengersData[seat.id]?.discount_type_id || ''}
                          onChange={e =>
                            setPassengersData(prev => ({
                              ...prev,
                              [seat.id]: {
                                ...prev[seat.id],
                                discount_type_id: e.target.value ? Number(e.target.value) : null
                              }
                            }))
                          }
                        >
                          <option value="">Fără reducere</option>
                          {routeDiscounts.map(d => {
                            const v = parseFloat(d.discount_value);
                            const suffix = d.discount_type === 'percent' ? '%' : ' lei';
                            return (
                              <option key={d.id} value={d.id}>
                                {d.label} ({v}{suffix})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>










                    <div className="mb-2 flex flex-wrap items-end gap-3">
                      <span className="font-medium">
                        Preț:
                        {(() => {
                          const price = pricePerSeat[seat.id];
                          if (typeof price !== 'number') return ' N/A';

                          const discId = passengersData[seat.id]?.discount_type_id;
                          const disc = routeDiscounts.find(d => d.id === discId);
                          if (!disc) {
                            return ` ${price.toFixed(2)} lei`;
                          }

                          const val = parseFloat(disc.discount_value);
                          let raw = 0;
                          if (disc.discount_type === 'percent') {
                            raw = price * (1 - val / 100);
                          } else {
                            raw = price - val;
                          }

                          // clamp la zero
                          const finalPrice = Math.max(raw, 0);

                          return (
                            <>
                              {' '}
                              <s>{price.toFixed(2)} lei</s>
                              <span className="ml-2 text-green-700 font-bold">
                                {finalPrice.toFixed(2)} lei
                              </span>
                              {raw < 0 && (
                                <span className="ml-2 text-red-600 font-semibold">
                                  Reducere prea mare, preț setat la 0
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </span>

                      {index === 0 && (
                        <div className="ml-auto flex flex-col items-end gap-1 text-right">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                            Cod reducere
                          </span>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <input
                              className={`w-24 border border-gray-300 rounded px-3 py-1 text-sm
  text-gray-700 placeholder-gray-400
  focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200
  disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed
`}

                              value={promoCode}
                              onChange={(e) => setPromoCode(e.target.value)}
                              placeholder=""
                              disabled={!!promoApplied}

                            />
                            <button
                              type="button"
                              disabled={
                                isPromoValidating ||
                                (!promoApplied && promoCode.trim() === '')
                              }
                              onClick={promoApplied ? handleRemovePromo : handleApplyPromo}
                              className={`px-2 py-1 rounded text-white transition ${promoApplied
                                ? 'bg-red-500 hover:bg-red-600'
                                : promoCode.trim() === ''
                                  ? 'bg-gray-400 cursor-not-allowed'
                                  : 'bg-blue-500 hover:bg-blue-600'
                                }`}
                            >
                              {promoApplied ? 'Șterge' : 'Aplică'}
                            </button>


                          </div>
                          {promoApplied && (
                            <div className="flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
                              −{promoApplied.discount_amount} lei ({promoApplied.code})
                            </div>
                          )}

                        </div>
                      )}

                    </div>







                    <div className="mt-2">
                      <label className="text-sm font-medium">Modalitate de plată:</label>
                      <div className="flex gap-4 mt-1">
                        <label>
                          <input
                            type="radio"
                            name={`payment_${seat.id}`}
                            value="none"
                            checked={passengersData[seat.id]?.payment_method === 'none'}
                            onChange={() =>
                              setPassengersData((prev) => ({
                                ...prev,
                                [seat.id]: {
                                  ...prev[seat.id],
                                  payment_method: 'none',
                                },
                              }))
                            }
                          />
                          <span className="ml-1">Doar rezervare</span>
                        </label>

                        <label>
                          <input
                            type="radio"
                            name={`payment_${seat.id}`}
                            value="cash"
                            checked={passengersData[seat.id]?.payment_method === 'cash'}
                            onChange={() =>
                              setPassengersData((prev) => ({
                                ...prev,
                                [seat.id]: {
                                  ...prev[seat.id],
                                  payment_method: 'cash',
                                },
                              }))
                            }
                          />
                          <span className="ml-1">Cash</span>
                        </label>

                        <label>
                          <input
                            type="radio"
                            name={`payment_${seat.id}`}
                            value="card"
                            checked={passengersData[seat.id]?.payment_method === 'card'}
                            onChange={() =>
                              setPassengersData((prev) => ({
                                ...prev,
                                [seat.id]: {
                                  ...prev[seat.id],
                                  payment_method: 'card',
                                },
                              }))
                            }
                          />
                          <span className="ml-1">Card</span>
                        </label>
                      </div>


                    </div>














                    {passengersData[seat.id]?.reservation_id && (
                      <div className="flex justify-end pt-2">
                        <button
                          onClick={() => {
                            setPassengersData((prev) => {
                              const updated = { ...prev };
                              delete updated[seat.id];
                              return updated;
                            });

                            setSelectedSeats((prev) =>
                              prev.filter((s) => s.id !== seat.id)
                            );
                            setPromoCode('');
                            setPromoApplied(null);
                          }}
                          className="text-sm text-red-600 hover:underline"
                        >
                          Renunță la editare
                        </button>
                      </div>
                    )}


                  </div>
                ))}

                {/* Total de plată */}
                {selectedSeats.length > 0 && (
                  <div className="py-3 text-lg font-semibold text-green-700 text-right">
                    Total de plată: {getTotalToPay()} lei
                  </div>
                )}

                {selectedSeats.length > 0 && (
                  <div className="flex w-full pt-4" style={{
                    justifyContent: selectedSeats.length > 1 ? "space-between" : "flex-end"
                  }}>







                    {selectedSeats.length > 1 && (
                      <button
                        onClick={handleCopyPassengerData}
                        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
                      >
                        Copie datele
                      </button>
                    )}

                    <button
                      onClick={handleStartSave}
                      disabled={isSaving || boardingStarted || blockNewReservations || globalPaymentLock}

                      title={
                        globalPaymentLock
                          ? 'Există o tranzacție în curs.'
                          : blockNewReservations
                            ? 'Nu poți salva rezervări pentru curse care au plecat deja.'
                            : boardingStarted
                              ? 'Îmbarcarea a început – nu se mai pot salva rezervări noi.'
                              : undefined
                      }

                      className={`px-6 py-2 rounded text-white transition ${(isSaving || boardingStarted || blockNewReservations || globalPaymentLock)

                        ? 'bg-gray-300 cursor-not-allowed text-gray-600'
                        : 'bg-green-600 hover:bg-green-700'
                        }`}
                    >
                      {isSaving ? 'Se salvează…' : 'Salvează rezervarea'}
                    </button>
                  </div>
                )}




              </div>





              <ConfirmModal

                show={showConflictModal}
                title="Rezervări conflictuale"
                message={`Mai există ${conflictCount} ${rezervareWord} (în aceeași zi):`}
                cancelText="Renunță"
                confirmText="Continuă"
                onCancel={() => setShowConflictModal(false)}
                onConfirm={() => {
                  setShowConflictModal(false);
                  submitReservation();
                }}
              >
                <ul className="space-y-2">
                  {(conflictInfo ?? []).map(c => (
                    <li key={c.id} className="flex justify-between items-center text-sm whitespace-nowrap">
                      <span className="whitespace-nowrap">
                        +         {c.route} • {c.time.slice(0, 5)} • {c.board_at}→{c.exit_at}
                      </span>
                      <button
                        onClick={async () => {
                          // confirmare nativă
                          if (!window.confirm('Ești sigur că vrei să ștergi această rezervare conflictuală?')) {
                            return;
                          }
                          try {
                            const res = await fetch(
                              `/api/reservations/${c.id}`,
                              { method: 'DELETE' }
                            );
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || 'Eroare la ștergere');
                            // actualizează lista
                            setConflictInfo(prev => prev.filter(x => x.id !== c.id));
                            if (conflictInfo.length === 1) setShowConflictModal(false);
                            // feedback
                            setToastMessage('Rezervare conflictuală ștearsă');
                            setToastType('success');
                          } catch (err) {
                            setToastMessage(err.message);
                            setToastType('error');
                          } finally {
                            setTimeout(() => setToastMessage(''), 3000);
                          }
                        }}
                        className="px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 ml-4"
                      >
                        Șterge
                      </button>
                    </li>
                  ))}
                </ul>
              </ConfirmModal>

              <ConfirmModal
                show={showBlacklistModal && blacklistInfo !== null}
                title="Avertisment: Blacklist"
                cancelText="Renunță"
                confirmText="Continuă"
                onCancel={() => setShowBlacklistModal(false)}
                onConfirm={() => {
                  setShowBlacklistModal(false);
                  handleSaveReservation();
                }}
              >
                <div className="text-sm space-y-2">
                  <p><strong>Telefon:</strong> {blacklistInfo?.phone || '-'}</p>
                  <p><strong>Motiv:</strong> {blacklistInfo?.reason || '-'}</p>
                  <p>
                    <strong>Adăugat la:</strong>{' '}
                    {blacklistInfo?.created_at
                      ? new Date(blacklistInfo.created_at).toLocaleDateString()
                      : '-'}
                  </p>
                  <p>Chiar vrei să continui?</p>
                </div>
              </ConfirmModal>










            </div>
          )
        )}

      </div>

      {multiPassengerOptions && (
        <MultiPassengerPopup
          x={multiPassengerOptions.x}
          y={multiPassengerOptions.y}
          seat={multiPassengerOptions.seat}
          selectedRoute={selectedRoute}
          onSelect={(passenger) => {
            setPopupPassenger({
              ...selectedPassenger,
              route_id: selectedRoute?.id,  // <-- adaugi route_id direct aici!
            });
            setPopupSeat(multiPassengerOptions.seat);
            setPopupPosition({ x: multiPassengerOptions.x, y: multiPassengerOptions.y });
            setMultiPassengerOptions(null);
          }}
          onClose={() => setMultiPassengerOptions(null)}
        />
      )}

      {popupPassenger && popupPosition && (
        <PassengerPopup
          // poziționare popup
          x={popupPosition.x}
          y={popupPosition.y}

          // datele pasagerului și locul
          passenger={popupPassenger}
          seat={popupSeat}

          // data și ora curentă pentru filtrare
          selectedDate={selectedDate}
          selectedHour={selectedHour}
          originalRouteId={selectedRoute?.id}

          // contextul rezervării

          tripId={tripId}

          // toast-uri
          showToast={showToast}
          stops={routeStations.map(s => s.name)}

          // acțiuni standard
          onDelete={() => handleDeletePassenger(popupPassenger)}
          onMove={() => {
            setMoveSourceSeat(popupSeat);
            closePopups();
            setToastMessage('Selectează un loc pentru mutare');
            setToastType('info');
          }}


          onPayCash={handlePayReservation}
          onPayCard={handlePayReservationCard}
          onRefundCard={handleRefundReservationCard}
          onRetryReceipt={handleRetryReceipt}

          globalPaymentLock={globalPaymentLock}


          onEdit={({ pricing, discounts } = {}) => {
            console.log('PassengerPopup onEdit – popupSeat:', popupSeat.label);
            const seatId = popupSeat.id;

            // Găsim reducerea de tip (pensionar, elev etc.)
            const typeDiscount = Array.isArray(discounts)
              ? discounts.find(d => d.discount_type_id != null)
              : null;

            // Găsim promo-ul
            const promoDiscount = Array.isArray(discounts)
              ? discounts.find(d => d.promo_code_id != null)
              : null;

            setSelectedSeats([popupSeat]);

            setPassengersData({
              [seatId]: {
                name: popupPassenger.name,
                phone: popupPassenger.phone,
                board_at: popupPassenger.board_at,
                exit_at: popupPassenger.exit_at,
                observations: popupPassenger.observations || '',
                reservation_id: popupPassenger.reservation_id || null,
                version: popupPassenger.version ?? null,
                discount_type_id: typeDiscount?.discount_type_id ?? null,
              },
            });

            // Setăm promo-ul dacă există
            if (promoDiscount) {
              setPromoCode(promoDiscount.promo_code || '');
              setPromoApplied({
                promo_code_id: promoDiscount.promo_code_id,
                code: promoDiscount.promo_code || '',
                discount_amount: promoDiscount.discount_amount,
              });
            } else {
              setPromoCode('');
              setPromoApplied(null);
            }

            // Setăm prețul net salvat


            closePopups();
          }}

          // mutare pe altă cursă
          onMoveToOtherTrip={() => {
            closePopups();
            setMoveToOtherTripData({
              passenger: popupPassenger,
              reservation_id: popupPassenger.reservation_id,
              fromSeat: popupSeat,
              boardAt: popupPassenger.board_at,
              exitAt: popupPassenger.exit_at,
              originalTime: selectedHour,
              originalRouteId: selectedRoute?.id,
              originalDate: selectedDate,
              originalScheduleId: selectedScheduleId,
              originalDirection: effectiveDirection,
              originalSchedule: selectedSchedule,
            });
            setShowMoveToOtherTrip(true);
          }}

          // închidere
          onClose={closePopups}
        />
      )}








      {multiPassengerOptions && (
        <MultiPassengerPopup
          x={multiPassengerOptions.x}
          y={multiPassengerOptions.y}
          seat={multiPassengerOptions.seat}
          onSelect={(passenger) => {
            setPopupPassenger({
              ...passenger,
              route_id: selectedRoute?.id  // ASTA ERA CHEIA!
            });
            setPopupSeat(multiPassengerOptions.seat);
            setPopupPosition({
              x: multiPassengerOptions.x,
              y: multiPassengerOptions.y
            });
            setMultiPassengerOptions(null);
          }}
          onClose={() => setMultiPassengerOptions(null)}
        />
      )}

      {showMoveToOtherTrip && (
        <MoveToOtherTripPanel
          moveToOtherTripData={moveToOtherTripData}
          stops={stops}

          // 📌 callback care reîncarcă seats pentru CURSA ORIGINALĂ
          onClose={async () => {
            setShowMoveToOtherTrip(false);
            setMoveToOtherTripData(null);
            if (!hasActiveSchedule) return;
            const tv = tripVehicles.find(tv => tv.trip_vehicle_id === activeTv);
            const vehicleId = tv ? tv.vehicle_id : selectedTrip.vehicle_id;
            const firstStopId = getStationIdByName(stops[0]);
            const lastStopId = getStationIdByName(stops.slice(-1)[0]);
            try {
              const res = await fetch(
                `/api/seats/${vehicleId}` +
                `?route_id=${selectedRoute.id}` +
                `&route_schedule_id=${selectedScheduleId}` +
                `&date=${format(selectedDate, 'yyyy-MM-dd')}` +
                (selectedHour ? `&time=${encodeURIComponent(selectedHour)}` : '') +
                `&board_station_id=${firstStopId}` +
                `&exit_station_id=${lastStopId}` +
                (effectiveDirection ? `&direction=${effectiveDirection}` : '')
              );
              const data = await res.json();
              setSeats(hydrateSeatPayload(data));
            } catch (err) {
              console.error('Eroare la reîncărcare seat-map:', err);
            }
          }}

          // 📌 callback care reîncarcă seats pentru CURSA NOUĂ
          onMoveSuccess={async ({ tripId, vehicleId, routeId, date, hour, schedule }) => {
            try {
              let matchedSchedule = schedule;
              if (!matchedSchedule && typeof hour === 'string') {
                const fallbackRoute = routesList.find(r => r.id === routeId);
                matchedSchedule = fallbackRoute?.schedules?.find((s) => s.departure === hour) || null;
              }

              const stationParams = new URLSearchParams();
              if (matchedSchedule?.scheduleId) {
                stationParams.set('route_schedule_id', matchedSchedule.scheduleId);
              } else if (matchedSchedule?.direction) {
                stationParams.set('direction', matchedSchedule.direction);
              }
              const stationQuery = stationParams.toString();

              const stationsRes = await fetch(`/api/routes/${routeId}/stations${stationQuery ? `?${stationQuery}` : ''}`);
              const stations = await stationsRes.json();
              const sortedStations = Array.isArray(stations)
                ? [...stations].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
                : [];
              const firstStationId = sortedStations[0]?.station_id ?? null;
              const lastStationId = sortedStations[sortedStations.length - 1]?.station_id ?? null;
              if (firstStationId === null || lastStationId === null) {
                console.error('Stațiile rutei mutate lipsesc.');
                return;
              }

              const seatsRes = await fetch(
                `/api/seats/${vehicleId}` +
                `?route_id=${routeId}` +
                (matchedSchedule?.scheduleId ? `&route_schedule_id=${matchedSchedule.scheduleId}` : '') +
                `&date=${format(date, 'yyyy-MM-dd')}` +
                (hour ? `&time=${hour}` : '') +
                `&board_station_id=${firstStationId}` +
                `&exit_station_id=${lastStationId}` +
                (matchedSchedule?.direction ? `&direction=${matchedSchedule.direction}` : '')
              );
              const data = await seatsRes.json();
              const route = routesList.find(r => r.id === routeId) || null;
              setSelectedRoute(route);
              setSelectedDate(date);
              handleSelectSchedule(matchedSchedule || hour);
              setSeats(hydrateSeatPayload(data));
            } catch (err) {
              console.error('Eroare la fetch cursă nouă:', err);
            }
          }}
        />
      )}


      {isTimelineModalOpen && (
        <div
          className="fixed inset-0 z-[2000] flex flex-col bg-slate-900/80 backdrop-blur-sm"
          onClick={() => {
            setIsTimelineModalOpen(false);
            setSeatViewMode('grid');
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex h-full flex-col"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 px-6 pt-6">
              <div className="text-white text-lg font-semibold tracking-wide">
                Timeline rezervări ({stops[0] || '—'} → {stops[stops.length - 1] || '—'})
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsTimelineModalOpen(false);
                  setSeatViewMode('grid');
                }}
                className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                Închide
              </button>
            </div>

            <div className="flex-1 overflow-auto px-6 pb-8 pt-4">
              <div className="mx-auto min-h-full w-full">
                <div className="rounded-3xl bg-white p-6 shadow-2xl">
                  <SeatTimeline seats={seats} stops={stops} intentHolds={intentHolds} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      <AddVehicleModal
        tripId={tripId}
        show={showAddVeh}
        onClose={() => setShowAddVeh(false)}

        existingVehicleIds={
          // excludem absolut toate vehiculele deja alocate (principal + dubluri)
          tabs.map(t => t.vehicle_id)
        }
        editTvId={activeTv}

        onAdded={(newTv) => {
          // callback pentru Adaugă maşină
          setTripVehicles(prev => [...prev, newTv]);
          setActiveTv(newTv.trip_vehicle_id);
          setShowAddVeh(false);
        }}

        onUpdated={async (newVehicleIdOrTv) => {
          // — dacă e maşina principală —
          if (activeTv === 'main') {
            setSelectedTrip(prev => ({
              ...prev,
              vehicle_id: newVehicleIdOrTv
            }));
            await fetchTripVehicles(tripId);
            // ─── RELOAD seats ─────────────────────────
            const first = getStationIdByName(stops[0]);
            const last = getStationIdByName(stops[stops.length - 1]);
            const seatRes = await fetch(
              `/api/seats/${newVehicleIdOrTv}?route_id=${selectedRoute.id}` +
              `&route_schedule_id=${selectedScheduleId}` +
              `&date=${format(selectedDate, 'yyyy-MM-dd')}` +
              (selectedHour ? `&time=${encodeURIComponent(selectedHour)}` : '') +
              `&board_station_id=${first}` +
              `&exit_station_id=${last}` +
              (effectiveDirection ? `&direction=${effectiveDirection}` : '')
            );
            setSeats(hydrateSeatPayload(await seatRes.json()));
            // forţăm reîncărcarea SeatMap prin schimbarea vehicle_id
            setActiveTv('main');
            setShowAddVeh(false);
            return;
          }

          // — dacă e o dublură —
          const updatedTv = newVehicleIdOrTv; // conține trip_vehicle_id & vehicle_id

          // 1) Reîncărcăm lista de dubluri
          await fetchTripVehicles(tripId);

          // 2) Comutăm pe tab-ul editat
          setActiveTv(updatedTv.trip_vehicle_id);

          // 3) Încărcăm **manual** harta scaunelor pentru noul vehicul
          const firstStop = getStationIdByName(stops[0]);
          const lastStop = getStationIdByName(stops[stops.length - 1]);
          const resSeats = await fetch(
            `/api/seats/${updatedTv.vehicle_id}` +
            `?route_id=${selectedRoute.id}` +
            `&route_schedule_id=${selectedScheduleId}` +
            `&date=${format(selectedDate, 'yyyy-MM-dd')}` +
            (selectedHour ? `&time=${selectedHour}` : '') +
            `&board_station_id=${firstStop}` +
            `&exit_station_id=${lastStop}` +
            (effectiveDirection ? `&direction=${effectiveDirection}` : '')
          );
          const seatsData = await resSeats.json();
          setSeats(hydrateSeatPayload(seatsData));

          // 4) Închidem modal-ul
          setShowAddVeh(false);
        }}
      />

    </div>
  );
}
