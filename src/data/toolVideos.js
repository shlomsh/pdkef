// A tool's short video, shown below the tool on its English page. A tool added here
// also gets the player's origin in its CSP, which test:csp allows on /redact/ alone.
/** @type {Record<string, { label: string; embed: string; poster: string }>} */
export const toolVideos = {
  redact: {
    label: 'How to blur text in a PDF, a one-minute video',
    embed: 'https://www.youtube-nocookie.com/embed/6s03GAb_CoI?autoplay=1&rel=0',
    poster: '/images/redaction-guide/how-to-blur-text-in-pdf-video.webp',
  },
};
