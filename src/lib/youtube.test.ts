import { describe, expect, it } from "vitest";

import { parseVideoStats, youtubeVideoId } from "./youtube";

describe("youtubeVideoId", () => {
  it("reads every kind of link", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://m.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("refuses other sites and broken ids", () => {
    expect(youtubeVideoId("https://vimeo.com/123")).toBeNull();
    expect(youtubeVideoId("https://youtube.com/watch?v=short")).toBeNull();
    expect(youtubeVideoId("not a url")).toBeNull();
    expect(youtubeVideoId(null)).toBeNull();
  });
});

describe("parseVideoStats", () => {
  it("reads the statistics, hidden likes as null", () => {
    const stats = parseVideoStats({
      items: [
        { id: "a", statistics: { viewCount: "1200", likeCount: "45", commentCount: "3" } },
        { id: "b", statistics: { viewCount: "10", commentCount: "0" } },
      ],
    });
    expect(stats.get("a")).toEqual({ views: 1200, likes: 45, comments: 3 });
    expect(stats.get("b")).toEqual({ views: 10, likes: null, comments: 0 });
    expect(parseVideoStats(null).size).toBe(0);
  });
});
