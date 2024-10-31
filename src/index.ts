import { Hono } from 'hono'
import { handleAccessLink, handleCreateLink, handleDeleteLink, handleGetLink, handleGetLinkAccess, handleListLinks} from './handlers/link'

const app = new Hono<{ Bindings: CloudflareBindings }>()


// For public access. Accesses via these links will be recorded.
app.get('/s/:key', handleAccessLink)


// For authorized access (optional, by using Cloudflare Access)
// Accesses via these links will not be recorded.
app.post('/api/links/create', handleCreateLink)
app.get('/api/links/:key', handleGetLink)
app.get('/api/links/:key/access', handleGetLinkAccess)
app.get('/api/links/list', handleListLinks)
app.delete('/api/links/delete/:key', handleDeleteLink)


export default {
  fetch: app.fetch,
  // scheduled: async (batch, env) => { },
}