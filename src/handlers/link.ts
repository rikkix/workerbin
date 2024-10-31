import { SmartRouter } from "hono/router/smart-router";
import { genUniqueLinkKey, getExpire, HonoContext } from "./common";

export const LINK_KEY_LENGTH = 10

export async function handleCreateLink(c: HonoContext): Promise<Response> {
    const days = c.req.query('d')

    const destination = await c.req.text()

    const { created_at, expire_at } = getExpire(days)

    const key = await genUniqueLinkKey(c.env.DB, LINK_KEY_LENGTH)
    const accessURL = c.env.BASE_URL + '/s/' + key

    try {
        await c.env.DB.prepare('INSERT INTO links (key, destination, created_at, expire_at) VALUES (?, ?, ?, ?)')
            .bind(key, destination, created_at, expire_at)
            .run()
        return c.json({ 
            key: key,
            access_url: accessURL
         }, { status: 201 })
    } catch (e) {
        return c.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function deleteLink(db: D1Database, key: string): Promise<void> {
    await db.prepare('DELETE FROM links WHERE key = ?')
            .bind(key)
            .run()
    
    await db.prepare('DELETE FROM link_access WHERE key = ?')
            .bind(key)
            .run()
}

export async function handleAccessLink(c: HonoContext): Promise<Response> {
    const rawKey = c.req.param('key')
    if (!rawKey || rawKey.length < LINK_KEY_LENGTH) {
        return c.json({ error: 'Bad Request' }, { status: 400 })
    }
    const key = rawKey.substring(0, LINK_KEY_LENGTH)

    const link = await c.env.DB.prepare('SELECT * FROM links WHERE key = ?')
        .bind(key)
        .first()
    if (!link) {
        return c.json({ error: 'Not Found' }, { status: 404 })
    }
    if (link.expire_at &&
        new Date().getTime() > (link.expire_at as number)) {
        await deleteLink(c.env.DB, key)
        return c.json({ error: 'Not Found' }, { status: 404 })
    }

    const ip = c.req.header('CF-Connecting-IP') || null
    const country = c.req.raw.cf?.country as string || null
    const city = c.req.raw.cf?.city as string || null
    const ua = c.req.header('User-Agent') || null
    const referer = c.req.header('Referer') || null
    const access_at = new Date().getTime()

    await c.env.DB.prepare('INSERT INTO link_access (key, ip, country, city, ua, referer, access_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(key, ip, country, city, ua, referer, access_at)
        .run()
    
    await c.env.DB.prepare('UPDATE links SET access_count = access_count + 1 WHERE key = ?')
        .bind(key)
        .run()

    return c.redirect(link.destination as string, 302)
}

export async function handleGetLink(c: HonoContext): Promise<Response> {
    const rawKey = c.req.param('key')
    if (!rawKey || rawKey.length < LINK_KEY_LENGTH) {
        return c.json({ error: 'Bad Request' }, { status: 400 })
    }
    const key = rawKey.substring(0, LINK_KEY_LENGTH)

    const link = await c.env.DB.prepare('SELECT * FROM links WHERE key = ?')
        .bind(key)
        .first()
    if (!link) {
        return c.json({ error: 'Not Found' }, { status: 404 })
    }
    if (link.expire_at &&
        new Date().getTime() > (link.expire_at as number)) {
        await deleteLink(c.env.DB, key)
        return c.json({ error: 'Not Found' }, { status: 404 })
    }

    return c.json(link, { status: 200 })
}

export async function handleGetLinkAccess(c: HonoContext): Promise<Response> {
    const rawKey = c.req.param('key')
    if (!rawKey || rawKey.length < LINK_KEY_LENGTH) {
        return c.json({ error: 'Bad Request' }, { status: 400 })
    }
    const key = rawKey.substring(0, LINK_KEY_LENGTH)

    const accesses = await c.env.DB.prepare('SELECT * FROM link_access WHERE key = ? ORDER BY access_at DESC')
        .bind(key)
        .all()

    return c.json(accesses, { status: 200 })
}

export async function handleDeleteLink(c: HonoContext): Promise<Response> {
    const rawKey = c.req.param('key')
    if (!rawKey || rawKey.length < LINK_KEY_LENGTH) {
        return c.json({ error: 'Bad Request' }, { status: 400 })
    }
    const key = rawKey.substring(0, LINK_KEY_LENGTH)

    await deleteLink(c.env.DB, key)

    return c.json({ message: 'Link deleted' }, { status: 200 })
}

export async function handleListLinks(c: HonoContext): Promise<Response> {
    const dest = c.req.query('dest') || null

    const created_before_raw = parseInt(c.req.query('created_before') || '')
    const created_before = (!isNaN(created_before_raw) && created_before_raw > 0) ? created_before_raw : null

    const num_raw = parseInt(c.req.query('num') || '')
    const num = (!isNaN(num_raw) && num_raw > 0 && num_raw < 100) ? num_raw : 20

    const order_by_raw = c.req.query('order_by') || 'created_at'
    const order_by = ['created_at', 'access_count'].includes(order_by_raw) ? order_by_raw : 'created_at'

    const order_raw = c.req.query('order')?.toUpperCase() || 'DESC'
    const order = ['ASC', 'DESC'].includes(order_raw) ? order_raw : 'DESC'


    let query = 'SELECT * FROM links'
    let params = []
    if (dest) {
        query += ' WHERE destination LIKE ?'
        params.push(`%${dest}%`)
    }
    if (created_before) {
        query += dest ? ' AND' : ' WHERE'
        query += ' created_at < ?'
        params.push(created_before)
    }
    query += ` ORDER BY ${order_by} ${order}`
    query += ' LIMIT ?'
    params.push(num)

    const links = await c.env.DB.prepare(query)
        .bind(...params)
        .all()

    return c.json(links, { status: 200 })
}