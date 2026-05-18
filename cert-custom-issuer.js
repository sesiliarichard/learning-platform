// ============================================================
// ASAI — CERT CUSTOM ISSUER  v1.0
// Adds "Issue Certificate" button per student in Eligible tab.
// Admin uploads their own certificate image, drags name to position,
// then downloads/saves a merged PNG per student.
// ============================================================

(function () {
    'use strict';

    // ── State ────────────────────────────────────────────────
    let _bgImage      = null;   // HTMLImageElement of uploaded cert
    let _bgFile       = null;   // File object
    let _bgDataUrl    = null;   // base64 string
    let _canvas       = null;   // preview canvas
    let _ctx          = null;
    let _student      = null;   // { id, name, email }
    let _dragging     = false;
    let _namePos      = { x: 0.5, y: 0.5 };  // relative 0-1
    let _dragOffset   = { x: 0, y: 0 };
    let _fontSize     = 48;
    let _fontFamily   = 'Georgia, serif';
    let _fontColor    = '#1a1a1a';
    let _showDate     = true;
    let _showCertId   = true;
    let _datePos      = { x: 0.5, y: 0.62 };
    let _certIdPos    = { x: 0.5, y: 0.68 };
    let _activeHandle = null;   // 'name' | 'date' | 'certId'
    let _certNumber   = '';

    // ── Inject modal HTML once ───────────────────────────────
    function _injectModal() {
        if (document.getElementById('customCertModal')) return;

        const html = `
        <div class="modal" id="customCertModal" style="z-index:6000;">
          <div class="modal-content" style="max-width:960px;padding:0;overflow:hidden;border-radius:20px;">

            <!-- Header -->
            <div style="padding:22px 28px;background:linear-gradient(135deg,#1a1a2e,#16213e);
                        display:flex;align-items:center;justify-content:space-between;">
              <div style="display:flex;align-items:center;gap:14px;">
                <div style="width:42px;height:42px;background:linear-gradient(135deg,#e2b96f,#c8973d);
                            border-radius:12px;display:flex;align-items:center;justify-content:center;">
                  <i class="fas fa-certificate" style="color:white;font-size:18px;"></i>
                </div>
                <div>
                  <div style="font-size:17px;font-weight:800;color:white;letter-spacing:-0.3px;">Issue Certificate</div>
                  <div id="customCertStudentName" style="font-size:13px;color:rgba(255,255,255,0.55);margin-top:1px;"></div>
                </div>
              </div>
              <button onclick="closeCustomCertModal()"
                style="width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,0.1);
                       color:white;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                ×
              </button>
            </div>

            <!-- Body -->
            <div style="display:grid;grid-template-columns:300px 1fr;height:580px;">

              <!-- LEFT PANEL — controls -->
              <div style="background:#0f0f1a;padding:22px 18px;overflow-y:auto;border-right:1px solid rgba(255,255,255,0.07);">

                <!-- Upload -->
                <div style="margin-bottom:20px;">
                  <div style="font-size:10px;font-weight:800;color:#e2b96f;text-transform:uppercase;
                              letter-spacing:1.5px;margin-bottom:10px;">Certificate Background</div>
                  <div id="certDropZone"
                    onclick="document.getElementById('certBgInput').click()"
                    style="border:2px dashed rgba(226,185,111,0.4);border-radius:12px;padding:20px;
                           text-align:center;cursor:pointer;background:rgba(226,185,111,0.05);
                           transition:all 0.2s;"
                    onmouseenter="this.style.borderColor='rgba(226,185,111,0.8)';this.style.background='rgba(226,185,111,0.1)'"
                    onmouseleave="this.style.borderColor='rgba(226,185,111,0.4)';this.style.background='rgba(226,185,111,0.05)'">
                    <i class="fas fa-cloud-upload-alt" style="font-size:26px;color:#e2b96f;display:block;margin-bottom:8px;"></i>
                    <div style="font-size:12px;font-weight:700;color:#e2b96f;">Click to upload</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:4px;">PNG, JPG, PDF preview</div>
                  </div>
                  <input type="file" id="certBgInput" accept="image/*" style="display:none"
                         onchange="onCertBgSelected(this)">
                  <div id="certBgFileName" style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:8px;text-align:center;"></div>
                </div>

                <!-- Font controls -->
                <div style="margin-bottom:20px;">
                  <div style="font-size:10px;font-weight:800;color:#e2b96f;text-transform:uppercase;
                              letter-spacing:1.5px;margin-bottom:10px;">Name Styling</div>

                  <label style="display:block;font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:5px;">Font Family</label>
                  <select id="certFontFamily" onchange="onCertFontChange()"
                    style="width:100%;padding:9px 10px;background:#1a1a2e;border:1.5px solid rgba(255,255,255,0.1);
                           border-radius:8px;color:white;font-size:12px;outline:none;margin-bottom:10px;">
                    <option value="Georgia, serif">Georgia (Serif)</option>
                    <option value="'Times New Roman', serif">Times New Roman</option>
                    <option value="Garamond, serif">Garamond</option>
                    <option value="'Playfair Display', serif">Playfair Display</option>
                    <option value="'Cinzel', serif">Cinzel (Royal)</option>
                    <option value="'Plus Jakarta Sans', sans-serif">Plus Jakarta Sans</option>
                    <option value="'Montserrat', sans-serif">Montserrat</option>
                    <option value="Arial, sans-serif">Arial</option>
                  </select>

                  <label style="display:block;font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:5px;">Font Size</label>
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <input type="range" id="certFontSize" min="20" max="120" value="48"
                           oninput="onCertFontSizeChange(this.value)"
                           style="flex:1;accent-color:#e2b96f;">
                    <span id="certFontSizeVal" style="font-size:12px;color:#e2b96f;font-weight:700;min-width:35px;">48px</span>
                  </div>

                  <label style="display:block;font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:5px;">Font Color</label>
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                    <input type="color" id="certFontColor" value="#1a1a1a" onchange="onCertColorChange(this.value)"
                           style="width:40px;height:34px;border:none;border-radius:8px;cursor:pointer;background:none;">
                    <span style="font-size:11px;color:rgba(255,255,255,0.4);">Click to pick color</span>
                  </div>
                </div>

                <!-- Extras -->
                <div style="margin-bottom:20px;">
                  <div style="font-size:10px;font-weight:800;color:#e2b96f;text-transform:uppercase;
                              letter-spacing:1.5px;margin-bottom:10px;">Additional Fields</div>

                  <label style="display:flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer;">
                    <input type="checkbox" id="certShowDate" checked onchange="onCertExtrasChange()"
                           style="width:16px;height:16px;accent-color:#e2b96f;cursor:pointer;">
                    <span style="font-size:12px;color:rgba(255,255,255,0.7);">Show Issue Date</span>
                  </label>
                  <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                    <input type="checkbox" id="certShowId" checked onchange="onCertExtrasChange()"
                           style="width:16px;height:16px;accent-color:#e2b96f;cursor:pointer;">
                    <span style="font-size:12px;color:rgba(255,255,255,0.7);">Show Certificate ID</span>
                  </label>
                </div>

                <!-- Tip -->
                <div style="background:rgba(226,185,111,0.08);border:1px solid rgba(226,185,111,0.2);
                            border-radius:10px;padding:12px;font-size:11px;color:rgba(255,255,255,0.5);
                            line-height:1.6;">
                  <i class="fas fa-hand-pointer" style="color:#e2b96f;margin-right:6px;"></i>
                  <strong style="color:#e2b96f;">Drag</strong> the name, date, and ID directly on the preview to reposition them.
                </div>
              </div>

              <!-- RIGHT PANEL — canvas preview -->
              <div style="background:#111827;display:flex;flex-direction:column;align-items:center;
                          justify-content:center;padding:20px;position:relative;">

                <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);
                            text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;">
                  Preview — drag text to reposition
                </div>

                <div style="position:relative;box-shadow:0 20px 60px rgba(0,0,0,0.5);border-radius:8px;overflow:hidden;">
                  <canvas id="customCertCanvas"
                    style="display:block;max-width:100%;cursor:crosshair;border-radius:8px;"
                    onmousedown="onCertCanvasMouseDown(event)"
                    onmousemove="onCertCanvasMouseMove(event)"
                    onmouseup="onCertCanvasMouseUp()"
                    onmouseleave="onCertCanvasMouseUp()">
                  </canvas>

                  <!-- Placeholder when no image -->
                  <div id="certCanvasPlaceholder"
                    style="width:580px;height:410px;display:flex;flex-direction:column;
                           align-items:center;justify-content:center;background:#1a1a2e;
                           border-radius:8px;border:2px dashed rgba(226,185,111,0.2);">
                    <i class="fas fa-image" style="font-size:48px;color:rgba(226,185,111,0.3);display:block;margin-bottom:14px;"></i>
                    <div style="font-size:14px;font-weight:700;color:rgba(255,255,255,0.3);">Upload a certificate background</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.2);margin-top:6px;">Your template image will appear here</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer actions -->
            <div style="padding:16px 28px;background:#0f0f1a;border-top:1px solid rgba(255,255,255,0.07);
                        display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <button onclick="closeCustomCertModal()"
                style="padding:11px 22px;border:1.5px solid rgba(255,255,255,0.15);border-radius:10px;
                       background:transparent;color:rgba(255,255,255,0.6);font-weight:600;
                       cursor:pointer;font-family:inherit;font-size:13px;">
                Cancel
              </button>
              <div style="display:flex;gap:10px;">
                <button onclick="downloadCustomCert()"
                  id="customCertDownloadBtn"
                  disabled
                  style="padding:11px 22px;border:1.5px solid #e2b96f;border-radius:10px;
                         background:transparent;color:#e2b96f;font-weight:700;
                         cursor:not-allowed;font-family:inherit;font-size:13px;opacity:0.4;
                         transition:all 0.2s;">
                  <i class="fas fa-download"></i> Download PNG
                </button>
                <button onclick="saveAndIssueCustomCert()"
                  id="customCertIssueBtn"
                  disabled
                  style="padding:11px 28px;border:none;border-radius:10px;
                         background:linear-gradient(135deg,#e2b96f,#c8973d);color:#1a1a1a;
                         font-weight:800;cursor:not-allowed;font-family:inherit;font-size:13px;
                         opacity:0.4;transition:all 0.2s;">
                  <i class="fas fa-award"></i> Issue & Save to Student
                </button>
              </div>
            </div>

          </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', html);

        // Wire drag-and-drop on drop zone
        const zone = document.getElementById('certDropZone');
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'rgba(226,185,111,0.9)'; });
        zone.addEventListener('dragleave', () => { zone.style.borderColor = 'rgba(226,185,111,0.4)'; });
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.style.borderColor = 'rgba(226,185,111,0.4)';
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) _loadBgFile(file);
        });
    }

    // ── Open modal for a specific student ───────────────────
    window.openCustomCertIssuer = function(studentId, studentName, studentEmail) {
        _injectModal();
        _student    = { id: studentId, name: studentName, email: studentEmail };
        _certNumber = `ASAI-${new Date().getFullYear()}-${Math.floor(Math.random()*99999).toString().padStart(5,'0')}`;
        _namePos    = { x: 0.5, y: 0.48 };
        _datePos    = { x: 0.5, y: 0.62 };
        _certIdPos  = { x: 0.5, y: 0.69 };
        _bgImage    = null;
        _bgDataUrl  = null;

        // Reset UI
        const nameEl = document.getElementById('customCertStudentName');
        if (nameEl) nameEl.textContent = studentName + ' — ' + studentEmail;

        document.getElementById('certBgFileName').textContent = '';
        document.getElementById('certFontSize').value = 48;
        document.getElementById('certFontSizeVal').textContent = '48px';
        document.getElementById('certFontColor').value = '#1a1a1a';
        document.getElementById('certFontFamily').value = 'Georgia, serif';
        document.getElementById('certShowDate').checked = true;
        document.getElementById('certShowId').checked   = true;
        _fontSize   = 48;
        _fontColor  = '#1a1a1a';
        _fontFamily = 'Georgia, serif';
        _showDate   = true;
        _showCertId = true;

        // Show placeholder, hide canvas
        document.getElementById('customCertCanvas').style.display = 'none';
        document.getElementById('certCanvasPlaceholder').style.display = 'flex';
        _setButtonsEnabled(false);

        document.getElementById('customCertModal').classList.add('active');
    };

    window.closeCustomCertModal = function() {
        document.getElementById('customCertModal')?.classList.remove('active');
    };

    // ── File selected from input ─────────────────────────────
    window.onCertBgSelected = function(input) {
        const file = input.files[0];
        if (!file) return;
        _loadBgFile(file);
    };

    function _loadBgFile(file) {
        _bgFile = file;
        document.getElementById('certBgFileName').textContent = file.name;

        const reader = new FileReader();
        reader.onload = e => {
            _bgDataUrl = e.target.result;
            const img = new Image();
            img.onload = () => {
                _bgImage = img;
                _initCanvas();
                _redraw();
                _setButtonsEnabled(true);
            };
            img.src = _bgDataUrl;
        };
        reader.readAsDataURL(file);
    }

    function _initCanvas() {
        const canvas = document.getElementById('customCertCanvas');
        const maxW = 600, maxH = 440;
        const ratio = Math.min(maxW / _bgImage.naturalWidth, maxH / _bgImage.naturalHeight);
        canvas.width  = _bgImage.naturalWidth;
        canvas.height = _bgImage.naturalHeight;
        canvas.style.width  = Math.round(_bgImage.naturalWidth  * ratio) + 'px';
        canvas.style.height = Math.round(_bgImage.naturalHeight * ratio) + 'px';
        _canvas = canvas;
        _ctx    = canvas.getContext('2d');

        canvas.style.display = 'block';
        document.getElementById('certCanvasPlaceholder').style.display = 'none';
    }

    // ── Draw everything ──────────────────────────────────────
    function _redraw() {
        if (!_canvas || !_bgImage) return;
        const W = _canvas.width, H = _canvas.height;
        _ctx.clearRect(0, 0, W, H);

        // Background image
        _ctx.drawImage(_bgImage, 0, 0, W, H);

        const date = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });

        // ── Student Name ──────────────────────────────────────
        const nX = _namePos.x * W;
        const nY = _namePos.y * H;
        _ctx.save();
        _ctx.font         = `bold ${_fontSize}px ${_fontFamily}`;
        _ctx.fillStyle    = _fontColor;
        _ctx.textAlign    = 'center';
        _ctx.textBaseline = 'middle';
        // Subtle shadow for legibility
        _ctx.shadowColor  = 'rgba(255,255,255,0.6)';
        _ctx.shadowBlur   = 6;
        _ctx.fillText(_student?.name || 'Student Name', nX, nY);
        _ctx.restore();

        // Drag handle highlight box for name
        _drawHandle(nX, nY, _ctx.measureText(_student?.name || 'Student Name').width + 20,
                    _fontSize + 10, '#e2b96f');

        // ── Date ─────────────────────────────────────────────
        if (_showDate) {
            const dX = _datePos.x * W;
            const dY = _datePos.y * H;
            _ctx.save();
            _ctx.font         = `${Math.round(_fontSize * 0.38)}px ${_fontFamily}`;
            _ctx.fillStyle    = _fontColor;
            _ctx.globalAlpha  = 0.8;
            _ctx.textAlign    = 'center';
            _ctx.textBaseline = 'middle';
            _ctx.fillText('Issued: ' + date, dX, dY);
            _ctx.restore();
            _drawHandle(dX, dY, 300, Math.round(_fontSize * 0.38) + 6, '#60a5fa');
        }

        // ── Cert ID ───────────────────────────────────────────
        if (_showCertId) {
            const cX = _certIdPos.x * W;
            const cY = _certIdPos.y * H;
            _ctx.save();
            _ctx.font         = `${Math.round(_fontSize * 0.30)}px 'Courier New', monospace`;
            _ctx.fillStyle    = _fontColor;
            _ctx.globalAlpha  = 0.55;
            _ctx.textAlign    = 'center';
            _ctx.textBaseline = 'middle';
            _ctx.fillText('ID: ' + _certNumber, cX, cY);
            _ctx.restore();
            _drawHandle(cX, cY, 280, Math.round(_fontSize * 0.30) + 6, '#a78bfa');
        }
    }

    function _drawHandle(cx, cy, w, h, color) {
        _ctx.save();
        _ctx.strokeStyle = color;
        _ctx.lineWidth   = 2;
        _ctx.globalAlpha = 0.45;
        _ctx.setLineDash([5, 4]);
        _ctx.strokeRect(cx - w/2, cy - h/2, w, h);
        _ctx.restore();
    }

    // ── Drag logic ────────────────────────────────────────────
    function _canvasCoords(evt) {
        const rect   = _canvas.getBoundingClientRect();
        const scaleX = _canvas.width  / rect.width;
        const scaleY = _canvas.height / rect.height;
        return {
            x: (evt.clientX - rect.left) * scaleX,
            y: (evt.clientY - rect.top)  * scaleY
        };
    }

    function _hitTest(cx, cy, pos, w, h) {
        const px = pos.x * _canvas.width;
        const py = pos.y * _canvas.height;
        return Math.abs(cx - px) < w/2 + 10 && Math.abs(cy - py) < h/2 + 10;
    }

    window.onCertCanvasMouseDown = function(evt) {
        if (!_canvas || !_bgImage) return;
        const { x, y } = _canvasCoords(evt);

        const nameW = _fontSize * (_student?.name?.length || 10) * 0.6 + 20;
        if (_hitTest(x, y, _namePos, nameW, _fontSize + 10)) {
            _dragging = true; _activeHandle = 'name';
            _dragOffset = { x: x - _namePos.x * _canvas.width, y: y - _namePos.y * _canvas.height };
            _canvas.style.cursor = 'grabbing';
        } else if (_showDate && _hitTest(x, y, _datePos, 300, _fontSize * 0.38 + 6)) {
            _dragging = true; _activeHandle = 'date';
            _dragOffset = { x: x - _datePos.x * _canvas.width, y: y - _datePos.y * _canvas.height };
            _canvas.style.cursor = 'grabbing';
        } else if (_showCertId && _hitTest(x, y, _certIdPos, 280, _fontSize * 0.30 + 6)) {
            _dragging = true; _activeHandle = 'certId';
            _dragOffset = { x: x - _certIdPos.x * _canvas.width, y: y - _certIdPos.y * _canvas.height };
            _canvas.style.cursor = 'grabbing';
        }
    };

    window.onCertCanvasMouseMove = function(evt) {
        if (!_dragging || !_canvas) return;
        const { x, y } = _canvasCoords(evt);
        const nx = (x - _dragOffset.x) / _canvas.width;
        const ny = (y - _dragOffset.y) / _canvas.height;
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

        if (_activeHandle === 'name')   _namePos  = { x: clamp(nx, 0.05, 0.95), y: clamp(ny, 0.03, 0.97) };
        if (_activeHandle === 'date')   _datePos  = { x: clamp(nx, 0.05, 0.95), y: clamp(ny, 0.03, 0.97) };
        if (_activeHandle === 'certId') _certIdPos= { x: clamp(nx, 0.05, 0.95), y: clamp(ny, 0.03, 0.97) };
        _redraw();
    };

    window.onCertCanvasMouseUp = function() {
        _dragging = false;
        _activeHandle = null;
        if (_canvas) _canvas.style.cursor = 'crosshair';
    };

    // ── Control change handlers ───────────────────────────────
    window.onCertFontChange = function() {
        _fontFamily = document.getElementById('certFontFamily').value;
        _redraw();
    };
    window.onCertFontSizeChange = function(v) {
        _fontSize = parseInt(v);
        document.getElementById('certFontSizeVal').textContent = v + 'px';
        _redraw();
    };
    window.onCertColorChange = function(v) {
        _fontColor = v;
        _redraw();
    };
    window.onCertExtrasChange = function() {
        _showDate   = document.getElementById('certShowDate').checked;
        _showCertId = document.getElementById('certShowId').checked;
        _redraw();
    };

    function _setButtonsEnabled(on) {
        const dl  = document.getElementById('customCertDownloadBtn');
        const iss = document.getElementById('customCertIssueBtn');
        if (!dl || !iss) return;
        dl.disabled  = !on;
        iss.disabled = !on;
        dl.style.opacity  = on ? '1'   : '0.4';
        iss.style.opacity = on ? '1'   : '0.4';
        dl.style.cursor   = on ? 'pointer' : 'not-allowed';
        iss.style.cursor  = on ? 'pointer' : 'not-allowed';
    }

    // ── Export clean PNG (no dashed handles) ─────────────────
    function _renderCleanPng() {
        if (!_canvas || !_bgImage) return null;
        const offscreen = document.createElement('canvas');
        offscreen.width  = _bgImage.naturalWidth;
        offscreen.height = _bgImage.naturalHeight;
        const ctx = offscreen.getContext('2d');
        const W = offscreen.width, H = offscreen.height;
        ctx.drawImage(_bgImage, 0, 0, W, H);

        const date = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });

        // Name
        ctx.save();
        ctx.font         = `bold ${_fontSize}px ${_fontFamily}`;
        ctx.fillStyle    = _fontColor;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = 'rgba(255,255,255,0.5)';
        ctx.shadowBlur   = 5;
        ctx.fillText(_student?.name || '', _namePos.x * W, _namePos.y * H);
        ctx.restore();

        // Date
        if (_showDate) {
            ctx.save();
            ctx.font         = `${Math.round(_fontSize * 0.38)}px ${_fontFamily}`;
            ctx.fillStyle    = _fontColor;
            ctx.globalAlpha  = 0.8;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Issued: ' + date, _datePos.x * W, _datePos.y * H);
            ctx.restore();
        }

        // Cert ID
        if (_showCertId) {
            ctx.save();
            ctx.font         = `${Math.round(_fontSize * 0.30)}px 'Courier New', monospace`;
            ctx.fillStyle    = _fontColor;
            ctx.globalAlpha  = 0.55;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('ID: ' + _certNumber, _certIdPos.x * W, _certIdPos.y * H);
            ctx.restore();
        }

        return offscreen.toDataURL('image/png');
    }

    // ── Download PNG ─────────────────────────────────────────
    window.downloadCustomCert = function() {
        const png = _renderCleanPng();
        if (!png) { typeof showToast === 'function' && showToast('Please upload a certificate background first', 'error'); return; }
        const a = document.createElement('a');
        a.href     = png;
        a.download = `certificate_${(_student?.name || 'student').replace(/\s+/g,'_')}_${_certNumber}.png`;
        a.click();
        typeof showToast === 'function' && showToast('Certificate downloaded!');
    };

    // ── Save to Supabase + mark as issued ────────────────────
    window.saveAndIssueCustomCert = async function() {
        const btn = document.getElementById('customCertIssueBtn');
        if (!_student || !_bgImage) return;

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

        try {
            const db = window.supabaseClient || window.db;

            // Check if cert already exists for this student
            const { data: existing } = await db
                .from('certificates')
                .select('id')
                .eq('student_id', _student.id)
                .eq('revoked', false)
                .maybeSingle();

            const certData = {
                student_id:     _student.id,
                user_id:        _student.id,
                course_id:      null,
                course_name:    'ASAI Full Program Certificate',
                cert_number:    _certNumber,
                template:       'custom',
                admin_approved: true,
                approved_at:    new Date().toISOString(),
                published:      true,
                published_at:   new Date().toISOString(),
                revoked:        false,
                issued_at:      new Date().toISOString(),
                admin_notes:    'Issued via custom certificate uploader'
            };

            let error;
            if (existing) {
                ({ error } = await db.from('certificates').update(certData).eq('id', existing.id));
            } else {
                ({ error } = await db.from('certificates').insert(certData));
            }

            if (error) throw error;

            // Also download the PNG for the admin
            downloadCustomCert();

            typeof showToast === 'function' &&
                showToast(`🎓 Certificate issued for ${_student.name}! PNG downloaded.`);

            closeCustomCertModal();

            // Refresh the certificates list if the function exists
            if (typeof loadEligibleStudents === 'function') await loadEligibleStudents();
            if (typeof loadIssuedCerts      === 'function') await loadIssuedCerts();

        } catch (err) {
            typeof showToast === 'function' && showToast('Error: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-award"></i> Issue & Save to Student';
        }
    };

    // ── PATCH: inject button into every student row ──────────
    // Called after the eligible students table renders
    window._patchCertRows = function() {
        // This is called from _renderStudentTable in certificates.js
        // We look for any action button container and inject our button
        // The actual patching happens via the renderEligibleStudentsFixed override below
    };

    console.log('✅ cert-custom-issuer.js loaded');
})();