import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function TerminalSelectPage({ onSelected }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [terminals, setTerminals] = useState([]);
  const [terminalId, setTerminalId] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const meRes = await fetch('/api/auth/me', { credentials: 'include' });
        const meJson = await meRes.json().catch(() => ({ user: null }));
        const user = meJson?.user || null;
        if (!user) {
          navigate('/login', { replace: true });
          return;
        }

        const res = await fetch('/api/terminals', { credentials: 'include' });
        const data = await res.json().catch(() => []);
        if (!res.ok || !Array.isArray(data)) {
          setErr('Nu am putut încărca terminalele.');
          setTerminals([]);
          setTerminalId('');
          return;
        }

        setTerminals(data);
        const preferred = user?.terminal_id ? String(user.terminal_id) : '';
        const first = data[0]?.id ? String(data[0].id) : '';
        setTerminalId(preferred || first);
      } catch {
        setErr('Eroare la încărcare terminale.');
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const res = await fetch('/api/auth/set-terminal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminal_id: Number(terminalId) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        setErr(data?.error || 'Nu am putut seta terminalul.');
        return;
      }

      onSelected?.(data?.user || null);
      navigate('/', { replace: true });
    } catch {
      setErr('Eroare la setare terminal.');
    }
  };

  return (
    <div className="max-w-sm mx-auto mt-10 p-6 rounded border bg-white">
      <h1 className="text-xl font-semibold mb-4">Alege PC-ul de unde lucrezi:</h1>

      {loading ? (
        <div className="text-sm text-gray-600">Se încarcă…</div>
      ) : (
        <>
          {err && <div className="mb-3 text-sm text-red-600">{err}</div>}

          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm">Terminal</span>
              <select
                className="border rounded px-3 py-2"
                value={terminalId}
                onChange={(e) => setTerminalId(e.target.value)}
                required
              >
                {terminals.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name ? `${t.name} (ID ${t.id})` : `Terminal ${t.id}`}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={!terminalId}
              className="mt-2 bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 disabled:opacity-60"
            >
              Continuă
            </button>
          </form>
        </>
      )}
    </div>
  );
}
