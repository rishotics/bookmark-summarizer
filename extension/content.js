// Runs in extension world. Listens for messages from intercept.js (MAIN world)
// and relays extracted bookmarks to the background service worker.

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type !== "XBS_BOOKMARKS_INTERCEPTED") return;

  console.log("[XBS] content.js received intercepted data");
  console.log("[XBS] Top-level keys:", Object.keys(event.data.payload?.data || {}));

  const bookmarks = extractBookmarks(event.data.payload);
  console.log("[XBS] Extracted bookmarks:", bookmarks.length);

  if (bookmarks.length > 0) {
    chrome.runtime.sendMessage({
      type: "BOOKMARKS_CAPTURED",
      bookmarks: bookmarks,
    });
  } else {
    console.log("[XBS] No bookmarks extracted. Raw payload sample:", JSON.stringify(event.data.payload).substring(0, 500));
  }
});

function extractBookmarks(graphqlResponse) {
  const bookmarks = [];

  try {
    const instructions =
      graphqlResponse?.data?.bookmark_timeline_v2?.timeline?.instructions ||
      graphqlResponse?.data?.bookmark_timeline?.timeline?.instructions ||
      [];

    for (const instruction of instructions) {
      const entries = instruction?.entries || [];
      for (const entry of entries) {
        const tweet = extractTweet(entry);
        if (tweet) bookmarks.push(tweet);
      }
    }
  } catch (e) {
    // Silently ignore
  }

  return bookmarks;
}

function extractTweet(entry) {
  try {
    const result =
      entry?.content?.itemContent?.tweet_results?.result ||
      entry?.content?.itemContent?.tweet_results?.result?.tweet;

    if (!result) return null;

    const tweetData = result.__typename === "Tweet" ? result : result.tweet || result;
    const legacy = tweetData?.legacy;
    const core = tweetData?.core?.user_results?.result?.legacy;

    if (!legacy || !core) return null;

    const mediaUrls = (legacy.entities?.media || []).map((m) => m.media_url_https);

    return {
      tweet_id: legacy.id_str || tweetData.rest_id,
      author: core.name,
      author_handle: core.screen_name,
      text: legacy.full_text,
      url: `https://x.com/${core.screen_name}/status/${legacy.id_str || tweetData.rest_id}`,
      created_at: legacy.created_at,
      likes: legacy.favorite_count || 0,
      retweets: legacy.retweet_count || 0,
      media_urls: mediaUrls,
      bookmarked_at: new Date().toISOString(),
    };
  } catch (e) {
    return null;
  }
}
