import { neon } from '@neondatabase/serverless';

const sql = neon(import.meta.env.DATABASE_URL || process.env.DATABASE_URL!);

export interface Post {
  id: number;
  x_post_id: string;
  content: string;
  author_handle: string;
  author_name: string;
  author_avatar: string | null;
  author_followers: number;
  like_count: number;
  repost_count: number;
  reply_count: number;
  post_url: string;
  created_at: Date;
  scraped_at: Date;
}

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      x_post_id VARCHAR(255) UNIQUE NOT NULL,
      content TEXT NOT NULL,
      author_handle VARCHAR(255) NOT NULL,
      author_name VARCHAR(255) NOT NULL,
      author_avatar TEXT,
      author_followers INTEGER DEFAULT 0,
      like_count INTEGER DEFAULT 0,
      repost_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      post_url TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL,
      scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_posts_like_count ON posts(like_count DESC)
  `;
}

export async function getPosts(limit = 50, offset = 0): Promise<Post[]> {
  const result = await sql`
    SELECT * FROM posts
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return result as Post[];
}

export async function upsertPost(post: Omit<Post, 'id' | 'scraped_at'>) {
  await sql`
    INSERT INTO posts (
      x_post_id, content, author_handle, author_name, author_avatar,
      author_followers, like_count, repost_count, reply_count, post_url, created_at
    ) VALUES (
      ${post.x_post_id}, ${post.content}, ${post.author_handle}, ${post.author_name},
      ${post.author_avatar}, ${post.author_followers}, ${post.like_count},
      ${post.repost_count}, ${post.reply_count}, ${post.post_url}, ${post.created_at}
    )
    ON CONFLICT (x_post_id) DO UPDATE SET
      like_count = EXCLUDED.like_count,
      repost_count = EXCLUDED.repost_count,
      reply_count = EXCLUDED.reply_count,
      scraped_at = CURRENT_TIMESTAMP
  `;
}

export async function getPostCount(): Promise<number> {
  const result = await sql`SELECT COUNT(*) as count FROM posts`;
  return parseInt(result[0].count);
}
