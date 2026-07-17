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

        const user = await this.readJsonResponse<any>(usersResp, 'WordPress users/me endpoint');
        return { success: true, siteName: user.name || siteUrl };
      }

      const settings = await this.readJsonResponse<any>(response, 'WordPress settings endpoint');
      return { success: true, siteName: settings.title || siteUrl };
    } catch (err: any) {
      return {
        success: false,
        error: `Could not connect to WordPress site: ${err.message || 'Network error'}`,
      };
    }
  }

  /**
   * Upload a media file (image) to the WP library.
   * Returns the media ID + source URL so the caller can attach it as
   * a featured_media on a post.
   */
  async uploadMedia(
    siteUrl: string,
    username: string,
    appPassword: string,
    imageBytes: Uint8Array,
    filename: string,
    contentType = 'image/png',
    altText?: string,
  ): Promise<{ id: number; url: string }> {
    const baseUrl = this.normalizeUrl(siteUrl);
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(username, appPassword),
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: imageBytes as unknown as BodyInit,
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`WordPress media upload failed (HTTP ${res.status}): ${errBody.slice(0, 300)}`);
    }
    const data = await this.readJsonResponse<any>(res, 'WordPress media upload endpoint');
    const mediaId = data.id as number;
    const url = (data.source_url as string) ?? (data.guid?.rendered as string) ?? '';
    // Optional alt text
    if (altText) {
      try {
        await fetch(`${baseUrl}/wp-json/wp/v2/media/${mediaId}`, {
          method: 'POST',
          headers: { ...this.authHeaders(username, appPassword), 'Content-Type': 'application/json' },
          body: JSON.stringify({ alt_text: altText }),
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        // alt text is best-effort
      }
    }
    return { id: mediaId, url };
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
      featuredMediaId?: number;
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
    if (post.featuredMediaId) body.featured_media = post.featuredMediaId;

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

    const result = await this.readJsonResponse<any>(response, 'WordPress posts endpoint');
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

    const categories = await this.readJsonResponse<any[]>(response, 'WordPress categories endpoint');
    return categories.map((cat: any) => ({
      id: cat.id,
      name: cat.name,
    }));
  }

  /**
   * Get pages from WordPress so users can publish a blog as a child page.
   */
  async getPages(
    siteUrl: string,
    username: string,
    appPassword: string
  ): Promise<Array<{ id: number; title: string; slug: string; link: string; parent: number; template: string }>> {
    const baseUrl = this.normalizeUrl(siteUrl);
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/pages?per_page=100&orderby=menu_order&order=asc`, {
      method: 'GET',
      headers: this.authHeaders(username, appPassword),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch pages (HTTP ${response.status})`);
    }

    const pages = await this.readJsonResponse<any[]>(response, 'WordPress pages endpoint');
    return pages.map((page: any) => ({
      id: page.id,
      title: this.cleanRenderedText(page.title?.rendered) || page.slug || `Page ${page.id}`,
      slug: page.slug || '',
      link: page.link || '',
      parent: page.parent || 0,
      template: page.template || '',
    }));
  }

  /**
   * Discover page templates exposed by the active WordPress theme.
   * OPTIONS is used because classic and block themes expose templates
   * differently, while the Pages endpoint schema normalizes the choices.
   */
  async getPageTemplates(
    siteUrl: string,
    username: string,
    appPassword: string
  ): Promise<Array<{ value: string; label: string }>> {
    const baseUrl = this.normalizeUrl(siteUrl);
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/pages`, {
      method: 'OPTIONS',
      headers: this.authHeaders(username, appPassword),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return [];

    const payload = await this.readJsonResponse<any>(response, 'WordPress pages schema endpoint');
    const endpoints = Array.isArray(payload?.endpoints) ? payload.endpoints : [];
    const values = endpoints
      .flatMap((endpoint: any) => endpoint?.args?.template?.enum || [])
      .filter((value: unknown): value is string => typeof value === 'string') as string[];

    return [...new Set(values)].map((value) => ({
      value,
      label: value
        ? value.replace(/\.php$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (char: string) => char.toUpperCase())
        : 'Default theme template',
    }));
  }

  async getMenus(
    siteUrl: string,
    username: string,
    appPassword: string
  ): Promise<Array<{ id: number; name: string; locations: string[] }>> {
    const baseUrl = this.normalizeUrl(siteUrl);
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/menus?per_page=100&context=edit`, {
      headers: this.authHeaders(username, appPassword),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return [];

    const menus = await this.readJsonResponse<any[]>(response, 'WordPress menus endpoint');
    return menus.map((menu: any) => ({
      id: menu.id,
      name: this.cleanRenderedText(menu.name) || `Menu ${menu.id}`,
      locations: Array.isArray(menu.locations) ? menu.locations : [],
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

    const data = await this.readJsonResponse<any>(response, 'WordPress create category endpoint');
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
      template?: string;
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
        template: page.template || undefined,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await this.readJsonResponse<any>(res, 'WordPress pages endpoint').catch(() => ({}));
      throw new Error((err as any).message || 'Could not create WordPress page');
    }

    const data = await this.readJsonResponse<any>(res, 'WordPress pages endpoint');
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
      const pages = await this.readJsonResponse<any[]>(res, 'WordPress pages lookup endpoint');
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
    updates: {
      status?: string;
      content?: string;
      title?: string;
      slug?: string;
      parent?: number;
      template?: string;
    }
  ): Promise<{ id: number; url: string }> {
    const baseUrl = this.normalizeUrl(siteUrl);
    const response = await fetch(`${baseUrl}/wp-json/wp/v2/pages/${pageId}`, {
      method: 'PUT',
      headers: {
        ...this.authHeaders(username, appPassword),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const err = await this.readJsonResponse<any>(response, 'WordPress update page endpoint').catch(() => ({}));
      throw new Error((err as any).message || 'Could not update WordPress page');
    }
    const data = await this.readJsonResponse<any>(response, 'WordPress update page endpoint');
    return { id: data.id, url: data.link || data.guid?.rendered || '' };
  }

  async addPageToMenu(
    siteUrl: string,
    username: string,
    appPassword: string,
    input: { menuId: number; pageId: number; title: string }
  ): Promise<void> {
    const baseUrl = this.normalizeUrl(siteUrl);
    const existingResponse = await fetch(
      `${baseUrl}/wp-json/wp/v2/menu-items?menus=${input.menuId}&per_page=100&context=edit`,
      {
        headers: this.authHeaders(username, appPassword),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (existingResponse.ok) {
      const items = await this.readJsonResponse<any[]>(
        existingResponse,
        'WordPress menu items endpoint',
      );
      const alreadyAdded = items.some((item) =>
        Number(item.object_id) === input.pageId && item.object === 'page'
      );
      if (alreadyAdded) return;
    }

    const response = await fetch(`${baseUrl}/wp-json/wp/v2/menu-items`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(username, appPassword),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: input.title,
        type: 'post_type',
        object: 'page',
        object_id: input.pageId,
        status: 'publish',
        menus: [input.menuId],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const error = await this.readJsonResponse<any>(response, 'WordPress menu items endpoint').catch(() => ({}));
      throw new Error((error as any).message || 'The page was published, but could not be added to the selected menu.');
    }
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
      Accept: 'application/json',
    };
  }

  private normalizeUrl(url: string): string {
    let normalized = url.trim().replace(/\/+$/, '');
    if (!normalized.startsWith('http')) {
      normalized = `https://${normalized}`;
    }
    return normalized;
  }

  private async readJsonResponse<T>(response: Response, context: string): Promise<T> {
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    const trimmed = text.trim();

    if (!trimmed) {
      throw new Error(`${context} returned an empty response (HTTP ${response.status}).`);
    }

    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error(
        `${context} returned ${contentType || 'unknown content type'} instead of JSON `
        + `(HTTP ${response.status}, URL: ${response.url || 'unknown'}). `
        + `This usually means the WordPress REST API request was redirected or blocked. `
        + `Response starts with: ${this.responseSnippet(trimmed)}`,
      );
    }

    try {
      return JSON.parse(trimmed) as T;
    } catch (err) {
      throw new Error(
        `${context} returned invalid JSON (HTTP ${response.status}, URL: ${response.url || 'unknown'}). `
        + `Response starts with: ${this.responseSnippet(trimmed)}. `
        + `Parse error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private responseSnippet(value: string): string {
    return value
      .replace(/\s+/g, ' ')
      .slice(0, 240);
  }

  private cleanRenderedText(value?: string): string {
    return String(value || '')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
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
          const existing = await this.readJsonResponse<any[]>(searchResp, 'WordPress tags search endpoint');
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
          const created = await this.readJsonResponse<any>(createResp, 'WordPress create tag endpoint');
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
