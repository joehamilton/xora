import type { APIRoute } from 'astro';
import { initDb } from '../../lib/db';

export const GET: APIRoute = async () => {
  try {
    await initDb();
    return new Response(
      JSON.stringify({ success: true, message: 'Database initialized' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Init error:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to initialize database',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
