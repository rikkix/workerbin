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

/**
 * Handles the retrieval of link access records.
 *
 * This function processes a request to get access records for a specific link key.
 * It validates the provided key, ensuring it meets the required length, and then
 * queries the database for access records associated with that key, ordered by
 * the access time in descending order.
 *
 * @param c - The HonoContext object containing the request and environment details.
 * @returns A Promise that resolves to a Response object containing the access records
 *          or an error message if the request is invalid.
 */
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

/**
 * Handles the deletion of a link based on the provided key.
 * 
 * @param c - The HonoContext object containing the request and environment.
 * @returns A Promise that resolves to a Response object indicating the result of the deletion.
 * 
 * The function performs the following steps:
 * 1. Extracts the 'key' parameter from the request.
 * 2. Validates the 'key' to ensure it meets the required length.
 * 3. Calls the `deleteLink` function to remove the link from the database.
 * 4. Returns a JSON response indicating success or failure.
 */
export async function handleDeleteLink(c: HonoContext): Promise<Response> {
    const rawKey = c.req.param('key')
    if (!rawKey || rawKey.length < LINK_KEY_LENGTH) {
        return c.json({ error: 'Bad Request' }, { status: 400 })
    }
    const key = rawKey.substring(0, LINK_KEY_LENGTH)

    await deleteLink(c.env.DB, key)

    return c.json({ message: 'Link deleted' }, { status: 200 })
}


/**
 * Handles the request to list links with optional query parameters for filtering, pagination, and sorting.
 *
 * @param {HonoContext} c - The context object containing the request and environment.
 * @returns {Promise<Response>} - A promise that resolves to a Response object containing the list of links.
 *
 * Query Parameters:
 * - `dest` (optional): A string to filter links by their destination.
 * - `page` (optional): A number to specify the page of results to retrieve. Defaults to 1.
 * - `num` (optional): A number to specify the number of results per page. Defaults to 20, with a maximum of 100.
 * - `order_by` (optional): A string to specify the field to sort by. Can be 'created_at' or 'access_count'. Defaults to 'created_at'.
 * - `order` (optional): A string to specify the sort order. Can be 'ASC' or 'DESC'. Defaults to 'DESC'.
 */
export async function handleListLinks(c: HonoContext): Promise<Response> {
    const dest = c.req.query('dest') || null

    const page_raw = parseInt(c.req.query('page') || '')
    const page = (!isNaN(page_raw) && page_raw > 0) ? page_raw : 1

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
    query += ` ORDER BY ${order_by} ${order}`
    query += ` LIMIT ? OFFSET ?`
    params.push(num)
    params.push((page - 1) * num)

    const links = await c.env.DB.prepare(query)
        .bind(...params)
        .all()

    return c.json(links, { status: 200 })
}