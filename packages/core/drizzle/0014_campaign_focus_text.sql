-- Campaign focus can be a full instruction, not just a short keyword.
-- Keep it intact so generated blogs, banners, and social posts receive the
-- complete user intent instead of a truncated sentence.

ALTER TABLE "campaign_launches"
  ALTER COLUMN "keyword" TYPE text;

ALTER TABLE "blog_posts"
  ALTER COLUMN "keyword" TYPE text;
