export const fmt = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '-');
export const toLocalInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
export const Badge = ({ s }) => <span className={'badge ' + String(s).toLowerCase()}>{String(s).replace('_', ' ')}</span>;
export const Stat = ({ label, value }) => <div className="stat"><b>{value ?? '-'}</b><span>{label}</span></div>;
export const ErrorBox = ({ error }) => (error ? <div className="err">{error}</div> : null);

// Loading / error / empty states in one wrapper.
export function State({ loading, error, empty, children }) {
  if (loading) return <div className="empty">Loading...</div>;
  if (error) return <ErrorBox error={error} />;
  if (empty) return <div className="empty">Nothing to show yet.</div>;
  return children;
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className={'modal' + (wide ? ' wide' : '')} onClick={(e) => e.stopPropagation()}>
        <div className="head"><h3>{title}</h3><button className="ghost sm" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

export function Confirm({ text, onYes, onNo }) {
  return (
    <Modal title="Please confirm" onClose={onNo}>
      <p>{text}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="ghost" onClick={onNo}>Cancel</button><button className="danger" onClick={onYes}>Confirm</button>
      </div>
    </Modal>
  );
}

// cols: [{ key, label, render? }]
export function Table({ cols, rows }) {
  return (
    <table>
      <thead><tr>{cols.map((c) => <th key={c.label}>{c.label}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c.label}>{c.render ? c.render(r) : r[c.key] ?? '-'}</td>)}</tr>)}</tbody>
    </table>
  );
}

export const Bars = ({ rows, label, value, suffix = '' }) => {
  const max = Math.max(1, ...rows.map((r) => Number(r[value]) || 0));
  return rows.map((r, i) => (
    <div className="bar" key={i}><span>{r[label]}</span><i style={{ width: `${(Number(r[value]) / max) * 100}%`, minWidth: 2 }} /><b>{r[value] ?? 0}{suffix}</b></div>
  ));
};
