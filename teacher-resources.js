// ============================================================
//  ASAI Teacher Dashboard — teacher-resources.js
//  READ-ONLY — Teachers can view & download resources.
//  Only Admins can upload or delete resources.
// ============================================================

let resourcesCache = [];   // all fetched resources

// ─── helpers ────────────────────────────────────────────────
const RES_ICONS = {
  pdfs:     { icon: 'fa-file-pdf',    color: 'var(--red)' },
  datasets: { icon: 'fa-database',    color: 'var(--blu)' },
  code:     { icon: 'fa-code',        color: 'var(--grn)' },
  links:    { icon: 'fa-link',        color: 'var(--amb)' },
  default:  { icon: 'fa-folder-open', color: 'var(--mut)' },
};

const resStyle = type => RES_ICONS[type] || RES_ICONS.default;

const fmtSize = bytes => {
  if (!bytes) return '—';
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
  if (bytes >= 1_024)     return (bytes / 1_024).toFixed(0) + ' KB';
  return bytes + ' B';
};

// ============================================================
//  1.  LOAD RESOURCES FROM SUPABASE
//  FIX: uses teacherState.courses instead of re-fetching,
//       uses supabaseClient consistently (not bare `db`)
// ============================================================
async function loadResourcesFromDB() {
  const grids = ['resGrid','resPDFGrid','resDSGrid','resCodeGrid','resLinksGrid'];
  grids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Loading resources…</p>
      </div>`;
  });

  try {
    // FIX: use already-loaded courses from teacherState — no extra DB call
    const courseIds = teacherState.courses.map(c => c.id);

    // Build the filter: teacher's courses OR course_id is null (shared resources)
let query = supabaseClient
  .from('resources')
  .select(`
    id,
    title,
    type,
    description,
    file_url,
    external_url,
    file_size,
    download_count,
    course_id,
    created_at,
    courses ( id, title, color )
  `)
  .eq('published', true)          
  
  .order('created_at', { ascending: false });
    if (courseIds.length) {
      query = query.or(`course_id.in.(${courseIds.join(',')}),course_id.is.null`);
    } else {
      query = query.is('course_id', null);
    }

    const { data, error } = await query;
    if (error) throw error;

    // FIX: use _esc() on all text fields when storing in cache
    resourcesCache = (data || []).map(r => ({
      id:          r.id,
      title:       r.title       || '',
      type:        r.type        || 'default',
      description: r.description || '',
      fileUrl:     r.file_url    || '',
      externalUrl: r.external_url|| '',
      fileSize:    r.file_size,
      downloads:   r.download_count || 0,
      courseId:    r.course_id,
      courseTitle: r.courses?.title || 'All Courses',
      courseColor: r.courses?.color || 'var(--acc)',
      createdAt:   r.created_at,
    }));

    renderResources();

  } catch (err) {
    console.error('loadResourcesFromDB:', err.message);
    grids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `
        <div class="empty" style="grid-column:1/-1">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load resources: ${_esc(err.message)}</p>
        </div>`;
    });
  }
}

// ============================================================
//  2.  RENDER RESOURCES INTO ALL TAB GRIDS
// ============================================================
function renderResources() {
  const tabMap = {
    resGrid:      null,         // all types
    resPDFGrid:   'pdfs',
    resDSGrid:    'datasets',
    resCodeGrid:  'code',
    resLinksGrid: 'links',
  };

  Object.entries(tabMap).forEach(([gridId, filterType]) => {
    const el = document.getElementById(gridId);
    if (!el) return;

    const list = filterType
      ? resourcesCache.filter(r => r.type === filterType)
      : resourcesCache;

    if (!list.length) {
      el.innerHTML = `
        <div class="empty" style="grid-column:1/-1">
          <i class="fas fa-folder-open"></i>
          <p>No ${filterType ? filterType : ''} resources found.</p>
        </div>`;
      return;
    }

    el.innerHTML = list.map(r => buildResourceCard(r)).join('');
  });
}

// ============================================================
//  3.  BUILD RESOURCE CARD
//  FIX: store resource ID on element using data attributes,
//       never embed URLs directly inside onclick strings.
//       Use _esc() on all user-supplied text.
// ============================================================
function buildResourceCard(r) {
  const { icon, color } = resStyle(r.type);
  const isLink = r.type === 'links';

  return `
    <div class="ic"
         data-res-id="${_esc(String(r.id))}"
         data-res-url="${_esc(isLink ? r.externalUrl : r.fileUrl)}"
         data-res-type="${_esc(r.type)}">

      <!-- Card header -->
      <div class="ic-hd" style="--ic:${color}">
        <i class="fas ${icon}"></i>
        <span class="ic-bdg">${_esc(r.type)}</span>
      </div>

      <!-- Card body -->
      <div class="ic-body">
        <h4>${_esc(r.title)}</h4>
        <p style="color:var(--mut);font-size:11px">${_esc(r.courseTitle)}</p>
        ${r.description ? `
          <p style="font-size:11px;color:var(--txt2);margin-top:3px;
                    line-height:1.4;overflow:hidden;max-height:32px">
            ${_esc(r.description)}
          </p>` : ''}
        <div class="ic-meta" style="margin-top:6px">
          ${r.fileSize
            ? `<span><i class="fas fa-hdd"></i> ${fmtSize(r.fileSize)}</span>`
            : ''}
          <span><i class="fas fa-download"></i> ${r.downloads} downloads</span>
        </div>
      </div>

      <!-- Card actions — FIX: onclick calls use data attributes via helper -->
      <div class="ic-act">
        ${isLink
          ? `<button class="btn bp res-open-btn" title="Open Link">
               <i class="fas fa-external-link-alt"></i> Open
             </button>`
          : `<button class="btn bp res-open-btn" title="Download">
               <i class="fas fa-download"></i> Download
             </button>
             <button class="btn bg res-preview-btn" title="Preview">
               <i class="fas fa-eye"></i>
             </button>`
        }
      </div>

      <!-- Read-only badge -->
      <div style="padding:6px 12px 10px;text-align:right">
        <span class="chip cm" style="font-size:9px">
          <i class="fas fa-lock"></i> Admin managed
        </span>
      </div>
    </div>`;
}

// ============================================================
//  3b. EVENT DELEGATION FOR RESOURCE CARD BUTTONS
//  FIX: reads data attributes instead of embedding URLs in onclick
// ============================================================
document.addEventListener('click', e => {
  const card = e.target.closest('[data-res-id]');
  if (!card) return;

  const resId  = card.dataset.resId;
  const url    = card.dataset.resUrl;
  const type   = card.dataset.resType;
  const isLink = type === 'links';

  if (e.target.closest('.res-open-btn')) {
    openResource(resId, url, isLink);
  } else if (e.target.closest('.res-preview-btn')) {
    previewResource(resId, url, type);
  }
});

// ============================================================
//  4.  OPEN / DOWNLOAD RESOURCE + INCREMENT COUNTER
//  FIX: uses supabaseClient instead of bare `db`
// ============================================================
async function openResource(resourceId, url, isExternal) {
  if (!url || url === 'null' || url === '') {
    toast('Resource URL not available', 'w');
    return;
  }

  if (isExternal) {
    window.open(url, '_blank', 'noopener');
  } else {
    const a = document.createElement('a');
    a.href     = url;
    a.download = '';
    a.target   = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // Increment download count silently
  try {
    const r = resourcesCache.find(x => String(x.id) === String(resourceId));
    if (r) {
      r.downloads++;
      await supabaseClient
        .from('resources')
        .update({ download_count: r.downloads })
        .eq('id', resourceId);
    }
  } catch (err) {
    console.warn('Counter update failed:', err.message);
  }
}

// ============================================================
//  5.  PREVIEW RESOURCE (PDFs / images in browser tab)
// ============================================================
function previewResource(resourceId, url, type) {
  if (!url || url === 'null' || url === '') {
    toast('Preview not available', 'w');
    return;
  }
  if (type === 'pdfs') {
    window.open(url, '_blank', 'noopener');
  } else if (['jpg','jpeg','png','gif','webp'].some(ext => url.toLowerCase().includes(ext))) {
    window.open(url, '_blank', 'noopener');
  } else {
    // For code / datasets just trigger a download
    openResource(resourceId, url, false);
  }
}

// ============================================================
//  6.  FILTER RESOURCES BY COURSE (dropdown hook)
// ============================================================
function filterResources() {
  const couId = document.getElementById('resCouFilter')?.value || '';
  const el    = document.getElementById('resGrid');
  if (!el) return;

  const list = couId
    ? resourcesCache.filter(r => String(r.courseId) === couId)
    : resourcesCache;

  if (!list.length) {
    el.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <i class="fas fa-folder-open"></i>
        <p>No resources for this course.</p>
      </div>`;
    return;
  }
  el.innerHTML = list.map(r => buildResourceCard(r)).join('');
}

// ============================================================
//  7.  SEARCH RESOURCES (search bar hook)
// ============================================================
function searchResources(query) {
  const q    = (query || '').toLowerCase().trim();
  const list = q
    ? resourcesCache.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.courseTitle.toLowerCase().includes(q)
      )
    : resourcesCache;

  const el = document.getElementById('resGrid');
  if (!el) return;

  if (!list.length) {
    el.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <i class="fas fa-search"></i>
        <p>No resources match "<strong>${_esc(q)}</strong>"</p>
      </div>`;
    return;
  }
  el.innerHTML = list.map(r => buildResourceCard(r)).join('');
}

console.log('✅ teacher-resources.js loaded');