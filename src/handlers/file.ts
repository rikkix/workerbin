import { getMimeType } from "hono/utils/mime"
import { genUniqueFileKey, getExpire, HonoContext } from "./common"
import { stream } from "hono/streaming"

export const FILE_KEY_LENGTH = 10

export async function handleCreateFile(c: HonoContext): Promise<Response> {
    const form = await c.req.parseBody()
    if (!form) {
        return c.json({ error: 'Bad Request' }, { status: 400 })
    }

    const file = form['file']
    if (!file || !(file instanceof File)) {
        return c.json({ error: 'Bad Request' }, { status: 400 })
    }
    const filename = file.name

    const mime = file.type || getMimeType(filename) || 'application/octet-stream'

    const key = await genUniqueFileKey(c.env.DB, FILE_KEY_LENGTH)
    const r2path = 'files/' + key

    const days = c.req.query('d')
    const { created_at, expire_at } = getExpire(days)

    const r2resp = await c.env.R2.put(r2path, file, {
        httpMetadata: {
            contentType: mime,
            contentDisposition: `attachment; filename="${filename}"`,
        },
        customMetadata: {
            filename: filename,
            expire_at: expire_at?.toString() ?? '',
        }
    })

    const filesize = r2resp.size

    const accessURL = c.env.BASE_URL + '/f/' + key
    try {
        await c.env.DB.prepare('INSERT INTO files (key, mime, filename, filesize, created_at, expire_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(key, mime, filename, filesize, created_at, expire_at)
            .run()
        return c.json({ 
            key: key,
            access_url: accessURL
         }, { status: 201 })
    } catch (e) {
        return c.text('Internal Server Error', { status: 500 })
    }
}

export async function deleteFile(db: D1Database, r2: R2Bucket, key: string): Promise<void> {
    await db.prepare('DELETE FROM files WHERE key = ?')
            .bind(key)
            .run()
    
    // await db.prepare('DELETE FROM file_access WHERE key = ?')
    //         .bind(key)
    //         .run()

    await r2.delete('files/' + key)
}

export async function handleAccessFile(c: HonoContext): Promise<Response> {
    const rawKey = c.req.param('key')
    if (!rawKey || rawKey.length < FILE_KEY_LENGTH) {
        return c.json({ error: 'Bad Request' }, { status: 400 })
    }
    const key = rawKey.substring(0, FILE_KEY_LENGTH)

    const file = await c.env.DB.prepare('SELECT * FROM files WHERE key = ?')
        .bind(key)
        .first()
    if (!file) {
        return c.json({ error: 'Not Found' }, { status: 404 })
    }
    if (file.expire_at &&
        new Date().getTime() > (file.expire_at as number)) {
        await deleteFile(c.env.DB, c.env.R2, key)
        return c.json({ error: 'Not Found' }, { status: 404 })
    }

    const ip = c.req.header('CF-Connecting-IP') || null
    const country = c.req.raw.cf?.country as string || null
    const city = c.req.raw.cf?.city as string || null
    const ua = c.req.header('User-Agent') || null
    const referer = c.req.header('Referer') || null
    const access_at = new Date().getTime()

    await c.env.DB.prepare('INSERT INTO file_access (key, ip, country, city, ua, referer, access_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(key, ip, country, city, ua, referer, access_at)
        .run()

    await c.env.DB.prepare('UPDATE files SET access_count = access_count + 1 WHERE key = ?')
        .bind(key)
        .run()

    const r2file = await c.env.R2.get('files/' + key)
    if (!r2file) {
        deleteFile(c.env.DB, c.env.R2, key)
        return c.text('Internal Server Error', { status: 500 })
    }

    c.header('Content-Type', file.mime as string)
    if (c.req.query('dl')) {
        c.header('Content-Disposition', `attachment; filename="${file.filename}"`)
    } else {
        c.header('Content-Disposition', `inline; filename="${file.filename}"`)
    }
    c.header('Cache-Control', 'public, max-age=604800, immutable')

    c.status(200)
    return c.body(r2file.body)
}

export async function handleGetFile(c: HonoContext): Promise<Response> {
    const rawKey = c.req.param('key')
    if (!rawKey || rawKey.length < FILE_KEY_LENGTH) {
        return c.json({ error: 'Bad Request' }, { status: 400 })
    }
    const key = rawKey.substring(0, FILE_KEY_LENGTH)

    const file = await c.env.DB.prepare('SELECT * FROM files WHERE key = ?')
        .bind(key)
        .first()
    if (!file) {
        return c.json({ error: 'Not Found' }, { status: 404 })
    }

    if (file.expire_at &&
        new Date().getTime() > (file.expire_at as number)) {
        await deleteFile(c.env.DB, c.env.R2, key)
        return c.json({ error: 'Not Found' }, { status: 404 })
    }

    return c.json({
        key: key,
        mime: file.mime,
        filename: file.filename,
        filesize: file.filesize,
        created_at: file.created_at,
        expire_at: file.expire_at,
        access_count: file.access_count,
    }, { status: 200 })
}

export async function handleGetFileAccess(c: HonoContext): Promise<Response> {
    const rawKey = c.req.param('key')
    if (!rawKey || rawKey.length < FILE_KEY_LENGTH) {
        return c.json({ error: 'Bad Request' }, { status: 400 })
    }
    const key = rawKey.substring(0, FILE_KEY_LENGTH)

    const accesses = await c.env.DB.prepare('SELECT * FROM file_access WHERE key = ? ORDER BY access_at DESC')
        .bind(key)
        .all()

    return c.json({ 
        success: accesses.success,
        data: accesses.results
    }, { status: 200 })
}

export async function handleDeleteFile(c: HonoContext): Promise<Response> {
    const rawKey = c.req.param('key')
    if (!rawKey || rawKey.length < FILE_KEY_LENGTH) {
        return c.json({ error: 'Bad Request' }, { status: 400 })
    }
    const key = rawKey.substring(0, FILE_KEY_LENGTH)

    await deleteFile(c.env.DB, c.env.R2, key)

    return c.json({ message: 'File deleted' }, { status: 200 })
}

export async function handleListFiles(c: HonoContext): Promise<Response> {
    const before_raw = parseInt(c.req.query('before') || '')
    const before = (!isNaN(before_raw) && before_raw > 0) ? before_raw : new Date().getTime()

    const key = c.req.query('key') || null

    const sfilename = c.req.query('filename') || null

    const mime = c.req.query('mime') || null

    const page_raw = parseInt(c.req.query('page') || '')
    const page = (!isNaN(page_raw) && page_raw > 0) ? page_raw : 1

    const num_raw = parseInt(c.req.query('num') || '')
    const num = (!isNaN(num_raw) && num_raw > 0 && num_raw < 500) ? num_raw : 50

    const order_by_raw = c.req.query('order_by') || 'created_at'
    const order_by = ['created_at', 'expire_at', 'filesize' , 'access_count'].includes(order_by_raw) ? order_by_raw : 'created_at'

    const order_raw = c.req.query('order')?.toUpperCase() || 'DESC'
    const order = ['ASC', 'DESC'].includes(order_raw) ? order_raw : 'DESC'

    // let query = 'SELECT * FROM files'

    let condition_query = ''
    let params = []
    condition_query += ' WHERE created_at < ?'
    params.push(before)
    if (key) {
        condition_query += ' AND key LIKE ?'
        params.push(`%${key}%`)
    }
    if (sfilename) {
        condition_query += ' AND filename LIKE ?'
        params.push(`%${sfilename}%`)
    }
    if (mime) {
        condition_query += ' AND mime LIKE ?'
        params.push(`%${mime}%`)
    }

    const query_count = `SELECT COUNT(*) as count FROM files ${condition_query}`
    const count = await c.env.DB.prepare(query_count)
        .bind(...params)
        .first()
    if (!count) {
        return c.json({ error: 'Internal Server Error' }, { status: 500 })
    }
    const total = count.count as number

    let query = `SELECT * FROM files ${condition_query} ORDER BY ${order_by} ${order}`
    query += ` LIMIT ? OFFSET ?`
    params.push(num)
    params.push((page - 1) * num)
    const files = await c.env.DB.prepare(query)
        .bind(...params)
        .all()

    return c.json({
        total: total,
        total_pages: Math.ceil(total / num),
        remaining: total - (page * num),
        remaining_pages: Math.ceil((total - (page * num)) / num),
        success: files.success,
        data: files.results
    }, { status: 200 })
}

export async function handleExportFileList(c: HonoContext): Promise<Response> {
    const files = await c.env.DB.prepare('SELECT * FROM files').all()
    if (!files || !files.success) {
        return c.json({ error: 'Internal Server Error' }, { status: 500 })
    }

    if (c.req.query('format') === 'csv') {
        c.header('Content-Type', 'text/csv')
        c.header('Content-Disposition', 'attachment; filename="files.csv"')
        return stream(c, async (w) => {
            w.write('key,mime,filename,filesize,created_at,expire_at,access_count\n')
            for (const file of files.results) {
                w.write(`${file.key},${file.mime},${file.filename},${file.filesize},${file.created_at},${file.expire_at},${file.access_count}\n`)
            }
        })
    }

    c.header('Content-Type', 'application/json')
    c.header('Content-Disposition', 'attachment; filename="files.json"')
    return c.json(files.results, { status: 200 })
}

export async function handleExportFileAccess(c: HonoContext): Promise<Response> {
    const accesses = await c.env.DB.prepare('SELECT * FROM file_access').all()
    if (!accesses || !accesses.success) {
        return c.json({ error: 'Internal Server Error' }, { status: 500 })
    }

    if (c.req.query('format') === 'csv') {
        c.header('Content-Type', 'text/csv')
        c.header('Content-Disposition', 'attachment; filename="file_access.csv"')
        return stream(c, async (w) => {
            w.write('key,ip,country,city,ua,referer,access_at\n')
            for (const access of accesses.results) {
                w.write(`${access.key},${access.ip},${access.country},${access.city},${access.ua},${access.referer},${access.access_at}\n`)
            }
        })
    }

    c.header('Content-Type', 'application/json')
    c.header('Content-Disposition', 'attachment; filename="file_access.json"')
    return c.json(accesses.results, { status: 200 })
}