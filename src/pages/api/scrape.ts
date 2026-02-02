import type { APIRoute } from 'astro';
import { initDb, upsertPost } from '../../lib/db';
import { scrapeZoraMentions, getAuthorFollowers } from '../../lib/scraper';

export const GET: APIRoute = async ({ request }) => {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization');
  const cronSecret = import.meta.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Initialize database tables if they don't exist
    await initDb();

    // Scrape posts from Nitter
    const { posts, instance, error } = await scrapeZoraMentions();

    if (error) {
      return new Response(JSON.stringify({ error, posts: 0 }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch follower counts for unique authors (with rate limiting)
    const uniqueAuthors = [...new Set(posts.map(p => p.author_handle))];
    const followerCounts: Record<string, number> = {};

    for (const handle of uniqueAuthors.slice(0, 10)) {
      // Limit to 10 to avoid rate limits
      followerCounts[handle] = await getAuthorFollowers(handle);
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Upsert posts to database
    let savedCount = 0;
    for (const post of posts) {
      const postWithFollowers = {
        ...post,
        author_followers: followerCounts[post.author_handle] || 0,
      };

      await upsertPost(postWithFollowers);
      savedCount++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        instance,
        scraped: posts.length,
        saved: savedCount,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Scrape error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
