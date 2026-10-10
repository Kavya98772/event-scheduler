export const token = {
  get: () => localStorage.getItem('token'),
  set: (t) => localStorage.setItem('token', t),
  clear: () => localStorage.removeItem('token'),
};

async function req(method, path, body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token.get() && { Authorization: 'Bearer ' + token.get() }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth')) { token.clear(); localStorage.removeItem('user'); window.location.href = '/login'; }
    const err = new Error(data?.error?.message || res.statusText);
    err.status = res.status; err.type = data?.error?.type;
    throw err;
  }
  return data;
}
export const api = {
  get: (p) => req('GET', p), post: (p, b) => req('POST', p, b ?? {}), put: (p, b) => req('PUT', p, b), del: (p) => req('DELETE', p),
};
