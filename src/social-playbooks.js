// Social platform playbooks — how each network's distribution system actually
// ranks content in 2026, written as working instructions for the Social Media
// agent (api/_agents.js injects them into its drafting prompt) and shown in
// the AI Growth desk so the owner can read exactly what the agent was taught.
//
// 2026-11-11 owner request: "attach the social media platforms so the AI
// growth agents can manage them automatically and grow them while
// understanding the algo of those platforms".
//
// Pure data — imported by both the browser bundle (src/ai-growth.jsx) and the
// API (api/_social.js, api/_agents.js). No fetches, no secrets.
//
// HONESTY RULES THAT OVERRIDE EVERY PLAYBOOK:
//   • No invented scarcity, discounts, testimonials or trend claims.
//   • Stock facts (ref, price basis, availability) are preserved exactly.
//   • Drafts only — nothing posts without approval, a live connection and the
//     agent's autopublish switch.
//   • Only AR7-owned or AR7-licensed media is ever attached. Downloading other
//     people's videos and re-editing them to dodge copyright detection is not
//     "copyright-free" — it is infringement and gets channels struck. The
//     Video studio builds videos from AR7's own photographs instead.

export const SOCIAL_PLATFORMS = [
  {
    id: 'facebook', label: 'Facebook Page',
    fields: [
      { key: 'page_id', label: 'Page ID', hint: 'Numeric ID from the Page\u2019s About panel' },
      { key: 'token', label: 'Page access token', hint: 'Long-lived Page token from developers.facebook.com \u2192 Graph API Explorer or a System User', secret: true }
    ],
    autopublish: true,
    connectHelp: 'developers.facebook.com \u2192 your app \u2192 Graph API Explorer \u2192 generate a Page token with pages_manage_posts + pages_read_engagement, then extend it to long-lived in Business Settings \u2192 System Users.'
  },
  {
    id: 'instagram', label: 'Instagram Business',
    fields: [
      { key: 'business_id', label: 'IG business account ID', hint: 'The numeric instagram_business_account id linked to your Facebook Page' },
      { key: 'token', label: 'Meta Graph token', hint: 'Same Meta app \u2014 needs instagram_basic + instagram_content_publish', secret: true }
    ],
    autopublish: true,
    connectHelp: 'The Instagram account must be a Business/Creator account linked to a Facebook Page. The token comes from the same Meta app as the Page token.'
  },
  {
    id: 'tiktok', label: 'TikTok Business',
    fields: [
      { key: 'token', label: 'Access token', hint: 'From TikTok for Developers \u2192 Login Kit \u2192 user access token with user.info.basic', secret: true }
    ],
    autopublish: false,
    autopublishNote: 'TikTok\u2019s Content Posting API needs a per-app audit approval from TikTok before direct posting is allowed. Until then the agent prepares the caption, hook and hashtags, and the video is uploaded in the TikTok app.',
    connectHelp: 'developers.tiktok.com \u2192 create an app \u2192 Login Kit \u2192 authorise your business account. Direct posting additionally requires passing TikTok\u2019s Content Posting API audit.'
  },
  {
    id: 'linkedin', label: 'LinkedIn Company Page',
    fields: [
      { key: 'org_urn', label: 'Organization URN', hint: 'urn:li:organization:XXXXXXX \u2014 the number is in your company page admin URL' },
      { key: 'token', label: 'Access token', hint: 'OAuth token with w_organization_social from a LinkedIn developer app', secret: true }
    ],
    autopublish: true,
    connectHelp: 'linkedin.com/developers \u2192 create an app \u2192 request the Community Management (w_organization_social) product \u2192 OAuth token for a page admin.'
  },
  {
    id: 'youtube', label: 'YouTube Channel',
    fields: [
      { key: 'channel_id', label: 'Channel ID', hint: 'UC\u2026 id from YouTube Studio \u2192 Settings \u2192 Channel \u2192 Advanced' },
      { key: 'token', label: 'OAuth access token', hint: 'Google OAuth token with youtube.readonly (upload scope optional)', secret: true }
    ],
    autopublish: false,
    autopublishNote: 'Video uploads are deliberately manual: the agent prepares the full upload kit (title, description, tags, chapters) and the Video studio renders the file \u2014 a person presses Upload in YouTube Studio and owns what goes public.',
    connectHelp: 'console.cloud.google.com \u2192 enable the YouTube Data API v3 \u2192 OAuth consent \u2192 authorise the channel\u2019s Google account.'
  }
];

export const PLATFORM_PLAYBOOKS = {
  facebook: {
    label: 'Facebook',
    algorithm: 'Feed ranking rewards content that starts conversations: comments and shares count far more than likes, and replies from the Page boost further distribution. Link posts travel less than native photo/text posts; engagement-bait ("tag a friend!", "like if\u2026") is explicitly downranked.',
    format: 'Native photo post with the caption doing the selling. First 2 lines show before "See more" \u2014 lead with the concrete machine/vehicle fact. End with a real question buyers can answer (destination port, use case). Link in the first comment or at the caption end, never as a bare link post.',
    cadence: '3\u20135 posts/week. Reply to every comment within hours \u2014 replies are ranking fuel.',
    metrics: 'Watch: comments per post, shares, 3-second video views, follower growth.'
  },
  instagram: {
    label: 'Instagram',
    algorithm: 'Reach is decided per-post by early engagement velocity: saves and shares are the strongest signals, then comments. Reels get a separate, larger discovery pool than photos. Hashtags are topical metadata (5\u20138 relevant ones), not a reach hack; keyword-rich captions now feed search.',
    format: 'Carousel of 3\u20135 photos per machine (exterior, cab, hour meter, plate/spec card) or a Reel from the Video studio. Caption: hook line \u2192 spec block \u2192 price basis \u2192 "DM the stock ref". Alt text always written.',
    cadence: '4\u20137 posts/week, Reels at least twice. Stories daily reposts cost nothing.',
    metrics: 'Watch: saves, shares, profile visits, DM starts carrying a stock ref.'
  },
  tiktok: {
    label: 'TikTok',
    algorithm: 'Distribution is per-video, follower count nearly irrelevant: every upload is tested on a small audience and promoted on completion rate and rewatches. The first 1\u20132 seconds decide everything. Native-feeling, imperfect footage outperforms polished ads. Watermarks from other apps are downranked.',
    format: '15\u201335s vertical video: open on the most striking fact ("4,200 hours. Shanghai yard. $88k FOB."), quick cuts between angles, text overlays carrying the spec, trending-sound optional but never a claim. Caption short, 3\u20135 hashtags mixing niche (#usedexcavator) and market (#heavyequipment).',
    cadence: '1/day is the growth rate; 3/week is maintenance. Volume wins because each video is its own lottery ticket.',
    metrics: 'Watch: average watch percentage, completion rate, profile taps.'
  },
  linkedin: {
    label: 'LinkedIn',
    algorithm: 'Ranking rewards dwell time and early comments from relevant professionals. Documents/carousels earn the longest dwell. External links are throttled \u2014 put them in comments. Comments the author answers extend a post\u2019s life for days.',
    format: 'Professional buyer framing: market insight or sourcing story first, machine as evidence. Document post (spec card as PDF/carousel) or single photo + 120\u2013200 word text. No hashtag walls \u2014 3 relevant ones.',
    cadence: '2\u20133 posts/week, same 1\u20132 business days apart. Respond to every comment.',
    metrics: 'Watch: impressions among target geographies, comments from buyers/brokers, InMail or site referrals.'
  },
  youtube: {
    label: 'YouTube',
    algorithm: 'Two gates: click-through rate on title+thumbnail, then audience retention \u2014 videos that hold viewers get recommended. Shorts run on a TikTok-style completion loop and are the fastest subscriber source. Search still matters: titles and descriptions are indexed like web pages. Re-uploaded third-party footage is fingerprinted by Content ID and strikes the channel \u2014 only owned or properly licensed media is ever uploaded.',
    format: 'Shorts (15\u201345s vertical) from the Video studio: hook text in the first frame, spec overlays, end card with the stock ref. Long-form later: walkarounds and "how exporting works" explainers. Title = buyer search phrase + concrete fact; description front-loads the first 2 lines; tags are search synonyms.',
    cadence: '2\u20133 Shorts/week sustained beats a burst. Playlists group by machine type and destination market.',
    metrics: 'Watch: CTR (aim 4%+), average view duration, Shorts feed completion, subscribers per video.'
  }
};

/** Compact digest the agent prompt injects — one line per platform. */
export function playbookDigest() {
  return Object.entries(PLATFORM_PLAYBOOKS)
    .map(([id, p]) => `${p.label}: ${p.algorithm} Format: ${p.format}`)
    .join('\n');
}
