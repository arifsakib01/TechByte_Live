import feedparser
import tweepy
import os
import random

# Get API credentials securely from GitHub environment variables (Secrets)
API_KEY = os.environ.get('TWITTER_API_KEY')
API_SECRET = os.environ.get('TWITTER_API_SECRET')
ACCESS_TOKEN = os.environ.get('TWITTER_ACCESS_TOKEN')
ACCESS_SECRET = os.environ.get('TWITTER_ACCESS_SECRET')

# Top Authentic Source Feeds from our Hub
FEEDS = [
    'https://techcrunch.com/feed/',
    'https://hnrss.org/frontpage',
    'https://www.theverge.com/rss/index.xml',
    'https://www.space.com/feeds/all',
    'https://github.blog/feed/'
]

def post_tweet():
    if not API_KEY or not API_SECRET or not ACCESS_TOKEN or not ACCESS_SECRET:
        print("CRITICAL ERROR: Twitter API keys are missing. Please configure your GitHub Repository Secrets.")
        return

    # Pick a random feed to avoid spamming the exact same source multiple times a day
    selected_feed = random.choice(FEEDS)
    print(f"[*] Waking up... Fetching top news from: {selected_feed}")
    
    try:
        feed = feedparser.parse(selected_feed)
        if not feed.entries:
            print("[!] No articles found.")
            return

        # Select the absolute newest, top article
        article = feed.entries[0]
        title = article.title
        link = article.link

        # Construct a beautiful, engaging Tweet promoting your Tech Hub as well
        tweet_text = f"🚀 BREAKING TECH:\n\n{title}\n\n🤖 Scanned by TechByte_Live\n\nRead full source here: {link}\n\n#TechNews #Developer #Innovation"
        print(f"[*] Drafted Tweet:\n{tweet_text}")

        # Authenticate and Post to Twitter via Tweepy V2 API Client
        client = tweepy.Client(
            consumer_key=API_KEY, 
            consumer_secret=API_SECRET,
            access_token=ACCESS_TOKEN, 
            access_token_secret=ACCESS_SECRET
        )
        
        response = client.create_tweet(text=tweet_text)
        print(f"[SUCCESS] Successfully published Tweet! View ID: {response.data['id']}")
        
    except Exception as e:
        print(f"[FATAL_ERROR] Failed during execution: {str(e)}")

if __name__ == "__main__":
    post_tweet()
