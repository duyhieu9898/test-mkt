/**
 * CMS Integration Service
 *
 * WordPress REST API integration for publishing blog posts
 * and managing content on external CMS platforms.
 *
 * Used by: SEO Engine (step 6), Blog management UI
 */

export class CMSIntegration {
  /**
   * Test WordPress connection with provided credentials.
   */
  async testWordPressConnection(
    siteUrl: string,
    username: string,
    appPassword: string
  ): Promise<{ success: boolean; siteName?: string; error?: string }> {
    try {
      const baseUrl = this.normalizeUrl(siteUrl);
      const response = await fetch(`${baseUrl}/wp-json/wp/v2/settings`, {
        method: 'GET',
        headers: this.authHeaders(username, appPassword),
      });

      if (!response.ok) {
        // Try a less privileged endpoint
        const usersResp = await fetch(`${baseUrl}/wp-json/wp/v2/users/me`, {
          method: 'GET',
          headers: this.authHeaders(username, appPassword),
        });

        if (!usersResp.ok) {
          return {
            success: false,
            error: `Authentication failed (HTTP ${usersResp.status}). Check your username and application password.`,
          };
        }

        const user = await usersResp.json();
        return { success: true, siteName: user.name || siteUrl };
      }

      const settings = await response.json();
      return { success: true, siteName: settings.title || siteUrl };
    } catch (err: any) {
      return {
        success: false,
        error: `Could not connect to WordPress site: ${err.message || 'Network error'}`,
      };
    }
  }

  /**
   * Publish a post to WordPress.
   */
  async publishPost(
    siteUrl: string,
    username: string,
    appPassword: string,
    post: {
      title: string;
      content: string;
      excerpt?: string;
      status: 'draft' | 'publish';
      categories?: number[];
      tags?: string[];
    }
  ): Promise<{ id: number; url: string }> {
    const baseUrl = this.normalizeUrl(siteUrl);

    // Resolve tag names to IDs (WordPress needs IDs)
    let tagIds: number[] = [];
    if (post.tags && post.tags.length > 0) {
      tagIds = await this.resolveTagIds(baseUrl, username, appPassword, post.tags);
    }

    const body: Record<string, any> = {
      title: post.title,
      content: post.content,
      status: post.status,
    };

    if (post.excerpt) body.excerpt = post.excerpt;
    if (post.categories && post.categories.length > 0) body.categories = post.categories;
    if (tagIds.length > 0) body.tags = tagIds;

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(username, appPassword),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`WordPress publish failed (HTTP ${response.status}): ${errorBody}`);
    }

    const result = await response.json();
    return {
      id: result.id,
      url: result.link || result.guid?.rendered || '',
    };
  }

  /**
   * Get categories from WordPress site.
   */
  async getCategories(
    siteUrl: string,
    username: string,
    appPassword: string
  ): Promise<Array<{ id: number; name: string }>> {
    const baseUrl = this.normalizeUrl(siteUrl);
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/categories?per_page=100`, {
      method: 'GET',
      headers: this.authHeaders(username, appPassword),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch categories (HTTP ${response.status})`);
    }

    const categories = await response.json();
    return categories.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
    }));
  }

  /**
   * Resolve a category name to a WordPress category ID, creating it if needed.
   */
  async resolveOrCreateCategory(
    siteUrl: string,
    username: string,
    appPassword: string,
    categoryName: string
  ): Promise<number> {
    const categories = await this.getCategories(siteUrl, username, appPassword);
    const existing = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    if (existing) return existing.id;

    // Create new category
    const baseUrl = this.normalizeUrl(siteUrl);
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/categories`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(username, appPassword),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: categoryName }),
    });

    if (!response.ok) {
      throw new Error(`Could not create category "${categoryName}" (HTTP ${response.status})`);
    }

    const data = await response.json();
    return data.id;
  }

  // ---------------------------------------------------------------------------
  // WordPress Pages (not posts)
  // ---------------------------------------------------------------------------

  /**
   * Publish a WordPress PAGE (not post).
   */
  async publishPage(
    siteUrl: string,
    username: string,
    appPassword: string,
    page: {
      title: string;
      content: string;
      status: 'draft' | 'publish';
      parent?: number;
      slug?: string;
    }
  ): Promise<{ id: number; url: string }> {
    const baseUrl = this.normalizeUrl(siteUrl);
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/pages`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(username, appPassword),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: page.title,
        content: page.content,
        status: page.status,
        parent: page.parent || 0,
        slug: page.slug,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).message || 'Could not create WordPress page');
    }

    const data = await res.json();
    return { id: data.id, url: data.link };
  }

  /**
   * Find a parent page by walking a slash-separated path (e.g. '/en/products-land').
   */
  async resolveParentPage(
    siteUrl: string,
    username: string,
    appPassword: string,
    path: string
  ): Promise<number | undefined> {
    const baseUrl = this.normalizeUrl(siteUrl);
    const slugs = path.split('/').filter(Boolean);
    let parentId: number | undefined;

    for (const slug of slugs) {
      const url = `${baseUrl}/wp-json/wp/v2/pages?slug=${slug}${parentId ? `&parent=${parentId}` : ''}`;
      const res = await fetch(url, {
        headers: this.authHeaders(username, appPassword),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const pages = await res.json();
      if (Array.isArray(pages) && pages.length > 0) {
        parentId = pages[0].id;
      }
    }
    return parentId;
  }

  /**
   * Update an existing WordPress page (e.g. set to draft for unpublish).
   */
  async updatePage(
    siteUrl: string,
    username: string,
    appPassword: string,
    pageId: number,
    updates: { status?: string; content?: string }
  ): Promise<void> {
    const baseUrl = this.normalizeUrl(siteUrl);
    await fetch(`${baseUrl}/wp-json/wp/v2/pages/${pageId}`, {
      method: 'PUT',
      headers: {
        ...this.authHeaders(username, appPassword),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
      signal: AbortSignal.timeout(15000),
    });
  }

  /**
   * Permanently delete a WordPress page.
   */
  async deletePage(
    siteUrl: string,
    username: string,
    appPassword: string,
    pageId: number
  ): Promise<void> {
    const baseUrl = this.normalizeUrl(siteUrl);
    await fetch(`${baseUrl}/wp-json/wp/v2/pages/${pageId}?force=true`, {
      method: 'DELETE',
      headers: this.authHeaders(username, appPassword),
      signal: AbortSignal.timeout(15000),
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private authHeaders(username: string, appPassword: string): Record<string, string> {
    const encoded = Buffer.from(`${username}:${appPassword}`).toString('base64');
    return {
      Authorization: `Basic ${encoded}`,
    };
  }

  private normalizeUrl(url: string): string {
    let normalized = url.trim().replace(/\/+$/, '');
    if (!normalized.startsWith('http')) {
      normalized = `https://${normalized}`;
    }
    return normalized;
  }

  /**
   * Resolve tag names to WordPress tag IDs, creating tags that don't exist.
   */
  private async resolveTagIds(
    baseUrl: string,
    username: string,
    appPassword: string,
    tagNames: string[]
  ): Promise<number[]> {
    const ids: number[] = [];

    for (const name of tagNames.slice(0, 10)) {
      try {
        // Search for existing tag
        const searchResp = await fetch(
          `${baseUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}`,
          { headers: this.authHeaders(username, appPassword) }
        );

        if (searchResp.ok) {
          const existing = await searchResp.json();
          const match = existing.find(
            (t: any) => t.name.toLowerCase() === name.toLowerCase()
          );
          if (match) {
            ids.push(match.id);
            continue;
          }
        }

        // Create new tag
        const createResp = await fetch(`${baseUrl}/wp-json/wp/v2/tags`, {
          method: 'POST',
          headers: {
            ...this.authHeaders(username, appPassword),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name }),
        });

        if (createResp.ok) {
          const created = await createResp.json();
          ids.push(created.id);
        }
      } catch {
        // Skip tag if resolution fails — non-critical
      }
    }

    return ids;
  }
}

export const cmsIntegration = new CMSIntegration();
