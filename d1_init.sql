CREATE TABLE IF NOT EXISTS [files] ("key" text PRIMARY KEY, "mime" text, "filename" text, "filesize" integer, "created_at" integer, "expire_at" integer, "access_count" integer DEFAULT 0);
CREATE TABLE IF NOT EXISTS [file_access] ("key" text, "ip" text, "country" text, "city" text, "ua" text, "referer" text, "access_at" integer, FOREIGN KEY(key) REFERENCES files(key) ON DELETE CASCADE);

CREATE TABLE IF NOT EXISTS [links] ("key" text PRIMARY KEY, "destination" text, "created_at" integer, "expire_at" integer, "access_count" integer DEFAULT 0);
CREATE TABLE IF NOT EXISTS [link_access] ("key" text, "ip" text, "country" text, "city" text, "ua" text, "referer" text, "access_at" integer, FOREIGN KEY(key) REFERENCES links(key) ON DELETE CASCADE);
