import { Context } from "hono";

export type HonoContext = Context<{
  Bindings: CloudflareBindings
}>

export function generateRandomString(length: number): string {
  const characters = 'ABCDEFGHJKMNOPQRSTUVWXYZabcdefghjkmnopqrstuvwxyz023456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export function getExpire(days: string | undefined): { created_at: number, expire_at: number | null } {
  const currentDate = new Date()
  var expDays = 0
  if (days) {
    const parsedDays = parseInt(days)
    if (!isNaN(parsedDays)) {
      expDays = parsedDays
    }
  }
  const expDate = expDays > 0 ? new Date(currentDate.getTime() + expDays * 24 * 60 * 60 * 1000) : null
  // date to unix timestamp (null if no expiration)
  const created_at = currentDate.getTime()
  const expire_at = expDate?.getTime() ?? null
  return { created_at, expire_at }
}

const MAX_RETRY = 10

export async function genUniqueLinkKey(db: D1Database, len: number): Promise<string> {
  let randomString = generateRandomString(len)
  let count = 0
  while (
    await db.prepare('SELECT * FROM links WHERE key = ?')
      .bind(randomString)
      .first()
  ) {
    randomString = generateRandomString(len)
    count++
    if (count > MAX_RETRY) {
      throw new Error('Failed to generate unique key')
    }
  }
  return randomString
}

export async function genUniqueFileKey(db: D1Database, len: number): Promise<string> {
  let randomString = generateRandomString(len)
  let count = 0
  while (
    await db.prepare('SELECT * FROM files WHERE key = ?')
      .bind(randomString)
      .first()
  ) {
    randomString = generateRandomString(len)
    count++
    if (count > MAX_RETRY) {
      throw new Error('Failed to generate unique key')
    }
  }
  return randomString
}