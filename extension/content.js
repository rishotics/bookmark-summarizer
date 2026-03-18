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
    // Handle multiple possible paths for user data
    const core =
      tweetData?.core?.user_results?.result?.legacy ||
      tweetData?.core?.user_result?.result?.legacy ||
      tweetData?.author?.legacy;

    if (!legacy) return null;

    const mediaUrls = (legacy.entities?.media || []).map((m) => m.media_url_https);

    const authorName = core?.name || "Unknown";
    const authorHandle = core?.screen_name || "unknown";
    const tweetId = legacy.id_str || tweetData.rest_id;

    return {
      tweet_id: tweetId,
      author: authorName,
      author_handle: authorHandle,
      text: legacy.full_text,
      url: `https://x.com/${authorHandle}/status/${tweetId}`,
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
