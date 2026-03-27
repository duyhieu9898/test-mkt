
# Subdomain Routing System

Each landing page can be published under a subdomain.

Example:

companyname.platformdomain.com

Database:

domains

fields:
company_id
subdomain
custom_domain
ssl_status

Routing:

DNS
↓
Edge Router
↓
Landing Page CDN
