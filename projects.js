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

        const ext           = file.name.split('.').pop();
        const safeName      = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName      = `${user.id}/${folder}/${Date.now()}_${safeName}`;;

        const { data, error } = await supabaseClient.storage
            .from('project-files')
            .upload(fileName, file, { upsert: true });

        if (error) return { success: false, error: error.message };

        const { data: urlData } = supabaseClient.storage
            .from('project-files')
            .getPublicUrl(fileName);

        return { success: true, fileUrl: urlData.publicUrl, path: fileName, originalName: file.name };
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
           let fileUrl      = null;
let fileOrigName = null;
if (fileInput?.files?.[0]) {
    showMsg('Uploading proposal document...', 'success');
    const up = await uploadFile(fileInput.files[0], 'proposals');
    if (!up.success) { showMsg('File upload failed: ' + up.error, 'error'); return; }
    fileUrl      = up.fileUrl;
    fileOrigName = up.originalName;
}

// Save to Supabase
const { error } = await supabaseClient
    .from('project_proposals')
    .insert({
        student_id:     user.id,
        title,
        description,
        objectives,
        timeline_weeks: parseInt(timeline) || null,
        file_url:       fileUrl,
        file_name:      fileOrigName,
        status:         'pending'
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
            let fileUrl      = null;
let fileOrigName = null;
if (fileInput?.files?.[0]) {
    showMsg('Uploading file...', 'success');
    const up = await uploadFile(fileInput.files[0], 'phase' + phaseNum);
    if (!up.success) { showMsg('File upload failed: ' + up.error, 'error'); return; }
    fileUrl      = up.fileUrl;
    fileOrigName = up.originalName;
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
 // Check if a record already exists for this student + phase
const { data: existingPhase } = await supabaseClient
    .from('project_phases')
    .select('id')
    .eq('student_id', user.id)
    .eq('phase_number', phaseNum)
    .maybeSingle();

let phaseError;

if (existingPhase) {
    // UPDATE existing record
    const { error } = await supabaseClient
        .from('project_phases')
        .update({
            proposal_id:  proposal?.id || null,
            plan,
            work_description: work,
            challenges,
            next_steps:   nextSteps,
            results,
            activities:   JSON.stringify(activities),
            completion_percentage: parseInt(percentage),
            file_url:     fileUrl || existingPhase.file_url,
            file_name:    fileOrigName || existingPhase.file_name,
            status:       'submitted',
            submitted_at: new Date().toISOString()
        })
        .eq('student_id', user.id)
        .eq('phase_number', phaseNum);
    phaseError = error;
} else {
    // INSERT new record
    const { error } = await supabaseClient
        .from('project_phases')
        .insert({
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
            file_name:    fileOrigName,
            status:       'submitted',
            submitted_at: new Date().toISOString()
        });
    phaseError = error;
}

const error = phaseError;
            if (error) throw error;

            // Update tracker UI
            updatePhaseTracker(phaseNum);

            showMsg(`Phase ${phaseNum} submitted! Admin will review your work.`, 'success');
// Refresh the progress tracker
      if (typeof ProjectsAPI !== 'undefined' && ProjectsAPI.loadProjectProgress) {
    ProjectsAPI.loadProjectProgress();
      } else {
    loadProjectProgress();
}

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

          let fileUrl      = null;
let fileOrigName = null;
if (fileInput?.files?.[0]) {
    showMsg('Uploading document...', 'success');
    const up = await uploadFile(fileInput.files[0], 'progress');
    if (!up.success) { showMsg('File upload failed: ' + up.error, 'error'); return; }
    fileUrl      = up.fileUrl;
    fileOrigName = up.originalName;
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
        file_name:             fileOrigName,
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
            

            const projectTitle  = document.getElementById('finalProject')?.value.trim();
            const report        = document.getElementById('finalReport')?.value.trim();
            const codeFile      = document.getElementById('codeFile');
            const presentFile   = document.getElementById('presentationFile');

            if (!projectTitle) { showMsg('Please select a project', 'warning'); return; }
            if (!report)       { showMsg('Please write your final report', 'warning'); return; }

           let codeUrl              = null;
let presentationUrl      = null;
let codeFileName         = null;
let presentationFileName = null;

if (codeFile?.files?.[0]) {
    showMsg('Uploading source code...', 'success');
    const up = await uploadFile(codeFile.files[0], 'final/code');
    if (up.success) { codeUrl = up.fileUrl; codeFileName = up.originalName; }
}

if (presentFile?.files?.[0]) {
    showMsg('Uploading presentation...', 'success');
    const up = await uploadFile(presentFile.files[0], 'final/presentation');
    if (up.success) { presentationUrl = up.fileUrl; presentationFileName = up.originalName; }
}

           // Check if student already has a final submission
const { data: existing } = await supabaseClient
    .from('project_final_submissions')
    .select('id')
    .eq('student_id', user.id)
    .maybeSingle();

let error;

if (existing) {
    // UPDATE existing record
 const { error: updateError } = await supabaseClient
        .from('project_final_submissions')
        .update({
            project_title:          projectTitle,
            final_report:           report,
            code_url:               codeUrl,
            presentation_url:       presentationUrl,
            file_url:               codeUrl || presentationUrl,
            code_file_name:         codeFileName,
            presentation_file_name: presentationFileName,
            status:                 'submitted',
            submitted_at:           new Date().toISOString()
        })
        .eq('student_id', user.id);
    error = updateError;
} else {
    // INSERT new record
 const { error: insertError } = await supabaseClient
        .from('project_final_submissions')
        .insert({
            student_id:             user.id,
            project_title:          projectTitle,
            final_report:           report,
            code_url:               codeUrl,
            presentation_url:       presentationUrl,
            file_url:               codeUrl || presentationUrl,
            code_file_name:         codeFileName,
            presentation_file_name: presentationFileName,
            status:                 'submitted',
            submitted_at:           new Date().toISOString()
        });
    error = insertError;
}

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
async function loadProjectProgress() {
    const container = document.getElementById('projectProgressTracker');
    if (!container) return;

    try {
        const { data: { user } } = await getCurrentUser();
        if (!user) return;

        const [proposalRes, phasesRes, finalRes, progressRes] = await Promise.all([
            supabaseClient
                .from('project_proposals')
                .select('id, status')
                .eq('student_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            supabaseClient
                .from('project_phases')
                .select('phase_number, status, completion_percentage')
                .eq('student_id', user.id),
            supabaseClient
                .from('project_final_submissions')
                .select('id, status')
                .eq('student_id', user.id)
                .maybeSingle(),
            supabaseClient
                .from('project_progress_reports')
                .select('phase_number, submitted_at')
                .eq('student_id', user.id)
        ]);

        const proposal  = proposalRes.data;
        const phases    = phasesRes.data  || [];
        const finalSub  = finalRes.data;
        const progressReports = progressRes.data || [];

        // ── Phase submission records ──
        const phase1Record = phases.find(p => p.phase_number === 1);
        const phase2Record = phases.find(p => p.phase_number === 2);
        const phase3Record = phases.find(p => p.phase_number === 3);

        const phase1Done = phase1Record?.status === 'submitted';
        const phase2Done = phase2Record?.status === 'submitted';
        const phase3Done = phase3Record?.status === 'submitted';

        const phase1Pct = phase1Done ? 100 : (phase1Record?.completion_percentage || 0);
        const phase2Pct = phase2Done ? 100 : (phase2Record?.completion_percentage || 0);
        const phase3Pct = phase3Done ? 100 : (phase3Record?.completion_percentage || 0);

        // ── Progress report records ──
        const progress1Done = progressReports.some(r => r.phase_number === 1);
        const progress2Done = progressReports.some(r => r.phase_number === 2);
        const progress3Done = progressReports.some(r => r.phase_number === 3);

        // ── Other flags ──
        const proposalDone = proposal?.status === 'approved' || proposal?.status === 'pending';
        const finalDone    = !!finalSub;

        // ── Total: 10+10+10+10+15+15+15+15 = 100% ──
        const totalPct = Math.round(
            (proposalDone   ? 10 : 0) +
            (phase1Pct / 100 * 10)    +
            (phase2Pct / 100 * 10)    +
            (phase3Pct / 100 * 10)    +
            (progress1Done  ? 15 : 0) +
            (progress2Done  ? 15 : 0) +
            (progress3Done  ? 15 : 0) +
            (finalDone      ? 15 : 0)
        );

        const steps = [
            { label: 'Proposal',    weight: 10, done: proposalDone,  icon: 'fa-file-alt',       active: true,              pct: proposalDone  ? 100 : 0 },
            { label: 'Phase 1',     weight: 10, done: phase1Done,    icon: 'fa-seedling',       active: proposalDone,      pct: phase1Pct },
            { label: 'Phase 2',     weight: 10, done: phase2Done,    icon: 'fa-cog',            active: !!phase1Record,    pct: phase2Pct },
            { label: 'Phase 3',     weight: 10, done: phase3Done,    icon: 'fa-vial',           active: !!phase2Record,    pct: phase3Pct },
            { label: 'Progress 1',  weight: 15, done: progress1Done, icon: 'fa-chart-line',     active: phase1Done,        pct: progress1Done ? 100 : 0 },
            { label: 'Progress 2',  weight: 15, done: progress2Done, icon: 'fa-chart-line',     active: phase2Done,        pct: progress2Done ? 100 : 0 },
            { label: 'Progress 3',  weight: 15, done: progress3Done, icon: 'fa-chart-line',     active: phase3Done,        pct: progress3Done ? 100 : 0 },
            { label: 'Final',       weight: 15, done: finalDone,     icon: 'fa-flag-checkered', active: !!phase3Record,    pct: finalDone     ? 100 : 0 }
        ];

        const colorDone   = '#0F6E56';
        const colorActive = '#534AB7';
        const colorLocked = '#9ca3af';

        container.innerHTML = `
            <div style="background:var(--color-background-secondary);border:1.5px solid var(--color-border-tertiary);
                        border-radius:16px;padding:22px 24px;margin-bottom:24px;">

                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
                    <div style="font-weight:500;color:var(--color-text-primary);font-size:15px;">
                        <i class="fas fa-tasks" style="color:#534AB7;margin-right:8px;"></i>
                        Project overall progress
                    </div>
                    <div style="font-size:24px;font-weight:500;color:${totalPct === 100 ? colorDone : colorActive};">
                        ${totalPct}%
                    </div>
                </div>

                <div style="height:10px;background:var(--color-border-tertiary);border-radius:8px;overflow:hidden;margin-bottom:20px;">
                    <div style="height:100%;width:${totalPct}%;
                                background:linear-gradient(90deg,#534AB7,#0F6E56);
                                border-radius:8px;transition:width .6s ease;"></div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;">
                    ${steps.slice(0,4).map(s => buildStepCard(s, colorDone, colorActive, colorLocked)).join('')}
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:10px;">
                    ${steps.slice(4).map(s => buildStepCard(s, colorDone, colorActive, colorLocked)).join('')}
                </div>

                ${totalPct === 100 ? `
                <div style="margin-top:16px;padding:12px;background:#E1F5EE;border-radius:10px;
                            text-align:center;color:#085041;font-weight:500;font-size:14px;">
                    <i class="fas fa-star" style="margin-right:8px;"></i>
                    All stages complete — well done!
                </div>` : ''}
            </div>`;

    } catch (err) {
        console.error('loadProjectProgress error:', err);
    }
}

function buildStepCard(s, colorDone, colorActive, colorLocked) {
    const c        = s.done ? colorDone   : s.active ? colorActive : colorLocked;
    const bg       = s.done ? '#E1F5EE'   : s.active ? '#EEEDFE'   : 'var(--color-background-primary)';
    const border   = s.done ? '#5DCAA5'   : s.active ? '#AFA9EC'   : 'var(--color-border-tertiary)';
    const icon     = s.done ? 'fa-check-circle' : s.active ? s.icon : 'fa-lock';
    const badge    = s.done ? '✓'         : s.active ? '→' : '🔒';
    const badgeBg  = s.done ? '#9FE1CB'   : s.active ? '#CECBF6'   : 'var(--color-border-tertiary)';
    const badgeColor = s.done ? colorDone : s.active ? colorActive : colorLocked;

    return `
        <div style="background:${bg};border:1px solid ${border};border-radius:8px;
                    padding:6px 4px;text-align:center;">
            <i class="fas ${icon}" style="font-size:12px;color:${c};display:block;margin-bottom:2px;"></i>
            <div style="font-weight:600;color:var(--color-text-primary);font-size:10px;margin-bottom:1px;">${s.label}</div>
            <span style="background:${badgeBg};color:${badgeColor};padding:1px 5px;
                         border-radius:12px;font-size:8px;font-weight:600;display:inline-block;">
                ${badge}
            </span>
        </div>`;
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

 // Call on page load to show current state
loadProjectProgress();

// Re-call whenever ANY project tab is clicked (so it always stays visible)
document.querySelectorAll('.project-tab').forEach(tab => {
    tab.addEventListener('click', loadProjectProgress);
});

// Re-call whenever the Projects nav item is clicked
document.querySelector('.nav-item[data-section="projects"]')
    ?.addEventListener('click', () => {
        setTimeout(loadProjectProgress, 100);
    });
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

window.loadProjectProgress = loadProjectProgress;
return { loadMyProjects, submitPhase, loadProjectProgress };
})();