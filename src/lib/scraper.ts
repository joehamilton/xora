// SocialData.tools API for Twitter/X search
// Docs: https://docs.socialdata.tools/reference/get-search-results/

const SOCIALDATA_API_URL = 'https://api.socialdata.tools/twitter/search';

interface SocialDataTweet {
  id_str: string;
  full_text: string;
  tweet_created_at: string;
  favorite_count: number;
  retweet_count: number;
  reply_count: number;
  quote_count: number;
  views_count: number;
  user: {
    id_str: string;
    name: string;
    screen_name: string;
    profile_image_url_https: string;
    followers_count: number;
  };
}

interface SocialDataResponse {
  tweets: SocialDataTweet[];
  next_cursor?: string;
}

export interface ScrapedPost {
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

function getApiKey(): string {
  const key = import.meta.env.SOCIALDATA_API_KEY || process.env.SOCIALDATA_API_KEY;
  if (!key) {
    throw new Error('SOCIALDATA_API_KEY is not set. Add it in Vercel Environment Variables.');
  }
  return key;
}

export async function scrapeZoraMentions(maxResults = 20): Promise<{
  posts: ScrapedPost[];
  error?: string;
  creditsUsed?: number;
}> {
  try {
    const apiKey = getApiKey();

    // Search for @zora mentions
    const query = encodeURIComponent('@zora');
    const url = `${SOCIALDATA_API_URL}?query=${query}&type=Latest`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SocialData API error:', response.status, errorText);
      return {
        posts: [],
        error: `API error: ${response.status} - ${errorText}`
      };
    }

    const data: SocialDataResponse = await response.json();

    // Transform to our format
    const posts: ScrapedPost[] = data.tweets.slice(0, maxResults).map(tweet => ({
      x_post_id: tweet.id_str,
      content: tweet.full_text,
      author_handle: tweet.user.screen_name,
      author_name: tweet.user.name,
      author_avatar: tweet.user.profile_image_url_https || null,
      author_followers: tweet.user.followers_count,
      like_count: tweet.favorite_count,
      repost_count: tweet.retweet_count + tweet.quote_count,
      reply_count: tweet.reply_count,
      post_url: `https://x.com/${tweet.user.screen_name}/status/${tweet.id_str}`,
      created_at: new Date(tweet.tweet_created_at),
    }));

    console.log(`Fetched ${posts.length} posts from SocialData.tools`);

    return {
      posts,
      creditsUsed: data.tweets.length // ~1 credit per tweet
    };
  } catch (error) {
    console.error('SocialData scrape error:', error);
    return {
      posts: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Simplified - we get follower counts directly from the search results now
export async function getAuthorFollowers(handle: string): Promise<number> {
  // No longer needed - SocialData includes follower count in search results
  return 0;
}
