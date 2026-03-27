// ============================================================
// projects.js — Project & Research → Supabase Integration
// Add this file to your project folder and link it in
// student-dashboard.html AFTER supabase-config.js:
//   <script src="projects.js"></script>
// ============================================================

const ProjectsAPI = (() => {

    // ── helpers ──────────────────────────────────────────────
    function getCurrentUser() {
        return supabaseClient.auth.getUser();
    }

    function showMsg(msg, type = 'success') {
        if (typeof showToast === 'function') showToast(msg, type);
        else alert(msg);
    }

    function escHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── upload file to Supabase Storage ──────────────────────
    async function uploadFile(file, folder) {
        const { data: { user } } = await getCurrentUser();
        if (!user) return { success: false, error: 'Not authenticated' };

        const ext      = file.name.split('.').pop();
        const fileName = `${user.id}/${folder}/${Date.now()}.${ext}`;

        const { data, error } = await supabaseClient.storage
            .from('project-files')
            .upload(fileName, file, { upsert: true });

        if (error) return { success: false, error: error.message };

        const { data: urlData } = supabaseClient.storage
            .from('project-files')
            .getPublicUrl(fileName);

        return { success: true, fileUrl: urlData.publicUrl, path: fileName };
    }

    // ════════════════════════════════════════════════════════
    // 1. PROPOSAL SUBMISSION
    // ════════════════════════════════════════════════════════
    async function submitProposal(e) {
        e.preventDefault();

        const btn = document.getElementById('submitProposalBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...'; }

        try {
            const { data: { user } } = await getCurrentUser();
if (!user) { showMsg('Not authenticated', 'error'); return; }

const { data: profile } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

if (!profile || profile.role !== 'student') {
    showMsg('Only students can submit this.', 'error');
    return;
}
            

            const title       = document.getElementById('proposalTitle')?.value.trim();
            const description = document.getElementById('proposalDescription')?.value.trim();
            const objectives  = document.getElementById('proposalObjectives')?.value.trim();
            const timeline    = document.getElementById('proposalTimeline')?.value;
            const fileInput   = document.getElementById('proposalFile');

            if (!title || !description || !objectives) {
                showMsg('Please fill in all required fields', 'warning');
                return;
            }

            // Upload file if provided
            let fileUrl = null;
            if (fileInput?.files?.[0]) {
                showMsg('Uploading proposal document...', 'success');
                const up = await uploadFile(fileInput.files[0], 'proposals');
                if (!up.success) { showMsg('File upload failed: ' + up.error, 'error'); return; }
                fileUrl = up.fileUrl;
            }

            // Save to Supabase
            const { error } = await supabaseClient
                .from('project_proposals')
                .insert({
                    student_id:  user.id,
                    title,
                    description,
                    objectives,
                    timeline_weeks: parseInt(timeline) || null,
                    file_url:    fileUrl,
                    status:      'pending'
                });

            if (error) throw error;

            showMsg('Proposal submitted! Admin will review and approve it.', 'success');
            document.getElementById('proposalForm')?.reset();
            clearFileLabel('proposalUpload');

        } catch (err) {
            showMsg('Error: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Proposal'; }
        }
    }

    // ════════════════════════════════════════════════════════
    // 2. PHASE SUBMISSION (1 / 2 / 3)
    // ════════════════════════════════════════════════════════
    async function submitPhase(phaseNum) {
        const workField = document.getElementById('phase' + phaseNum + 'Work');
        if (!workField?.value.trim()) {
            showMsg('Please describe what you are working on in Phase ' + phaseNum + '.', 'warning');
            return;
        }

        const btn = document.querySelector(`#phaseForm${phaseNum} .upload-btn`);
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

        try {
            const { data: { user } } = await getCurrentUser();
if (!user) { showMsg('Not authenticated', 'error'); return; }

const { data: profile } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

if (!profile || profile.role !== 'student') {
    showMsg('Only students can submit this.', 'error');
    return;
}
            

            const plan        = document.getElementById('phase' + phaseNum + 'Plan')?.value.trim();
            const work        = workField.value.trim();
            const challenges  = document.getElementById('phase' + phaseNum + 'Challenges')?.value.trim();
            const nextSteps   = document.getElementById('phase' + phaseNum + 'NextSteps')?.value.trim();
            const results     = document.getElementById('phase' + phaseNum + 'Results')?.value.trim();
            const percentage  = document.getElementById('phase' + phaseNum + 'Percentage')?.value || 0;
            const fileInput   = document.getElementById('phase' + phaseNum + 'File');

            // Collect activities
            const activityItems = document.querySelectorAll(`#phase${phaseNum}ActivityList .activity-list-item span:nth-child(2)`);
            const activities = Array.from(activityItems).map(el => el.textContent.trim());

            // Upload file if provided
            let fileUrl = null;
            if (fileInput?.files?.[0]) {
                showMsg('Uploading file...', 'success');
                const up = await uploadFile(fileInput.files[0], 'phase' + phaseNum);
                if (!up.success) { showMsg('File upload failed: ' + up.error, 'error'); return; }
                fileUrl = up.fileUrl;
            }

            // Get project_proposal_id (latest approved proposal for this student)
            const { data: proposal } = await supabaseClient
                .from('project_proposals')
                .select('id')
                .eq('student_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            // Upsert phase record
            const { error } = await supabaseClient
                .from('project_phases')
                .upsert({
                    student_id:   user.id,
                    proposal_id:  proposal?.id || null,
                    phase_number: phaseNum,
                    plan,
                    work_description: work,
                    challenges,
                    next_steps:   nextSteps,
                    results,
                    activities:   JSON.stringify(activities),
                    completion_percentage: parseInt(percentage),
                    file_url:     fileUrl,
                    status:       'submitted',
                    submitted_at: new Date().toISOString()
                }, { onConflict: 'student_id,phase_number' });

            if (error) throw error;

            // Update tracker UI
            updatePhaseTracker(phaseNum);

            showMsg(`Phase ${phaseNum} submitted! Admin will review your work.`, 'success');

        } catch (err) {
            showMsg('Error: ' + err.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-save"></i> Save &amp; Submit Phase ${phaseNum}`;
            }
        }
    }

    // ════════════════════════════════════════════════════════
    // 3. PROGRESS REPORT
    // ════════════════════════════════════════════════════════
    async function submitProgressReport(e) {
        e.preventDefault();

        const btn = document.getElementById('submitProgressBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...'; }

        try {
            const { data: { user } } = await getCurrentUser();
           if (!user) { showMsg('Not authenticated', 'error'); return; }

            const { data: profile } = await supabaseClient
              .from('profiles')
               .select('role')
               .eq('id', user.id)
                  .maybeSingle();

if (!profile || profile.role !== 'student') {
    showMsg('Only students can submit this.', 'error');
    return;
}
            

            const phase       = document.getElementById('selectedProgressPhase')?.value || '1';
            const update      = document.getElementById('progressUpdate')?.value.trim();
            const challenges  = document.getElementById('progressChallenges')?.value.trim();
            const percentage  = document.getElementById('progressPercentage')?.value || 0;
            const fileInput   = document.getElementById('progressFile');

            if (!update) { showMsg('Please describe your progress', 'warning'); return; }

            let fileUrl = null;
            if (fileInput?.files?.[0]) {
                showMsg('Uploading document...', 'success');
                const up = await uploadFile(fileInput.files[0], 'progress');
                if (!up.success) { showMsg('File upload failed: ' + up.error, 'error'); return; }
                fileUrl = up.fileUrl;
            }

            const { error } = await supabaseClient
                .from('project_progress_reports')
                .insert({
                    student_id:            user.id,
                    phase_number:          parseInt(phase),
                    progress_update:       update,
                    challenges,
                    completion_percentage: parseInt(percentage),
                    file_url:              fileUrl,
                    submitted_at:          new Date().toISOString()
                });

            if (error) throw error;

            showMsg(`Progress report for Phase ${phase} submitted!`, 'success');
            document.getElementById('progressForm')?.reset();
            document.getElementById('progressValue').textContent = '0%';
            clearFileLabel('progressUpload');

        } catch (err) {
            showMsg('Error: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Submit Progress Report'; }
        }
    }

    // ════════════════════════════════════════════════════════
    // 4. FINAL SUBMISSION
    // ════════════════════════════════════════════════════════
    async function submitFinalProject(e) {
        e.preventDefault();

        const btn = document.getElementById('submitFinalBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...'; }

        try {
            const { data: { user } } = await getCurrentUser();
if (!user) { showMsg('Not authenticated', 'error'); return; }

const { data: profile } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

if (!profile || profile.role !== 'student') {
    showMsg('Only students can submit this.', 'error');
    return;
}
            

            const projectTitle  = document.getElementById('finalProject')?.value;
            const report        = document.getElementById('finalReport')?.value.trim();
            const codeFile      = document.getElementById('codeFile');
            const presentFile   = document.getElementById('presentationFile');

            if (!projectTitle) { showMsg('Please select a project', 'warning'); return; }
            if (!report)       { showMsg('Please write your final report', 'warning'); return; }

            let codeUrl         = null;
            let presentationUrl = null;

            if (codeFile?.files?.[0]) {
                showMsg('Uploading source code...', 'success');
                const up = await uploadFile(codeFile.files[0], 'final/code');
                if (up.success) codeUrl = up.fileUrl;
            }

            if (presentFile?.files?.[0]) {
                showMsg('Uploading presentation...', 'success');
                const up = await uploadFile(presentFile.files[0], 'final/presentation');
                if (up.success) presentationUrl = up.fileUrl;
            }

            const { error } = await supabaseClient
                .from('project_final_submissions')
                .upsert({
                    student_id:       user.id,
                    project_title:    projectTitle,
                    final_report:     report,
                    code_url:         codeUrl,
                    presentation_url: presentationUrl,
                    status:           'submitted',
                    submitted_at:     new Date().toISOString()
                }, { onConflict: 'student_id' });

            if (error) throw error;

            showMsg('Final project submitted! Well done! 🎉', 'success');
            document.getElementById('finalForm')?.reset();

        } catch (err) {
            showMsg('Error: ' + err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-flag-checkered"></i> Submit Final Project'; }
        }
    }

    // ════════════════════════════════════════════════════════
    // 5. LOAD MY PROJECTS (for "My Projects" tab)
    // ════════════════════════════════════════════════════════
    async function loadMyProjects() {
        const list = document.querySelector('#myprojectsContent .project-list');
        if (!list) return;

        list.innerHTML = `<div style="text-align:center;padding:40px;color:#9ca3af;">
            <i class="fas fa-spinner fa-spin" style="font-size:28px;display:block;margin-bottom:12px;"></i>
            Loading your projects...
        </div>`;

        try {
            const { data: { user } } = await getCurrentUser();
            if (!user) return;

            const { data: proposals, error } = await supabaseClient
                .from('project_proposals')
                .select('*, project_phases(*)')
                .eq('student_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!proposals || proposals.length === 0) {
                list.innerHTML = `<div style="text-align:center;padding:60px;color:#9ca3af;">
                    <i class="fas fa-folder-open" style="font-size:48px;display:block;margin-bottom:16px;opacity:0.3;"></i>
                    <h3>No projects yet</h3>
                    <p>Submit a proposal to get started!</p>
                </div>`;
                return;
            }

            list.innerHTML = proposals.map(p => {
                const phases    = p.project_phases || [];
                const submitted = phases.filter(ph => ph.status === 'submitted').length;

                const statusMap = {
                    pending:  { cls: 'draft',     label: 'Under Review' },
                    approved: { cls: 'submitted',  label: 'Approved' },
                    rejected: { cls: 'urgent-card',label: 'Needs Revision' }
                };
                const s = statusMap[p.status] || statusMap.pending;

                const phaseBadges = [1, 2, 3].map(n => {
                    const ph = phases.find(x => x.phase_number === n);
                    if (!ph) return `<div class="mini-phase-badge mini-pending"><i class="fas fa-lock"></i> Phase ${n} — Pending</div>`;
                    if (ph.status === 'submitted') return `<div class="mini-phase-badge mini-done"><i class="fas fa-check-circle"></i> Phase ${n} — Submitted</div>`;
                    return `<div class="mini-phase-badge mini-current"><i class="fas fa-spinner fa-spin"></i> Phase ${n} — In Progress</div>`;
                }).join('');

                const date = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

                return `
                <div class="project-item">
                    <div class="project-header">
                        <h4>${escHtml(p.title)}</h4>
                        <span class="project-status ${s.cls}">${s.label}</span>
                    </div>
                    <div class="project-details">
                        <p>${escHtml(p.description?.substring(0, 120) || '')}${p.description?.length > 120 ? '…' : ''}</p>
                        <div class="project-phases-mini">${phaseBadges}</div>
                        <div class="project-meta">
                            <span><i class="fas fa-calendar"></i> Submitted: ${date}</span>
                            <span><i class="fas fa-tasks"></i> Phases done: ${submitted}/3</span>
                        </div>
                    </div>
                    <div class="project-actions">
                        <button class="project-action-btn" onclick="switchToPhases()">
                            <i class="fas fa-layer-group"></i> View Phases
                        </button>
                        ${p.file_url ? `<a class="project-action-btn" href="${p.file_url}" target="_blank">
                            <i class="fas fa-download"></i> Download Proposal
                        </a>` : ''}
                    </div>
                </div>`;
            }).join('');

        } catch (err) {
            list.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;">
                Error loading projects: ${err.message}
            </div>`;
        }
    }

    // ── UI helper: update phase tracker ──────────────────────
    function updatePhaseTracker(phaseNum) {
        const current = document.getElementById('trackerPhase' + phaseNum);
        if (current) {
            current.className = 'phase-step completed';
            current.querySelector('.phase-circle').innerHTML = '<i class="fas fa-check"></i>';
            current.querySelector('.phase-status-badge').textContent = 'Submitted';
        }
        if (phaseNum < 3) {
            const next = document.getElementById('trackerPhase' + (phaseNum + 1));
            if (next) {
                next.className = 'phase-step phase-active';
                next.querySelector('.phase-status-badge').textContent = 'In Progress';
            }
        }
    }
  // ── UI helper: clear file upload label ───────────────────
    function clearFileLabel(areaId) {
        const area = document.getElementById(areaId);
        if (area) {
            const label = area.querySelector('.file-selected-label');
            if (label) label.remove();
        }
    }


    // ════════════════════════════════════════════════════════
    // INIT — wire up all form handlers
    // ════════════════════════════════════════════════════════
function showFileSelected(area, fileName) {
    area.style.borderColor = '#7c3aed';
    area.style.background  = '#f5f3ff';

    const icon = area.querySelector('i.fas');
    const ps   = area.querySelectorAll('p');
    if (icon) icon.style.display = 'none';
    ps.forEach(p => p.style.display = 'none');

    let label = area.querySelector('.file-selected-label');
    if (!label) {
        label = document.createElement('div');
        label.className = 'file-selected-label';
        label.style.cssText = `
            display:flex;flex-direction:column;
            align-items:center;justify-content:center;gap:8px;padding:10px;
        `;
        area.appendChild(label);
    }
    label.innerHTML = `
        <i class="fas fa-check-circle" style="font-size:36px;color:#7c3aed;display:block;"></i>
        <div style="font-size:14px;font-weight:700;color:#7c3aed;">File Selected</div>
        <div style="font-size:13px;color:#6b7280;max-width:300px;
                    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${escHtml(fileName)}
        </div>
        <div style="font-size:11px;color:#9ca3af;">Click to change file</div>
    `;
}
function init() {
    // Proposal form
    document.getElementById('proposalForm')
        ?.addEventListener('submit', submitProposal);

    // Progress form
    document.getElementById('progressForm')
        ?.addEventListener('submit', submitProgressReport);

    // Final form
    document.getElementById('finalForm')
        ?.addEventListener('submit', submitFinalProject);

    // Phase buttons
    window.submitPhase = submitPhase;

    // Load My Projects when that tab is clicked
    document.querySelector('[data-project="myprojects"]')
        ?.addEventListener('click', loadMyProjects);

    // ── wire file inputs DIRECTLY ─────────────────────────
    function wireUpload(area, input) {
        if (!area || !input) return;

        area.onclick = null;
        area.removeAttribute('onclick');

        let isOpen = false;
        area.addEventListener('click', (e) => {
            if (e.target === input) return;
            e.preventDefault();
            e.stopPropagation();
            if (isOpen) return;
            isOpen = true;
            input.click();
            setTimeout(() => { isOpen = false; }, 2000);
        });

        input.addEventListener('change', () => {
            if (input.files[0]) showFileSelected(area, input.files[0].name);
        });
    }

    // Named upload areas
    const fileMap = {
        'proposalUpload':     'proposalFile',
        'progressUpload':     'progressFile',
        'codeUpload':         'codeFile',
        'presentationUpload': 'presentationFile'
    };

    Object.entries(fileMap).forEach(([areaId, inputId]) => {
        const area  = document.getElementById(areaId);
        const input = document.getElementById(inputId);
        wireUpload(area, input);
    });

    // Phase upload areas
    [1, 2, 3].forEach(n => {
        const input = document.getElementById('phase' + n + 'File');
        if (!input) return;
        const area  = input.closest('.file-upload');
        wireUpload(area, input);
    });

    console.log('✅ projects.js loaded and connected to Supabase');
}
// Auto-init when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

return { loadMyProjects, submitPhase };

})();