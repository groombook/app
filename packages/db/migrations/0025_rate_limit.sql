-- Better-Auth rate limiting table (GRO-574)
CREATE TABLE "rate_limit" (
  key TEXT NOT NULL PRIMARY KEY,
  count INTEGER NOT NULL,
  last_request BIGINT NOT NULL
);
