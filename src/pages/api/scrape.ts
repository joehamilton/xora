import type { APIRoute } from 'astro';
import { initDb, upsertPost } from '../../lib/db';
import { scrapeZoraMentions } from '../../lib/scraper';

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

    // Scrape posts from SocialData.tools API
    // Limit to 20 posts per scrape to conserve credits
    const { posts, error, creditsUsed } = await scrapeZoraMentions(20);

    if (error) {
      return new Response(JSON.stringify({ error, posts: 0 }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Upsert posts to database
    let savedCount = 0;
    for (const post of posts) {
      await upsertPost(post);
      savedCount++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        source: 'socialdata.tools',
        scraped: posts.length,
        saved: savedCount,
        creditsUsed,
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
