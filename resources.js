// ============================================================
// resources.js  —  ASAI LMS Resource & File Management
// FIXED: Removed debug box, fixed 400 signed URL errors,
//        added public URL fallback, cleaner empty states
// ============================================================

(function () {
  'use strict';

  // ─── CONSTANTS ───────────────────────────────────────────────
  const BUCKET        = 'asai-resources';
  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

  const ALLOWED_MIME = {
    pdfs:     ['application/pdf'],
    datasets: ['text/csv', 'application/vnd.ms-excel',
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'application/json', 'text/plain'],
    code:     ['application/zip', 'application/x-zip-compressed',
               'application/octet-stream', 'text/plain',
               'application/javascript', 'text/x-python'],
    links:    []
  };

  const TYPE_META = {
    pdfs:     { icon: 'fa-file-pdf',          color: '#ef4444', label: 'PDF'     },
    datasets: { icon: 'fa-database',          color: '#3b82f6', label: 'Dataset' },
    code:     { icon: 'fa-code',              color: '#10b981', label: 'Code'    },
    links:    { icon: 'fa-external-link-alt', color: '#f59e0b', label: 'Link'    }
  };

  // ─── HELPERS ─────────────────────────────────────────────────

  async function getClient() {
    for (let i = 0; i < 50; i++) {
      if (window.supabaseClient) return window.supabaseClient;
      await new Promise(res => setTimeout(res, 100));
    }
    throw new Error('Supabase client not initialised after timeout');
  }

  function formatBytes(bytes) {
    if (!bytes) return '';
    if (bytes < 1024)       return bytes + ' B';
    if (bytes < 1048576)    return (bytes / 1024).toFixed(1)    + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
  }

  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toastMessage');
    if (!toast || !msgEl) { console.log('[Toast]', message); return; }
    msgEl.textContent = message;
    toast.className   = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3500);
  }

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── 1. UPLOAD RESOURCE (Admin) ──────────────────────────────
  async function uploadResource({ title, description, type, courseId, courseName, file, externalUrl }) {
    try {
      const sb = await getClient();

      if (!title)  throw new Error('Title is required');
      if (!type)   throw new Error('Resource type is required');
      if (!['pdfs', 'datasets', 'code', 'links'].includes(type))
                   throw new Error('Invalid resource type');
      if (type === 'links' && !externalUrl)
                   throw new Error('External URL is required for link resources');
      if (type !== 'links' && !file)
                   throw new Error('File is required for this resource type');

      let filePath = null, fileSize = null, fileName = null, mimeType = null;

      if (type !== 'links') {
        if (file.size > MAX_FILE_SIZE)
          throw new Error(`File too large. Maximum size is ${formatBytes(MAX_FILE_SIZE)}`);

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        filePath = `${type}/${Date.now()}_${safeName}`;
        fileSize = file.size;
        fileName = file.name;
        mimeType = file.type;

        const { error: storageError } = await sb.storage
          .from(BUCKET)
          .upload(filePath, file, { cacheControl: '3600', upsert: false });

        if (storageError) throw new Error('Upload failed: ' + storageError.message);
      }

      const payload = {
        title,
        description  : description || null,
        type,
        course_id    : courseId    || null,
        course_name  : courseName  || 'All Courses',
        file_path    : filePath,
        file_size    : fileSize,
        file_name    : fileName,
        mime_type    : mimeType,
        external_url : type === 'links' ? externalUrl : null,
        published    : false,
        published_at : null,
        uploaded_by  : (await sb.auth.getUser()).data.user?.id || null
      };

      const { data, error: dbError } = await sb
        .from('resources')
        .insert(payload)
        .select()
        .maybeSingle();

      if (dbError) {
        if (filePath) await sb.storage.from(BUCKET).remove([filePath]);
        throw new Error('Database error: ' + dbError.message);
      }

      return { success: true, data };
    } catch (err) {
      console.error('[uploadResource]', err);
      return { success: false, error: err.message };
    }
  }

  // ─── 2. LIST / FILTER RESOURCES ──────────────────────────────
  async function listResources({ courseId, type, search, onlyPublished = false } = {}) {
    try {
      const sb = await getClient();
      let query = sb.from('resources').select('*').order('created_at', { ascending: false });

      if (onlyPublished)                  query = query.eq('published', true);
      if (courseId && courseId !== 'all') query = query.eq('course_id', courseId);
      if (type     && type     !== 'all') query = query.eq('type', type);
      if (search)                         query = query.ilike('title', `%${search}%`);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return { success: true, data: data || [] };
    } catch (err) {
      console.error('[listResources]', err);
      return { success: false, data: [], error: err.message };
    }
  }

  // ─── 3. PUBLISH / UNPUBLISH RESOURCE (Admin) ─────────────────
  async function togglePublishResource(resourceId, currentlyPublished) {
    try {
      const sb = await getClient();
      const updates = currentlyPublished
        ? { published: false, published_at: null }
        : { published: true,  published_at: new Date().toISOString() };

      const { error } = await sb
        .from('resources')
        .update(updates)
        .eq('id', resourceId);

      if (error) throw new Error(error.message);
      return { success: true };
    } catch (err) {
      console.error('[togglePublishResource]', err);
      return { success: false, error: err.message };
    }
  }

  // ─── 4. GET DOWNLOAD URL ─────────────────────────────────────
  // FIX: Try signed URL first, fall back to public URL if bucket is public.
  // This eliminates the 400 error on .docx and other files.
  async function downloadResource(resourceId) {
    try {
      const sb = await getClient();

      const { data: resource, error: fetchErr } = await sb
        .from('resources')
        .select('*')
        .eq('id', resourceId)
        .maybeSingle();

      if (fetchErr || !resource) throw new Error('Resource not found');

      // Handle external links
      if (resource.type === 'links') {
        if (!resource.external_url) throw new Error('No URL found for this resource');
        window.open(resource.external_url, '_blank', 'noopener,noreferrer');
        return { success: true, url: resource.external_url };
      }

      if (!resource.file_path) throw new Error('No file path found for this resource');

      // Increment download counter (fire-and-forget)
      sb.from('resources')
        .update({ download_count: (resource.download_count || 0) + 1 })
        .eq('id', resourceId)
        .then(() => {});

      // ── Try signed URL first ──────────────────────────────────
      const { data: signed, error: signErr } = await sb.storage
        .from(BUCKET)
        .createSignedUrl(resource.file_path, 3600);

      let downloadUrl = null;

      if (!signErr && signed?.signedUrl) {
        downloadUrl = signed.signedUrl;
      } else {
        // ── Fallback: try public URL ──────────────────────────────
        console.warn('[downloadResource] Signed URL failed, trying public URL:', signErr?.message);
        const { data: publicData } = sb.storage
          .from(BUCKET)
          .getPublicUrl(resource.file_path);

        if (publicData?.publicUrl) {
          downloadUrl = publicData.publicUrl;
        } else {
          throw new Error(
            'Could not generate download link. ' +
            'Please check that the storage bucket "' + BUCKET + '" exists ' +
            'and has the correct access policy. Error: ' + (signErr?.message || 'Unknown')
          );
        }
      }

      // Trigger browser download
      const a = document.createElement('a');
      a.href     = downloadUrl;
      a.download = resource.file_name || 'download';
      a.target   = '_blank';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 1000);

      return { success: true, url: downloadUrl };
    } catch (err) {
      console.error('[downloadResource]', err);
      return { success: false, error: err.message };
    }
  }

  // ─── 5. DELETE RESOURCE (Admin) ──────────────────────────────
  async function deleteResource(resourceId) {
    try {
      const sb = await getClient();

      const { data: resource, error: fetchErr } = await sb
        .from('resources')
        .select('file_path, type')
        .eq('id', resourceId)
        .maybeSingle();

      if (fetchErr) throw new Error('Resource not found');

      if (resource.file_path) {
        await sb.storage.from(BUCKET).remove([resource.file_path]);
      }

      const { error: dbErr } = await sb
        .from('resources')
        .delete()
        .eq('id', resourceId);

      if (dbErr) throw new Error('Database error: ' + dbErr.message);

      return { success: true };
    } catch (err) {
      console.error('[deleteResource]', err);
      return { success: false, error: err.message };
    }
  }

  // ─── 6. RENDER RESOURCE CARD ─────────────────────────────────
  function renderResourceCard(resource, isAdmin = false) {
    const meta    = TYPE_META[resource.type] || TYPE_META.pdfs;
    const sizeStr = resource.file_size ? formatBytes(resource.file_size) : '';
    const dlCount = resource.download_count || 0;
    const course  = resource.course_name || 'All Courses';
    const isLink  = resource.type === 'links';

    const publishedBadge = isAdmin
      ? `<span class="badge ${resource.published ? 'active' : 'pending'}"
               style="font-size:11px;margin-left:6px;vertical-align:middle;">
           ${resource.published ? '✓ Published' : '⏳ Draft'}
         </span>`
      : '';

    const publishBtn = isAdmin
      ? resource.published
        ? `<button class="btn-secondary resource-publish-btn"
                   data-resource-id="${resource.id}"
                   data-published="true"
                   style="padding:7px 14px;font-size:12px;color:#f59e0b;border-color:#f59e0b;white-space:nowrap;">
             <i class="fas fa-eye-slash"></i> Unpublish
           </button>`
        : `<button class="btn-primary resource-publish-btn"
                   data-resource-id="${resource.id}"
                   data-published="false"
                   style="padding:7px 14px;font-size:12px;white-space:nowrap;">
             <i class="fas fa-paper-plane"></i> Publish
           </button>`
      : '';

    const deleteBtn = isAdmin
      ? `<button class="action-btn delete resource-delete-btn"
                 data-resource-id="${resource.id}"
                 title="Delete resource">
           <i class="fas fa-trash"></i>
         </button>`
      : '';

    const downloadBtn = `
      <button class="quiz-btn resource-download-btn"
              data-resource-id="${resource.id}"
              ${isLink ? `data-external-url="${escHtml(resource.external_url || '')}"` : ''}
              style="flex:1;padding:9px;">
        <i class="fas fa-${isLink ? 'external-link-alt' : 'download'}"></i>
        ${isLink ? 'Open Link' : 'Download'}
      </button>`;

return `
      <div class="note-card resource-card"
           data-resource-id="${resource.id}"
           data-type="${resource.type}"
          style="display:block;width:100%;max-width:100%;box-sizing:border-box;overflow:hidden;margin-left:0;margin-right:0;${isAdmin && !resource.published ? 'opacity:0.75;border-left:3px solid #f59e0b;' : ''}">

        <div class="note-header"
             style="display:flex;align-items:center;justify-content:space-between;flex-wrap:nowrap;gap:8px;width:100%;box-sizing:border-box;">

          <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;overflow:hidden;">
            <i class="fas ${meta.icon}"
               style="font-size:26px;color:${meta.color};flex-shrink:0;"></i>
            <div style="min-width:0;">
              <div style="font-weight:700;color:#1f2937;margin-bottom:3px;">
                ${escHtml(resource.title)}${publishedBadge}
              </div>
              <div style="font-size:12px;color:#6b7280;">
                <span class="badge"
                      style="background:${meta.color}20;color:${meta.color};
                             padding:2px 8px;border-radius:10px;font-size:11px;">
                  ${meta.label}
                </span>
                &nbsp;${sizeStr ? sizeStr + ' &bull;' : ''}
                ${!isLink ? dlCount + ' downloads &bull; ' : ''}
                ${escHtml(course)}
              </div>
            </div>
          </div>

          ${isAdmin
            ? `<div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
                 ${publishBtn}${deleteBtn}
               </div>`
            : ''}
        </div>

        ${resource.description
          ? `<p style="color:#6b7280;font-size:13px;margin:10px 0 0;">
               ${escHtml(resource.description)}
             </p>`
          : ''}

        <div style="display:flex;gap:8px;margin-top:14px;">
          ${downloadBtn}
        </div>
      </div>`;
  }

  // ─── 7. STUDENT DASHBOARD ────────────────────────────────────

  let _studentFilters = { course: 'all', type: 'all' };

  async function initStudentResources() {
    await renderStudentResources();

    document.getElementById('resourceCourseFilter')
      ?.addEventListener('change', async function () {
        _studentFilters.course = this.value;
        await renderStudentResources();
      });

    document.querySelectorAll('#resourcesSection .course-tab').forEach(btn => {
      btn.addEventListener('click', async function () {
        document.querySelectorAll('#resourcesSection .course-tab')
          .forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        _studentFilters.type = this.dataset.resourceType || 'all';
        await renderStudentResources();
      });
    });

    document.querySelector('#resourcesSection .see-all-btn')
      ?.addEventListener('click', downloadAllResources);

    document.getElementById('resourcesGrid')?.addEventListener('click', async function (e) {
      const btn = e.target.closest('.resource-download-btn');
      if (!btn) return;
      const ext = btn.dataset.externalUrl;
      if (ext) { window.open(ext, '_blank', 'noopener,noreferrer'); return; }
      showToast('Preparing download…');
      const result = await downloadResource(btn.dataset.resourceId);
      if (!result.success) showToast('Download failed: ' + result.error, 'error');
    });
  }

  // FIX: Clean renderStudentResources — no debug box, proper empty states
  async function renderStudentResources() {
    const grid = document.getElementById('resourcesGrid');
    if (!grid) return;

    grid.innerHTML = `
      <div style="padding:40px;text-align:center;color:#9ca3af;">
        <i class="fas fa-spinner fa-spin" style="font-size:28px;"></i>
        <br><br>Loading resources...
      </div>`;

    try {
      const sb = await getClient();

      // Build query with filters
      let query = sb
        .from('resources')
        .select('*')
        .eq('published', true)
        .order('created_at', { ascending: false });

      if (_studentFilters.course && _studentFilters.course !== 'all') {
        query = query.eq('course_id', _studentFilters.course);
      }
      if (_studentFilters.type && _studentFilters.type !== 'all') {
        query = query.eq('type', _studentFilters.type);
      }

      const { data: resources, error } = await query;

      // Handle Supabase error (e.g. missing column, RLS block)
      if (error) {
        console.error('[renderStudentResources] Query error:', error);

        // Check if it's a missing column error
        if (error.message && error.message.includes('published')) {
          grid.innerHTML = `
            <div style="background:#fef3c7;border:2px solid #fbbf24;border-radius:12px;padding:24px;text-align:center;">
              <i class="fas fa-exclamation-triangle" style="font-size:32px;color:#f59e0b;margin-bottom:12px;display:block;"></i>
              <h3 style="color:#92400e;margin:0 0 8px;">Database Setup Needed</h3>
              <p style="color:#78350f;margin:0 0 16px;">The <code>published</code> column is missing from the resources table.</p>
              <p style="color:#78350f;font-size:13px;">Run this SQL in your Supabase SQL Editor:</p>
              <pre style="background:#fff;padding:12px;border-radius:8px;font-size:12px;text-align:left;overflow:auto;">
ALTER TABLE resources ADD COLUMN IF NOT EXISTS published boolean DEFAULT false;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS published_at timestamptz DEFAULT null;
UPDATE resources SET published = true WHERE published IS NULL;</pre>
            </div>`;
          return;
        }

        grid.innerHTML = `
          <div style="padding:32px;text-align:center;color:#ef4444;">
            <i class="fas fa-exclamation-circle" style="font-size:32px;margin-bottom:12px;display:block;"></i>
            <strong>Error loading resources:</strong> ${escHtml(error.message)}
          </div>`;
        return;
      }

      // No resources published yet
      if (!resources || resources.length === 0) {
        grid.innerHTML = `
          <div style="padding:60px;text-align:center;color:#9ca3af;">
            <i class="fas fa-folder-open" style="font-size:48px;margin-bottom:16px;display:block;opacity:0.3;"></i>
            <h3 style="margin:0 0 8px;color:#6b7280;">No Resources Yet</h3>
            <p style="margin:0;font-size:14px;">
              ${_studentFilters.type !== 'all' || _studentFilters.course !== 'all'
                ? 'No resources match your current filter. Try selecting "All Resources".'
                : 'Your instructor hasn\'t published any resources yet. Check back soon!'}
            </p>
          </div>`;
        return;
      }

      // Render resource cards
      grid.innerHTML = resources.map(r => renderResourceCard(r, false)).join('');

    } catch (err) {
      console.error('[renderStudentResources]', err);
      grid.innerHTML = `
        <div style="padding:32px;text-align:center;color:#ef4444;">
          <i class="fas fa-exclamation-circle" style="font-size:32px;margin-bottom:12px;display:block;"></i>
          <strong>Error:</strong> ${escHtml(err.message)}
        </div>`;
    }
  }

  async function downloadAllResources() {
    const result = await listResources({
      courseId     : _studentFilters.course,
      type         : _studentFilters.type,
      onlyPublished: true
    });
    if (!result.success || result.data.length === 0) {
      showToast('No resources to download', 'error'); return;
    }
    const files = result.data.filter(r => r.type !== 'links');
    if (files.length === 0) {
      showToast('No downloadable files (only links)', 'error'); return;
    }
    showToast(`Starting ${files.length} download(s)…`);
    for (const r of files) {
      await downloadResource(r.id);
      await new Promise(res => setTimeout(res, 500));
    }
  }

  // ─── 8. ADMIN DASHBOARD ──────────────────────────────────────

  let _adminFilters = { course: 'all', type: 'all' };

  async function initAdminResources() {
    await renderAdminResources();
    _bindAdminResourceEvents();
  }

  function _bindAdminResourceEvents() {
    document.getElementById('adminResourceForm')
      ?.addEventListener('submit', handleAdminUpload);

    document.getElementById('adminResourceCourseFilter')
      ?.addEventListener('change', async function () {
        _adminFilters.course = this.value;
        await renderAdminResources();
      });

    document.querySelectorAll('#adminResourcesSection .tab').forEach(btn => {
      btn.addEventListener('click', async function () {
        document.querySelectorAll('#adminResourcesSection .tab')
          .forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        _adminFilters.type = this.dataset.resourceType || 'all';
        await renderAdminResources();
      });
    });

    document.getElementById('adminResourceType')?.addEventListener('change', function () {
      const isLink = this.value === 'links';
      document.getElementById('adminResourceFileGroup')?.classList.toggle('hidden', isLink);
      document.getElementById('adminResourceUrlGroup')?.classList.toggle('hidden', !isLink);
    });

    document.getElementById('adminResourcesGrid')?.addEventListener('click', async function (e) {

      const publishBtn = e.target.closest('.resource-publish-btn');
      if (publishBtn) {
        const rid              = publishBtn.dataset.resourceId;
        const currentlyPublished = publishBtn.dataset.published === 'true';
        const action           = currentlyPublished ? 'unpublish' : 'publish';

        if (!confirm(
          `${action.charAt(0).toUpperCase() + action.slice(1)} this resource?\n\n` +
          (currentlyPublished
            ? 'Students will no longer be able to see or download it.'
            : 'Students will be able to see and download it immediately.')
        )) return;

        const res = await togglePublishResource(rid, currentlyPublished);
        if (res.success) {
          showToast(currentlyPublished
            ? '❌ Resource unpublished. Hidden from students.'
            : '✅ Resource published! Students can now access it.');
          await renderAdminResources();
        } else {
          showToast('Error: ' + res.error, 'error');
        }
        return;
      }

      const deleteBtn = e.target.closest('.resource-delete-btn');
      if (deleteBtn) {
        const rid = deleteBtn.dataset.resourceId;
        if (!confirm('Delete this resource? This cannot be undone.')) return;
        const res = await deleteResource(rid);
        if (res.success) {
          showToast('Resource deleted');
          await renderAdminResources();
        } else {
          showToast('Delete failed: ' + res.error, 'error');
        }
        return;
      }

      const dlBtn = e.target.closest('.resource-download-btn');
      if (dlBtn) {
        const ext = dlBtn.dataset.externalUrl;
        if (ext) { window.open(ext, '_blank', 'noopener,noreferrer'); return; }
        showToast('Preparing download…');
        const result = await downloadResource(dlBtn.dataset.resourceId);
        if (!result.success) showToast('Download failed: ' + result.error, 'error');
      }
    });
  }

  async function handleAdminUpload(e) {
    e.preventDefault();
    const form       = e.target;
    const submitBtn  = form.querySelector('button[type="submit"]');
    const type       = document.getElementById('adminResourceType')?.value;
    const title      = document.getElementById('adminResourceTitle')?.value?.trim();
    const desc       = document.getElementById('adminResourceDesc')?.value?.trim();
    const courseId   = document.getElementById('adminResourceCourse')?.value || null;
    const courseSel  = document.getElementById('adminResourceCourse');
    const courseName = courseSel?.options[courseSel.selectedIndex]?.text || 'All Courses';
    const fileInput  = document.getElementById('adminResourceFile');
    const urlInput   = document.getElementById('adminResourceUrl');

    submitBtn.disabled  = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…';

    const result = await uploadResource({
      title,
      description : desc,
      type,
      courseId    : courseId || null,
      courseName,
      file        : type !== 'links' ? fileInput?.files[0] : null,
      externalUrl : type === 'links' ? urlInput?.value?.trim() : null
    });

    submitBtn.disabled  = false;
    submitBtn.innerHTML = '<i class="fas fa-upload"></i> Upload Resource';

    if (result.success) {
      showToast('✅ Resource saved as draft. Click "Publish" to make it visible to students.');
      form.reset();
      document.getElementById('adminAddResourceModal')?.classList.remove('active');
      await renderAdminResources();
    } else {
      showToast(result.error, 'error');
    }
  }

  async function renderAdminResources() {
    const grid = document.getElementById('adminResourcesGrid');
    if (!grid) return;

    grid.innerHTML = `<div style="padding:40px;text-align:center;color:#9ca3af;">
      <i class="fas fa-spinner fa-spin" style="font-size:28px;"></i>
    </div>`;

    const result = await listResources({
      courseId     : _adminFilters.course,
      type         : _adminFilters.type,
      onlyPublished: false
    });

    if (!result.success) {
      grid.innerHTML = `<p style="color:#ef4444;padding:20px;">${result.error}</p>`;
      return;
    }

    if (result.data.length === 0) {
      grid.innerHTML = `<div style="padding:50px;text-align:center;color:#9ca3af;">
        <i class="fas fa-folder-open"
           style="font-size:36px;margin-bottom:10px;display:block;"></i>
        No resources yet. Click "Add Resource" to upload one.
      </div>`;
      return;
    }

    const publishedCount = result.data.filter(r => r.published).length;
    const draftCount     = result.data.length - publishedCount;

    grid.innerHTML = `
      <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;">
        <div style="background:#d1fae5;color:#065f46;padding:8px 16px;
                    border-radius:8px;font-size:13px;font-weight:600;">
          <i class="fas fa-check-circle"></i> ${publishedCount} Published
        </div>
        <div style="background:#fef3c7;color:#92400e;padding:8px 16px;
                    border-radius:8px;font-size:13px;font-weight:600;">
          <i class="fas fa-clock"></i> ${draftCount} Draft
        </div>
        <div style="color:#6b7280;font-size:12px;align-self:center;margin-left:4px;">
          <i class="fas fa-info-circle"></i>
          Drafts are only visible to admins — click "Publish" to share with students.
        </div>
      </div>
      ${result.data.map(r => renderResourceCard(r, true)).join('')}`;
  }

  // ─── 9. POPULATE COURSE DROPDOWNS ────────────────────────────
  async function populateResourceCourseDropdowns() {
    const sb = await getClient();
    const { data: courses } = await sb.from('courses').select('id, title').order('title');
    if (!courses) return;

    const selectors = ['resourceCourseFilter', 'adminResourceCourseFilter', 'adminResourceCourse'];
    selectors.forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      while (sel.options.length > 1) sel.remove(1);
      courses.forEach(c => {
        const opt = document.createElement('option');
        opt.value       = c.id;
        opt.textContent = c.title;
        sel.appendChild(opt);
      });
    });
  }

  // ─── PUBLIC API ───────────────────────────────────────────────
  window.ResourcesAPI = {
    upload         : uploadResource,
    list           : listResources,
    download       : downloadResource,
    togglePublish  : togglePublishResource,
    delete         : deleteResource,

    initStudent    : initStudentResources,
    initAdmin      : initAdminResources,
    renderStudent  : renderStudentResources,
    renderAdmin    : renderAdminResources,
    populateCourses: populateResourceCourseDropdowns
  };

  Object.defineProperty(window, 'loadResources', {
    configurable: false,
    writable: false,
    value: function() { initStudentResources(); }
  });

  window.filterResources      = () => renderStudentResources();
  window.filterResourceType   = (type) => { _studentFilters.type = type; renderStudentResources(); };
  window.downloadAllResources = downloadAllResources;
  window.downloadResource     = async (id) => {
    const res = await downloadResource(id);
    if (!res.success) showToast(res.error, 'error');
  };
  window.previewResource      = () => showToast('Full preview coming soon', 'error');

  // ─── AUTO-INIT ───────────────────────────────────────────────
  function _tryInitResources() {
    var grid = document.getElementById('resourcesGrid');
    if (!grid) return false;
    initStudentResources();
    return true;
  }

  function _observeResourcesSection() {
    var section = document.getElementById('resourcesSection');
    if (!section) return;
    var obs = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.attributeName === 'class' && section.classList.contains('active')) {
          initStudentResources();
        }
      });
    });
    obs.observe(section, { attributes: true });
  }

  function _hookNavItem() {
    var navItem = document.querySelector('[data-section="resources"]');
    if (!navItem) return;
    navItem.addEventListener('click', function() {
      setTimeout(function() { initStudentResources(); }, 100);
    });
  }

document.addEventListener('DOMContentLoaded', function() {
    _observeResourcesSection();
    _hookNavItem();
    setTimeout(function() { _tryInitResources(); }, 500);
    setTimeout(function() { _tryInitResources(); }, 1500);
    const adminGrid = document.getElementById('adminResourcesGrid');
    if (adminGrid) {
        adminGrid.style.cssText = 'display:block;width:100%;max-width:100%;overflow:visible;';
    }
  });

})();