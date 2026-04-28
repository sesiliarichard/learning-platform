/**
 * talent-hub.js
 * ─────────────────────────────────────────────────────────────

const _supabase = window._sbClient;

// ─────────────────────────────────────────────────────────────
// TALENT PROFILES
// ─────────────────────────────────────────────────────────────

/**
 * Upload a file to Supabase Storage and return its public URL.
 * @param {File}   file       – the File object from an <input type="file">
 * @param {string} folder     – 'headshots' | 'projects'
 * @returns {Promise<string>} public URL
 */
async function uploadTalentFile(file, folder) {
  const ext = file.name.split('.').pop();
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await _supabase.storage
    .from('talent-files')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) throw error;

  const { data: urlData } = _supabase.storage
    .from('talent-files')
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

/**
 * Submit a new talent profile.
 * Called from register-talent.html → submitTalent()
 *
 * @param {Object} params
 * @param {string} params.full_name
 * @param {string} params.email
 * @param {string} params.country_code
 * @param {string} params.country_name
 * @param {string} params.role
 * @param {string} params.bio
 * @param {string} params.experience       – 'beginner' | 'intermediate' | 'advanced'
 * @param {File}   params.headshot_file    – required
 * @param {File}   [params.project_file]   – optional
 * @returns {Promise<{data, error}>}
 */
async function submitTalentProfile(params) {
  try {
    // Upload headshot (required)
    const headshot_url = await uploadTalentFile(params.headshot_file, 'headshots');

    // Upload project doc (optional)
    let project_url = null;
    if (params.project_file) {
      project_url = await uploadTalentFile(params.project_file, 'projects');
    }

    const { data, error } = await _supabase
      .from('talent_profiles')
      .insert([{
        full_name:    params.full_name,
        email:        params.email,
        country_code: params.country_code,
        country_name: params.country_name,
        role:         params.role,
        bio:          params.bio,
        experience:   params.experience,
        headshot_url,
        project_url,
      }])
      .select()
      .single();

    return { data, error };
  } catch (err) {
    return { data: null, error: err };
  }
}

// ─────────────────────────────────────────────────────────────
// HIRE REQUESTS
// ─────────────────────────────────────────────────────────────

/**
 * Submit a company hire request.
 * Called from hire-talent.html → submitHire()
 *
 * @param {Object} params
 * @param {string} params.first_name
 * @param {string} params.last_name
 * @param {string} params.email
 * @param {string} params.contact
 * @param {string} params.company_name
 * @param {string} params.industry
 * @param {string} params.country
 * @param {string} params.talent_needs
 * @returns {Promise<{data, refNumber, error}>}
 */
async function submitHireRequest(params) {
  const refNumber = 'WIA-' + Date.now().toString(36).toUpperCase().slice(-6);

  const { data, error } = await _supabase
    .from('hire_requests')
    .insert([{
      ref_number:   refNumber,
      first_name:   params.first_name,
      last_name:    params.last_name,
      email:        params.email,
      contact:      params.contact,
      company_name: params.company_name,
      industry:     params.industry || null,
      country:      params.country  || null,
      talent_needs: params.talent_needs || null,
    }])
    .select()
    .single();

  return { data, refNumber, error };
}

// ─────────────────────────────────────────────────────────────
// TALENT DISCOVERY  (talent-discovery.html)
// ─────────────────────────────────────────────────────────────

/**
 * Fetch approved talent profiles with optional filters.
 *
 * @param {Object} opts
 * @param {string}   [opts.search]      – free-text search against role + bio
 * @param {string[]} [opts.skills]      – skill tags to match (stored in bio / role)
 * @param {string}   [opts.role]        – exact role filter
 * @param {string[]} [opts.experience]  – array of 'beginner'|'intermediate'|'advanced'
 * @param {string}   [opts.country]     – country code filter
 * @param {number}   [opts.page]        – 1-based page number (default 1)
 * @param {number}   [opts.pageSize]    – results per page (default 10)
 * @returns {Promise<{data: Array, count: number, error}>}
 */
async function fetchTalentProfiles(opts = {}) {
  const {
    search     = '',
    experience = [],
    country    = '',
    page       = 1,
    pageSize   = 10,
  } = opts;

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  let query = _supabase
    .from('talent_profiles')
    .select('*', { count: 'exact' })
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .range(from, to);

  // Free-text search across role and bio using Postgres ilike
  if (search) {
    query = query.or(`role.ilike.%${search}%,bio.ilike.%${search}%,full_name.ilike.%${search}%`);
  }

  // Experience filter
  if (experience.length > 0) {
    query = query.in('experience', experience);
  }

  // Country filter
  if (country) {
    query = query.eq('country_code', country);
  }

  const { data, count, error } = await query;
  return { data: data || [], count: count || 0, error };
}

/**
 * Fetch a single talent profile by ID.
 * @param {string} id
 */
async function fetchTalentById(id) {
  const { data, error } = await _supabase
    .from('talent_profiles')
    .select('*')
    .eq('id', id)
    .eq('status', 'approved')
    .single();
  return { data, error };
}

// ─────────────────────────────────────────────────────────────
// STATS  (career-support.html homepage counters)
// ─────────────────────────────────────────────────────────────

/**
 * Returns aggregate stats for the hero stat bar.
 * Falls back to zeros if the tables don't exist yet.
 *
 * @returns {Promise<{talents: number, companies: number, matches: number}>}
 */
async function fetchHubStats() {
  try {
    const [talentsRes, companiesRes] = await Promise.all([
      _supabase
        .from('talent_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved'),
      _supabase
        .from('hire_requests')
        .select('id', { count: 'exact', head: true }),
    ]);

    return {
      talents:   talentsRes.count  || 0,
      companies: companiesRes.count || 0,
      matches:   0,   // add a `matches` table later if needed
    };
  } catch {
    return { talents: 0, companies: 0, matches: 0 };
  }
}

// ─────────────────────────────────────────────────────────────
// Export a single namespace so pages can do:
//   TalentHub.submitTalentProfile(...)
//   TalentHub.fetchTalentProfiles(...)
//   etc.
// ─────────────────────────────────────────────────────────────
window.TalentHub = {
  supabase:            _supabase,
  uploadTalentFile,
  submitTalentProfile,
  submitHireRequest,
  fetchTalentProfiles,
  fetchTalentById,
  fetchHubStats,
};