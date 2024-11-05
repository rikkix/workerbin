import { Env } from "hono"
import { deleteFile } from "./file"

export async function removeExpiredLinks(db: D1Database): Promise<void> {
    await db.prepare('DELETE FROM links WHERE expire_at IS NOT NULL AND expire_at < ?')
        .bind(new Date().getTime())
        .run()
}

export async function removeExpiredFiles(db: D1Database, r2: R2Bucket): Promise<void> {
    const files = await db.prepare('SELECT key FROM files WHERE expire_at IS NOT NULL AND expire_at < ?')
        .bind(new Date().getTime())
        .all()
    
    if (!files.success) {
        throw new Error('Failed to fetch expired files')
    }

    for (const file of files.results) {
        await deleteFile(db, r2, file.key as string)
    }
}

export async function handleSchedule(env: CloudflareBindings) {
    await removeExpiredLinks(env.DB)
    await removeExpiredFiles(env.DB, env.R2)
}