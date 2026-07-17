# Landing site worker

This Worker serves every hosted landing page from the shared AWS S3 bucket
through the public S3/CloudFront URL configured in `SITE_STORAGE_PUBLIC_BASE_URL`.

Before deploying:

1. Set `SITE_STORAGE_PREFIX` to match `OBJECT_STORAGE_PREFIX` from the API.
2. Set `SITE_STORAGE_PUBLIC_BASE_URL` to the same public base as `AWS_S3_PUBLIC_URL`.
3. Keep `URL_MODE` as `path` when using the free `workers.dev` domain.
4. Run `npx wrangler deploy` from this directory.

For production subdomains, change `URL_MODE` to `subdomain`, set
`PUBLIC_BASE_DOMAIN`, then add the matching wildcard DNS record and Worker route.

The API writes the live HTML to:

```text
<SITE_STORAGE_PREFIX>/sites/<subdomain>/index.html
```
