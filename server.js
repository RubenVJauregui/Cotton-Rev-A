const fastify = require('fastify')({ logger: false });

const UPSTREAM = 'https://3001-i86g5p7mf0o36mw8hbouz.e2b.app';

const COTTON_JOSE = {
  name: 'Jose Villasenor',
  userName: 'jvilasenor',
  username: 'jvilasenor',
  employeeCode: '3677',
  userId: '3138',
  id: '3138',
  assigneeUserId: '3138',
  defaultFacility: 'LT_F34',
  facilityId: 'LT_F34',
  status: 'ACTIVE',
};

function key(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function normalizeAssignees(assignees) {
  const filtered = (Array.isArray(assignees) ? assignees : []).filter((a) => {
    const name = key(a.name || a.userName || a.username || a.assignee);
    const username = String(a.userName || a.username || '').toLowerCase();
    const userId = String(a.userId || a.id || a.assigneeUserId || '');
    if (name === 'JOSE VILLASENOR') return username === 'jvilasenor' || userId === '3138';
    return true;
  });
  const i = filtered.findIndex((a) => {
    const name = key(a.name || a.userName || a.username || a.assignee);
    const username = String(a.userName || a.username || '').toLowerCase();
    const userId = String(a.userId || a.id || a.assigneeUserId || '');
    return name === 'JOSE VILLASENOR' || username === 'jvilasenor' || userId === '3138';
  });
  if (i >= 0) filtered[i] = { ...filtered[i], ...COTTON_JOSE };
  else filtered.push(COTTON_JOSE);
  return filtered;
}

function overrideRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const name = key(row.suggestedAssignee || row.assigneeName || row.assignee);
    if (name !== 'JOSE VILLASENOR') return row;
    return {
      ...row,
      suggestedAssignee: 'Jose Villasenor',
      assigneeName: 'Jose Villasenor',
      suggestedAssigneeUserId: '3138',
      assigneeUserId: '3138',
      userId: '3138',
      userName: 'jvilasenor',
      username: 'jvilasenor',
      employeeCode: '3677',
    };
  });
}

function overrideBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const next = { ...body };
  if (Array.isArray(next.rows)) next.rows = overrideRows(next.rows);
  if (Array.isArray(next.suggestions)) next.suggestions = overrideRows(next.suggestions);
  return next;
}

fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try { done(null, body ? JSON.parse(body) : {}); } catch (err) { done(err); }
});

fastify.all('/*', async (req, reply) => {
  const upstreamUrl = `${UPSTREAM}${req.url}`;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers['content-length'];

  const init = { method: req.method, headers };
  if (!['GET', 'HEAD'].includes(req.method)) {
    const isJson = String(req.headers['content-type'] || '').includes('application/json');
    if (isJson) {
      init.headers = { ...headers, 'content-type': 'application/json' };
      init.body = JSON.stringify(overrideBody(req.body || {}));
    } else if (req.body) {
      init.body = req.body;
    }
  }

  try {
    const res = await fetch(upstreamUrl, init);
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    let body = Buffer.from(await res.arrayBuffer());

    if (contentType.includes('application/json')) {
      try {
        const json = JSON.parse(body.toString('utf8') || '{}');
        if (req.url.startsWith('/api/assignees')) json.assignees = normalizeAssignees(json.assignees || []);
        if (Array.isArray(json.suggestions)) json.suggestions = overrideRows(json.suggestions);
        body = Buffer.from(JSON.stringify(json));
      } catch {}
    }

    reply.code(res.status);
    reply.header('content-type', contentType);
    const cacheControl = res.headers.get('cache-control');
    if (cacheControl) reply.header('cache-control', cacheControl);
    return reply.send(body);
  } catch (err) {
    reply.code(502).send({ message: 'Unable to reach Cotton dashboard upstream.', upstream: UPSTREAM });
  }
});

const port = Number(process.env.PORT || 3000);
fastify.listen({ host: '0.0.0.0', port }).then(() => console.log(`cotton-wise-dashboard listening ${port}`));
