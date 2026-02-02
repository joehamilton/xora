import type { Post } from './db';

// List of public Nitter instances to try (in order of preference)
// Updated from https://gist.github.com/cmj/7dace466c983e07d4e3b13be4b786c29
const NITTER_INSTANCES = [
  'https://xcancel.com',
  'https://nitter.poast.org',
  'https://nitter.privacydev.net',
  'https://twitt.re',
  'https://nitter.pek.li',
  'https://nitter.aosus.link',
];

interface ScrapedPost {
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
}

async function fetchWithTimeout(url: string, timeout = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; xora/1.0)',
      },
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

function parseCount(text: string): number {
  if (!text) return 0;
  text = text.trim().toLowerCase();

  if (text.includes('k')) {
    return Math.round(parseFloat(text.replace('k', '')) * 1000);
  }
  if (text.includes('m')) {
    return Math.round(parseFloat(text.replace('m', '')) * 1000000);
  }
  return parseInt(text.replace(/,/g, '')) || 0;
}

function parseRelativeTime(text: string): Date {
  const now = new Date();
  text = text.trim().toLowerCase();

  if (text.includes('s ago') || text.includes('sec')) {
    const seconds = parseInt(text) || 0;
    return new Date(now.getTime() - seconds * 1000);
  }
  if (text.includes('m ago') || text.includes('min')) {
    const minutes = parseInt(text) || 0;
    return new Date(now.getTime() - minutes * 60 * 1000);
  }
  if (text.includes('h ago') || text.includes('hour')) {
    const hours = parseInt(text) || 0;
    return new Date(now.getTime() - hours * 60 * 60 * 1000);
  }
  if (text.includes('d ago') || text.includes('day')) {
    const days = parseInt(text) || 0;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  // Try to parse as absolute date
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return now;
}

function extractPostsFromHtml(html: string, instanceUrl: string): ScrapedPost[] {
  const posts: ScrapedPost[] = [];

  // Match timeline items - Nitter uses .timeline-item class
  const timelineItemRegex = /<div class="timeline-item[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
  let match;

  while ((match = timelineItemRegex.exec(html)) !== null) {
    try {
      const item = match[1];

      // Extract post ID from tweet-link
      const postIdMatch = item.match(/href="\/([^/]+)\/status\/(\d+)/);
      if (!postIdMatch) continue;

      const authorHandle = postIdMatch[1];
      const postId = postIdMatch[2];

      // Extract author name
      const authorNameMatch = item.match(/class="fullname"[^>]*>([^<]+)/);
      const authorName = authorNameMatch ? authorNameMatch[1].trim() : authorHandle;

      // Extract avatar
      const avatarMatch = item.match(/class="avatar[^"]*"[^>]*src="([^"]+)"/);
      const authorAvatar = avatarMatch ? avatarMatch[1] : null;

      // Extract content
      const contentMatch = item.match(/class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/);
      let content = contentMatch ? contentMatch[1] : '';
      // Strip HTML tags from content
      content = content.replace(/<[^>]+>/g, '').trim();

      // Extract stats
      const likesMatch = item.match(/class="icon-heart"[^>]*><\/span>\s*(\d+[KkMm]?)/);
      const repostsMatch = item.match(/class="icon-retweet"[^>]*><\/span>\s*(\d+[KkMm]?)/);
      const repliesMatch = item.match(/class="icon-comment"[^>]*><\/span>\s*(\d+[KkMm]?)/);

      const likeCount = likesMatch ? parseCount(likesMatch[1]) : 0;
      const repostCount = repostsMatch ? parseCount(repostsMatch[1]) : 0;
      const replyCount = repliesMatch ? parseCount(repliesMatch[1]) : 0;

      // Extract timestamp
      const timeMatch = item.match(/class="tweet-date"[^>]*>.*?title="([^"]+)"/);
      const createdAt = timeMatch ? new Date(timeMatch[1]) : new Date();

      if (content && postId) {
        posts.push({
          x_post_id: postId,
          content,
          author_handle: authorHandle,
          author_name: authorName,
          author_avatar: authorAvatar,
          author_followers: 0, // Would need separate request to get this
          like_count: likeCount,
          repost_count: repostCount,
          reply_count: replyCount,
          post_url: `https://x.com/${authorHandle}/status/${postId}`,
          created_at: createdAt,
        });
      }
    } catch (e) {
      // Skip malformed posts
      console.error('Failed to parse post:', e);
    }
  }

  return posts;
}

export async function scrapeZoraMentions(): Promise<{ posts: ScrapedPost[]; instance: string | null; error?: string }> {
  for (const instance of NITTER_INSTANCES) {
    try {
      console.log(`Trying Nitter instance: ${instance}`);

      // Search for @zora mentions
      const searchUrl = `${instance}/search?f=tweets&q=%40zora`;
      const response = await fetchWithTimeout(searchUrl, 15000);

      if (!response.ok) {
        console.log(`Instance ${instance} returned ${response.status}`);
        continue;
      }

      const html = await response.text();

      // Check if we got blocked or rate limited
      if (html.includes('rate limit') || html.includes('blocked') || html.length < 1000) {
        console.log(`Instance ${instance} appears to be rate limited or blocked`);
        continue;
      }

      const posts = extractPostsFromHtml(html, instance);
      console.log(`Found ${posts.length} posts from ${instance}`);

      if (posts.length > 0) {
        return { posts, instance };
      }
    } catch (error) {
      console.error(`Failed to fetch from ${instance}:`, error);
    }
  }

  return { posts: [], instance: null, error: 'All Nitter instances failed' };
}

export async function getAuthorFollowers(handle: string): Promise<number> {
  for (const instance of NITTER_INSTANCES) {
    try {
      const response = await fetchWithTimeout(`${instance}/${handle}`, 10000);
      if (!response.ok) continue;

      const html = await response.text();
      const followersMatch = html.match(/class="followers"[^>]*>.*?(\d+[KkMm,.\d]*)/s);

      if (followersMatch) {
        return parseCount(followersMatch[1]);
      }
    } catch {
      continue;
    }
  }
  return 0;
}
