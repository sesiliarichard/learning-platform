// ============================================================
//  TEACHER SESSIONS + RECORDING — teacher-recording.js
//  Uses Jitsi Meet External API for proper session control
//  Auto-uploads recording to Cloudinary on session end
// ============================================================

// ── Cloudinary Config ────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME    = 'dpadseqjb';
const CLOUDINARY_UPLOAD_PRESET = 'asai_sessions';

// ── Jitsi Config ─────────────────────────────────────────────
const JITSI_DOMAIN = 'meet.jit.si';

// ── State ────────────────────────────────────────────────────
let jitsiApi       = null;   // Jitsi External API instance
let mediaRecorder  = null;
let recordedChunks = [];
let timerInterval  = null;
let timerSec       = 0;

let _sessionEnding = false;


// ── Load Jitsi External API script once ──────────────────────
function loadJitsiScript() {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) { resolve(); return; }
    const script = document.createElement('script');
    script.src   = `https://${JITSI_DOMAIN}/external_api.js`;
    script.onload  = resolve;
    script.onerror = () => reject(new Error('Failed to load Jitsi External API'));
    document.head.appendChild(script);
  });
}

// ── Timer ────────────────────────────────────────────────────
function startTimer() {
  timerSec = 0;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerSec++;
    const m  = String(Math.floor(timerSec / 60)).padStart(2, '0');
    const s  = String(timerSec % 60).padStart(2, '0');
    const el = document.getElementById('sessTimer');
    if (el) el.textContent = m + ':' + s;
  }, 1000);
}

// ── Start Session ────────────────────────────────────────────
async function startSession() {
  const courseName = prompt('Enter course name for this session:');
  if (!courseName) return;

  window._lastSessionName = courseName;

  // Load Jitsi External API
  try {
    await loadJitsiScript();
  } catch (err) {
    toast('Could not load Jitsi — check your connection', 'e');
    return;
  }

  const meetingId = 'asai' + Date.now();
  const roomUrl   = `https://${JITSI_DOMAIN}/${meetingId}`;

  // Build the session UI (container div for Jitsi to mount into)
  document.getElementById('activeSessionArea').innerHTML = `
    <div class="live-card">
      <div style="display:flex;align-items:center;justify-content:space-between;
                  flex-wrap:wrap;gap:10px;margin-bottom:14px;">
        <div>
          <div class="live-badge">● LIVE</div>
          <h3 style="margin:4px 0 2px;font-family:'Syne',sans-serif;">${courseName}</h3>
          <p style="font-size:12px;color:var(--mut);margin:0;">
            <i class="fas fa-clock"></i>
            <span id="sessTimer">00:00</span>
            &nbsp;&nbsp;
            <span id="recIndicator" style="color:var(--mut);font-size:11px;">
              ● Starting recording…
            </span>
          </p>
        </div>
        <button class="cb end" onclick="endTeacherSession()">
          <i class="fas fa-phone-slash"></i> End Session
        </button>
      </div>

      <div style="background:var(--bg2);border:1.5px solid var(--bdr);
                  border-radius:10px;padding:12px 16px;margin-bottom:14px;">
        <p style="font-size:11px;font-weight:700;color:var(--mut);
                  text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">
          Share with students
        </p>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <code style="flex:1;font-size:11px;color:var(--acc);word-break:break-all;">
            ${roomUrl}
          </code>
          <button class="bxs"
                  onclick="navigator.clipboard?.writeText('${roomUrl}')
                    .then(()=>toast('URL copied!'))">
            <i class="fas fa-copy"></i> Copy
          </button>
        </div>
      </div>

      <!-- Jitsi mounts here -->
      <div id="jitsiContainer"
           style="width:100%;height:480px;border-radius:12px;overflow:hidden;
                  background:#000;">
      </div>
    </div>`;

  // ── Mount Jitsi via External API ──────────────────────────
  const container = document.getElementById('jitsiContainer');

  jitsiApi = new JitsiMeetExternalAPI(JITSI_DOMAIN, {
    roomName:    meetingId,
    parentNode:  container,
    width:       '100%',
    height:      480,
    userInfo:    { displayName: 'Instructor' },

    configOverwrite: {
      prejoinPageEnabled:           false,
      startWithAudioMuted:          false,
      startWithVideoMuted:          false,
      disableDeepLinking:           true,
      enableClosePage:              false,
      disableSpeakerStatsCollector: true,
      p2p:                          { enabled: false },
      iceTransportPolicy:           'relay',
      useStunTurn:                  true,
    },

    
    interfaceConfigOverwrite: {
      SHOW_JITSI_WATERMARK:    false,
      SHOW_BRAND_WATERMARK:    false,
      TOOLBAR_BUTTONS: [
        'microphone','camera','closedcaptions','desktop',
        'fullscreen','fodeviceselection','hangup','chat',
        'raisehand','videoquality','filmstrip','tileview',
      ],
    },
  });

  // ── Start recording once Jitsi video conference is ready ──
  jitsiApi.addEventListener('videoConferenceJoined', () => {
    startTimer();
    startJitsiRecording();
  });

  // ── If teacher clicks Jitsi's own hangup button, catch it ─
 jitsiApi.addEventListener('readyToClose', () => {
    if (!_sessionEnding) endTeacherSession();
  });
}

// ── Start Recording via getUserMedia (camera + mic) ──────────

//
async function startJitsiRecording() {
  const indicator = document.getElementById('recIndicator');

  try {
    // Grab teacher's camera + mic
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: true,
    });

    recordedChunks = [];

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';

    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.start(1000); // collect data every 1 second

    if (indicator) {
      indicator.style.color = '#ef4444';
      indicator.style.fontWeight = '700';
      indicator.textContent = '⬤ REC';
    }

    toast('Recording started ●');

  } catch (err) {
    console.warn('Recording not available:', err.message);
    if (indicator) {
      indicator.style.color = 'var(--mut)';
      indicator.textContent = 'No recording (camera/mic denied)';
    }
    toast('Session started — recording unavailable (check camera/mic permissions)', 'w');
  }
}

// ── End Session ──────────────────────────────────────────────
async function endTeacherSession() {
  if (_sessionEnding) return;   // prevent double-fire from readyToClose
  _sessionEnding = true;

  if (!confirm('End the live session for everyone?')) {
    _sessionEnding = false;
    return;
  }

  clearInterval(timerInterval);
  timerSec = 0;

  // ── 1. Stop recorder FIRST, then collect blob ─────────────
  let blob = null;

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    await new Promise(resolve => {
      mediaRecorder.onstop = resolve;
      mediaRecorder.stop();
      mediaRecorder.stream?.getTracks().forEach(t => t.stop());
    });

    if (recordedChunks.length > 0) {
      blob = new Blob(recordedChunks, { type: 'video/webm' });
      console.log('✅ Blob size:', blob.size, 'bytes');
    }
  }

  mediaRecorder  = null;
  recordedChunks = [];

  // ── 2. THEN destroy Jitsi (order matters!) ────────────────
  if (jitsiApi) {
    try { jitsiApi.dispose(); } catch (_) {}
    jitsiApi = null;
  }

  // ── 3. Load courses for save form ────────────────────────
  let courseOptions = '';
  try {
    const sb = window.supabaseClient || window.db;
    const { data: courses } = await sb
      .from('courses')
      .select('id, title')
      .order('title');
    courseOptions = (courses || [])
      .map(c => `<option value="${c.id}">${c.title}</option>`)
      .join('');
  } catch (e) {
    console.warn('Could not load courses:', e.message);
  }

  // ── 4. Route to correct post-session UI ──────────────────
  if (blob) {
    showUploadProgress(blob, courseOptions);
  } else {
    showManualUrlForm(courseOptions);
  }
}

// ── Show Upload Progress UI ───────────────────────────────────
function showUploadProgress(blob, courseOptions) {
  document.getElementById('activeSessionArea').innerHTML = `
    <div class="card" style="padding:24px;max-width:600px;">

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <div style="width:44px;height:44px;background:var(--acc);border-radius:12px;
                    display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-cloud-upload-alt" style="color:white;font-size:18px;"></i>
        </div>
        <div>
          <h3 style="margin:0;font-family:'Syne',sans-serif;">Uploading to Cloudinary…</h3>
          <p style="margin:0;font-size:12px;color:var(--mut);">
            Please wait — do not close this tab
          </p>
        </div>
      </div>

      <!-- Progress bar -->
      <div style="background:var(--bg2);border:1.5px solid var(--bdr);
                  border-radius:100px;overflow:hidden;height:12px;margin-bottom:10px;">
        <div id="uploadBar"
             style="height:100%;width:0%;background:var(--acc);
                    border-radius:100px;transition:width 0.3s ease;"></div>
      </div>
      <p id="uploadStatus" style="font-size:12px;color:var(--mut);margin:0 0 20px;">
        Preparing upload…
      </p>

      <!-- Save form (shown after upload succeeds) -->
      <div id="saveFormArea" style="display:none;">

        <div style="background:#d1fae5;border-radius:10px;padding:14px 16px;
                    margin-bottom:16px;font-size:13px;color:#065f46;">
          <strong><i class="fas fa-check-circle"></i> Uploaded successfully!</strong>
        </div>

        <div class="fg" style="margin-bottom:14px;">
          <label class="fl">Recording Title *</label>
          <input type="text" id="saveRecTitle" class="fc"
                 placeholder="e.g. Week 3 — Introduction to Neural Networks"
                 value="${window._lastSessionName || ''}"/>
        </div>

        <div class="fg" style="margin-bottom:14px;">
          <label class="fl">Course *</label>
          <select id="saveRecCourse" class="fc">
            <option value="">Choose a course…</option>
            ${courseOptions}
          </select>
        </div>

        <div class="fg" style="margin-bottom:6px;">
          <label class="fl">Cloudinary Video URL</label>
          <input type="url" id="saveRecUrl" class="fc" readonly
                 style="background:var(--bg2);color:var(--mut);cursor:default;"/>
        </div>
        <p style="font-size:11px;color:var(--grn);margin:0 0 16px;">
          <i class="fas fa-check-circle"></i> Auto-filled from upload
        </p>

        <!-- Video preview -->
        <div id="urlPreview"
             style="background:var(--bg2);border:1.5px solid var(--bdr);
                    border-radius:10px;padding:12px;margin-bottom:16px;">
          <p style="font-size:11px;font-weight:700;color:var(--mut);
                    text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">
            Preview
          </p>
          <video id="urlPreviewVideo" controls
                 style="width:100%;max-height:220px;border-radius:8px;background:#000;">
          </video>
        </div>

        <div style="display:flex;gap:10px;">
          <button id="saveRecBtn" onclick="doSaveRecording()" class="btn bp" style="flex:2;">
            <i class="fas fa-save"></i> Save Recording
          </button>
          <button onclick="skipSaveRecording()" class="btn bg" style="flex:1;">Skip</button>
        </div>
      </div>

    </div>`;

  uploadToCloudinary(blob);
}

// ── Upload Blob to Cloudinary ─────────────────────────────────
async function uploadToCloudinary(blob) {
  const bar    = document.getElementById('uploadBar');
  const status = document.getElementById('uploadStatus');

  const safeName = (window._lastSessionName || 'session').replace(/[^a-z0-9]/gi, '_');
  const fileName = safeName + '_' + Date.now() + '.webm';

  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('resource_type', 'video');
  formData.append('folder', 'asai_sessions');

  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`;

  try {
    const data = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          if (bar)    bar.style.width  = pct + '%';
          if (status) status.textContent = `Uploading… ${pct}%`;
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error('Upload failed: ' + xhr.responseText));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));

      xhr.open('POST', url);
      xhr.send(formData);
      window._uploadXhr = xhr;
    });

    // ── Upload succeeded ──────────────────────────────────
    const videoUrl = data.secure_url;

    if (bar)    bar.style.width = '100%';
    if (status) {
      status.style.color  = 'var(--grn)';
      status.textContent  = '✓ Upload complete!';
    }

    const urlInput = document.getElementById('saveRecUrl');
    if (urlInput) urlInput.value = videoUrl;

    const preview = document.getElementById('urlPreviewVideo');
    if (preview)  preview.src = videoUrl;

    const saveArea = document.getElementById('saveFormArea');
    if (saveArea)  saveArea.style.display = 'block';

    toast('Upload complete! Fill in the details and save.');

  } catch (err) {
    console.error('Cloudinary upload error:', err);

    if (bar) {
      bar.style.width      = '100%';
      bar.style.background = 'var(--red)';
    }
    if (status) {
      status.style.color = 'var(--red)';
      status.textContent = '✗ Upload failed: ' + err.message;
    }

    const saveArea = document.getElementById('saveFormArea');
    if (saveArea) {
      saveArea.innerHTML = `
        <div style="background:#fee2e2;border-radius:10px;padding:14px 16px;
                    margin-bottom:16px;font-size:13px;color:#991b1b;">
          <strong>
            <i class="fas fa-exclamation-triangle"></i> Auto-upload failed.
          </strong><br>
          Check your Cloudinary credentials in <code>teacher-recording.js</code>
          (<code>CLOUDINARY_CLOUD_NAME</code> and <code>CLOUDINARY_UPLOAD_PRESET</code>).
        </div>
        <button class="btn bp" onclick="showManualUrlForm('')">
          <i class="fas fa-keyboard"></i> Enter URL manually instead
        </button>`;
      saveArea.style.display = 'block';
    }

    toast('Upload failed — check Cloudinary config', 'e');
  }
}

// ── Manual URL fallback (no recording / upload failed) ────────
function showManualUrlForm(courseOptions) {
  document.getElementById('activeSessionArea').innerHTML = `
    <div class="card" style="padding:24px;max-width:600px;">

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
        <div style="width:44px;height:44px;background:var(--acc);border-radius:12px;
                    display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-cloud-upload-alt" style="color:white;font-size:18px;"></i>
        </div>
        <div>
          <h3 style="margin:0;font-family:'Syne',sans-serif;">Save Session Recording</h3>
          <p style="margin:0;font-size:12px;color:var(--mut);">
            No local recording — paste a Cloudinary URL below
          </p>
        </div>
      </div>

      <div style="background:#fef3c7;border-radius:10px;padding:14px 16px;
                  margin-bottom:20px;font-size:13px;color:#92400e;line-height:1.8;">
        <strong><i class="fas fa-list-ol"></i> Steps:</strong><br>
        1. Go to <a href="https://cloudinary.com" target="_blank"
                    style="color:#d97706;font-weight:700;">cloudinary.com</a>
           and sign in<br>
        2. Click <strong>Media Library → Upload</strong><br>
        3. Upload your <code>.webm</code> file<br>
        4. Click the uploaded video → copy the <strong>URL</strong><br>
        5. Paste it below and click Save
      </div>

      <div class="fg" style="margin-bottom:14px;">
        <label class="fl">Recording Title *</label>
        <input type="text" id="saveRecTitle" class="fc"
               placeholder="e.g. Week 3 — Introduction to Neural Networks"
               value="${window._lastSessionName || ''}"/>
      </div>

      <div class="fg" style="margin-bottom:14px;">
        <label class="fl">Course *</label>
        <select id="saveRecCourse" class="fc">
          <option value="">Choose a course…</option>
          ${courseOptions}
        </select>
      </div>

      <div class="fg" style="margin-bottom:6px;">
        <label class="fl">Cloudinary Video URL *</label>
        <input type="url" id="saveRecUrl" class="fc"
               placeholder="https://res.cloudinary.com/your-cloud/video/upload/…"
               oninput="previewCloudinaryUrl(this.value)"/>
      </div>
      <p style="font-size:11px;color:var(--mut);margin:0 0 14px;">
        <i class="fas fa-info-circle"></i>
        Starts with <code>https://res.cloudinary.com/</code>
      </p>

      <div id="urlPreview"
           style="display:none;background:var(--bg2);border:1.5px solid var(--bdr);
                  border-radius:10px;padding:12px;margin-bottom:16px;">
        <p style="font-size:11px;font-weight:700;color:var(--mut);
                  text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">
          Preview
        </p>
        <video id="urlPreviewVideo" controls
               style="width:100%;max-height:200px;border-radius:8px;background:#000;">
        </video>
      </div>

      <div style="display:flex;gap:10px;">
        <button id="saveRecBtn" onclick="doSaveRecording()" class="btn bp" style="flex:2;">
          <i class="fas fa-save"></i> Save Recording
        </button>
        <button onclick="skipSaveRecording()" class="btn bg" style="flex:1;">Skip</button>
      </div>
    </div>`;
}

// ── Live URL Preview (manual entry only) ─────────────────────
function previewCloudinaryUrl(url) {
  const preview = document.getElementById('urlPreview');
  const video   = document.getElementById('urlPreviewVideo');
  if (!preview || !video) return;
  if (url.startsWith('https://') && url.includes('cloudinary')) {
    video.src            = url;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
}

// ── Save Recording to Supabase ────────────────────────────────
async function doSaveRecording() {
  const title    = document.getElementById('saveRecTitle')?.value.trim();
  const courseId = document.getElementById('saveRecCourse')?.value;
  const videoUrl = document.getElementById('saveRecUrl')?.value.trim();

  if (!title)    { toast('Please enter a recording title', 'w'); return; }
  if (!courseId) { toast('Please select a course', 'w'); return; }
  if (!videoUrl) { toast('Please paste the Cloudinary URL', 'w'); return; }
  if (!videoUrl.startsWith('https://')) {
    toast('URL must start with https://', 'w'); return;
  }

  const btn = document.getElementById('saveRecBtn');
  btn.disabled    = true;
  btn.innerHTML   = '<i class="fas fa-spinner fa-spin"></i> Saving…';

  try {

const sb = window.supabaseClient || window.db;
    const { data: { user }, error: authErr } = await sb.auth.getUser();

    if (!user || authErr) {
      toast('Session expired — please refresh and log in again', 'e');
      btn.disabled  = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Save Recording';
      return;
    }

    const { error } = await sb.from('session_recordings').insert({
      teacher_id:     user.id,
      course_id:      courseId,
      title:          title,
      video_url:      videoUrl,
      cloudinary_url: videoUrl,
      published:      false,
    });

    if (error) throw error;

    document.getElementById('activeSessionArea').innerHTML = `
      <div style="text-align:center;padding:50px 24px;">
        <div style="width:72px;height:72px;background:#d1fae5;border-radius:50%;
                    display:flex;align-items:center;justify-content:center;
                    margin:0 auto 16px;">
          <i class="fas fa-check" style="color:#10b981;font-size:30px;"></i>
        </div>
        <h3 style="font-family:'Syne',sans-serif;color:var(--txt);margin-bottom:8px;">
          Recording Saved!
        </h3>
        <p style="font-size:13px;color:var(--mut);max-width:360px;
                  margin:0 auto 20px;">
          Submitted to admin for review. Once approved, students can watch it.
        </p>
        <div style="background:var(--bg2);border:1.5px solid var(--bdr);
                    border-radius:10px;padding:14px;max-width:400px;
                    margin:0 auto 20px;text-align:left;font-size:13px;">
          <div style="margin-bottom:8px;">
            <span style="color:var(--mut);">Title:</span>
            <strong style="color:var(--txt);margin-left:8px;">${title}</strong>
          </div>
          <div style="margin-bottom:8px;">
            <span style="color:var(--mut);">Status:</span>
            <span style="margin-left:8px;background:#fef3c7;color:#92400e;
                         padding:2px 10px;border-radius:20px;
                         font-size:11px;font-weight:700;">
              ⏳ Pending admin approval
            </span>
          </div>
          <div>
            <span style="color:var(--mut);">URL:</span>
            <a href="${videoUrl}" target="_blank"
               style="color:var(--acc);font-size:11px;
                      word-break:break-all;margin-left:8px;">
              ${videoUrl.substring(0, 60)}…
            </a>
          </div>
        </div>
        <button class="btn bp" onclick="loadSavedRecordings()">
          <i class="fas fa-film"></i> View My Recordings
        </button>
      </div>`;

    toast('Recording saved! Admin will publish it to students.');

  } catch (err) {
    console.error('Save recording error:', err);
    toast('Failed to save: ' + err.message, 'e');
    btn.disabled  = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Save Recording';
  }
}

// ── Skip Saving ───────────────────────────────────────────────
function skipSaveRecording() {
  document.getElementById('activeSessionArea').innerHTML = `
    <div class="empty">
      <i class="fas fa-broadcast-tower"></i>
      <p>Session ended. Click "Start Now" to begin a new one.</p>
    </div>`;
  toast('Session ended');
}

// ── Load Saved Recordings from Supabase ───────────────────────
async function loadSavedRecordings() {
  const el = document.getElementById('recList');
  if (!el) return;

  el.innerHTML = `
    <div class="empty">
      <i class="fas fa-spinner fa-spin"></i>
      <p>Loading recordings…</p>
    </div>`;

  try {
    const { data: { user } } = await db.auth.getUser();

    const { data: recs, error } = await db
      .from('session_recordings')
      .select('id, title, video_url, cloudinary_url, created_at, published, courses(title)')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!recs || recs.length === 0) {
      el.innerHTML = `
        <div class="empty">
          <i class="fas fa-film"></i>
          <p>No recordings saved yet.</p>
        </div>`;
      return;
    }

    const badge = document.getElementById('recBadge');
    if (badge) {
      badge.textContent   = recs.length;
      badge.style.display = 'inline-block';
    }

    el.innerHTML = '';

    recs.forEach(rec => {
      const videoSrc    = rec.cloudinary_url || rec.video_url;
      const downloadUrl = videoSrc
        ? videoSrc.replace('/upload/', '/upload/fl_attachment/')
        : null;
      const date = new Date(rec.created_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });

      const card = document.createElement('div');
      card.className  = 'rec-c';
      card.style.cssText = `
        background:var(--bg2);border:1.5px solid var(--bdr);
        border-radius:var(--r);padding:16px 20px;margin-bottom:12px;
        display:flex;align-items:center;gap:16px;flex-wrap:wrap;`;

      card.innerHTML = `
        <div style="width:48px;height:48px;background:var(--acc);border-radius:12px;
                    display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i class="fas fa-film" style="color:white;font-size:20px;"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;color:var(--txt);font-size:14px;margin-bottom:4px;">
            ${rec.title}
          </div>
          <div style="font-size:12px;color:var(--mut);display:flex;gap:12px;flex-wrap:wrap;">
            <span><i class="fas fa-book"></i> ${rec.courses?.title || 'Unknown course'}</span>
            <span><i class="fas fa-calendar"></i> ${date}</span>
            <span style="color:${rec.published ? 'var(--grn)' : 'var(--amb)'};">
              <i class="fas fa-circle" style="font-size:8px;"></i>
              ${rec.published ? 'Published to students' : 'Pending admin approval'}
            </span>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          ${videoSrc ? `
            <a href="${videoSrc}" target="_blank" rel="noopener"
               class="btn bg" style="padding:7px 14px;font-size:12px;text-decoration:none;">
              <i class="fas fa-play"></i> Preview
            </a>` : ''}
          ${downloadUrl ? `
            <a href="${downloadUrl}" download
               class="btn bg" style="padding:7px 14px;font-size:12px;text-decoration:none;">
              <i class="fas fa-download"></i> Download
            </a>` : ''}
          <button onclick="deleteSavedRecording('${rec.id}')"
                  class="btn bg d" style="padding:7px 12px;font-size:12px;">
            <i class="fas fa-trash"></i>
          </button>
        </div>`;

      el.appendChild(card);
    });

  } catch (err) {
    el.innerHTML = `
      <div class="empty">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Error: ${err.message}</p>
      </div>`;
  }
}

// ── Delete Saved Recording ────────────────────────────────────
async function deleteSavedRecording(id) {
  if (!confirm('Delete this recording?')) return;
  const sb = window.supabaseClient || window.db;
  const { error } = await sb.from('session_recordings').delete().eq('id', id);
  if (error) { toast('Error: ' + error.message, 'e'); return; }
  toast('Recording deleted');
  loadSavedRecordings();
}

// ── Download All ──────────────────────────────────────────────
function downloadAllRecs() {
  toast('Please use the Download button on each recording', 'w');
}

console.log('✅ teacher-recording.js loaded (Jitsi External API)');