import { Hono } from 'hono'
import { handleAccessLink, handleCreateLink, handleDeleteLink, handleGetLink, handleGetLinkAccess, handleListLinks} from './handlers/link'
import { handleAccessFile, handleCreateFile, handleDeleteFile, handleExportFileAccess, handleExportFileList, handleGetFile, handleGetFileAccess, handleListFiles } from './handlers/file'
import { handleSchedule } from './handlers/clean'
const app = new Hono<{ Bindings: CloudflareBindings }>()

// For public access. Accesses via these links will be recorded.
app.get('/s/:key', handleAccessLink)
app.get('/f/:key', handleAccessFile)

// For authorized access (optional, by using Cloudflare Access)
// Accesses via these links will not be recorded.
app.post('/api/links/create', handleCreateLink)
app.get('/api/links/list', handleListLinks)
app.get('/api/links/:key', handleGetLink)
app.get('/api/links/:key/access', handleGetLinkAccess)
app.delete('/api/links/delete/:key', handleDeleteLink)

app.post('/api/files/create', handleCreateFile)
app.get('/api/files/list', handleListFiles)
app.get('/api/files/:key', handleGetFile)
app.get('/api/files/:key/access', handleGetFileAccess)
app.delete('/api/files/delete/:key', handleDeleteFile)

app.get('/api/export/files', handleExportFileList)
app.get('/api/export/files/access', handleExportFileAccess)

export default {
  fetch: app.fetch,
  scheduled: async (req: ScheduledEvent, env: CloudflareBindings) => {
    await handleSchedule(env)
  }
}