// ============================================================
// ASAI — CUSTOM CERTIFICATE TEMPLATES
// cert-template-builder.js
//
// Features:
//  - Admin creates custom templates (colors + background image)
//  - Saved permanently to Supabase (certificate_templates table)
//  - Appears in template grid alongside Classic/Modern/Elegant
//  - Used when issuing certificates
// ============================================================

(function () {
    'use strict';

    // ── DB helper ──────────────────────────────────────────────
    function db() { return window.supabaseClient || window.db; }


    // ══════════════════════════════════════════════════════════
    // 1. INJECT "Add Template" BUTTON into the template grid
    // ══════════════════════════════════════════════════════════
 function injectAddTemplateButton() {
    const grid = document.querySelector('.template-grid');
    if (!grid || grid.dataset.customInjected) return;
    grid.dataset.customInjected = '1';

    // Restore previously selected template
    const saved = localStorage.getItem('asai_selected_template');
    if (saved) {
        setTimeout(() => {
            if (saved.startsWith('custom-')) {
                const tplId = saved.replace('custom-', '');
                window.selectCustomTemplate(tplId, '');
            } else if (typeof selectTemplate === 'function') {
                selectTemplate(saved);
            }
        }, 600);
    }

        // "Add New" card
        const addCard = document.createElement('div');
        addCard.className = 'cert-template-card add-new-template-card';
        addCard.id = 'tpl-add-new';
        addCard.style.cssText = `
            cursor: pointer;
            border: 2px dashed #7c3aed;
            border-radius: 14px;
            overflow: hidden;
            transition: all 0.2s;
            position: relative;
        `;
        addCard.innerHTML = `
            <div class="template-preview" style="
                background: linear-gradient(135deg, #ede9fe, #f5f3ff);
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                height: 80px; gap: 6px;
            ">
                <i class="fas fa-plus-circle" style="font-size: 26px; color: #7c3aed;"></i>
                <span style="font-size: 11px; font-weight: 700; color: #7c3aed; letter-spacing: 0.5px;">
                    NEW TEMPLATE
                </span>
            </div>
            <div class="template-info">
                <div class="template-title">Custom</div>
                <div class="template-description">Design your own template</div>
            </div>
        `;
        addCard.addEventListener('mouseenter', () => {
            addCard.style.borderColor = '#6d28d9';
            addCard.style.transform = 'translateY(-2px)';
            addCard.style.boxShadow = '0 8px 24px rgba(124,58,237,0.2)';
        });
        addCard.addEventListener('mouseleave', () => {
            addCard.style.borderColor = '#7c3aed';
            addCard.style.transform = '';
            addCard.style.boxShadow = '';
        });
        addCard.addEventListener('click', openTemplateBuilder);
        grid.appendChild(addCard);

        // Load saved custom templates into grid
        loadCustomTemplatesIntoGrid();
    }

    // ══════════════════════════════════════════════════════════
    // 2. LOAD SAVED TEMPLATES into the grid
    // ══════════════════════════════════════════════════════════
    async function loadCustomTemplatesIntoGrid() {
        try {
            const { data: templates, error } = await db()
                .from('certificate_templates')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) throw error;

            (templates || []).forEach(tpl => addTemplateCardToGrid(tpl));
        } catch (err) {
            console.warn('[CertTemplates] Could not load custom templates:', err.message);
        }
    }

    function addTemplateCardToGrid(tpl) {
        const grid = document.querySelector('.template-grid');
        if (!grid) return;

        // Remove existing card for this template (avoid dupes on reload)
        document.getElementById(`tpl-custom-${tpl.id}`)?.remove();

        // Build preview background
        const previewBg = tpl.bg_image_url
            ? `url('${tpl.bg_image_url}') center/cover no-repeat`
            : `linear-gradient(135deg, ${tpl.bg_color || '#1e1b4b'}, ${tpl.accent_color || '#7c3aed'})`;

        const card = document.createElement('div');
        card.className = 'cert-template-card';
        card.id = `tpl-custom-${tpl.id}`;
        card.style.cssText = 'cursor:pointer;position:relative;';
        card.innerHTML = `
            <div class="template-preview" style="
                background: ${previewBg};
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                height: 80px; position: relative; overflow: hidden;
            ">
                <i class="fas fa-certificate" style="font-size: 22px; color: ${tpl.title_color || '#fff'}; opacity: 0.9;"></i>
                <span style="font-size: 10px; font-weight: 700; color: ${tpl.title_color || '#fff'}; margin-top: 4px; opacity: 0.9; letter-spacing: 0.5px;">
                    CUSTOM
                </span>
            </div>
            <div class="template-info">
                <div class="template-title" style="display:flex;align-items:center;justify-content:space-between;">
                    <span>${tpl.name}</span>
                    <div style="display:flex;gap:4px;">
                        <button onclick="event.stopPropagation();editCustomTemplate('${tpl.id}')"
                            style="background:none;border:none;cursor:pointer;color:#7c3aed;font-size:11px;padding:2px 4px;"
                            title="Edit"><i class="fas fa-edit"></i></button>
                        <button onclick="event.stopPropagation();deleteCustomTemplate('${tpl.id}','${tpl.name.replace(/'/g,"\\'")}',this)"
                            style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:11px;padding:2px 4px;"
                            title="Delete"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div class="template-description">Custom design</div>
            </div>
            <div class="template-badge" id="badge-custom-${tpl.id}" style="display:none;">
                <i class="fas fa-check"></i>
            </div>
        `;
        card.addEventListener('click', () => selectCustomTemplate(tpl.id, tpl.name));

        // Insert before the "Add New" card
        const addCard = document.getElementById('tpl-add-new');
        if (addCard) grid.insertBefore(card, addCard);
        else grid.appendChild(card);
    }

    // ══════════════════════════════════════════════════════════
    // 3. SELECT a custom template
    // ══════════════════════════════════════════════════════════
         window.selectCustomTemplate = function (tplId, tplName) {
         localStorage.setItem('asai_selected_template', `custom-${tplId}`);
         // Deselect all built-in badges
          ['classic', 'modern', 'elegant'].forEach(t => {
            const b = document.getElementById('badge-' + t);
            if (b) b.style.display = 'none';
            const c = document.getElementById('tpl-' + t);
            if (c) c.style.borderColor = '#e5e7eb';
        });
        // Deselect all custom badges
        document.querySelectorAll('[id^="badge-custom-"]').forEach(b => b.style.display = 'none');
        document.querySelectorAll('[id^="tpl-custom-"]').forEach(c => c.style.borderColor = '#e5e7eb');

        // Select this one
        const badge = document.getElementById(`badge-custom-${tplId}`);
        const card  = document.getElementById(`tpl-custom-${tplId}`);
        if (badge) badge.style.display = 'flex';
        if (card)  card.style.borderColor = '#7c3aed';

        // Store globally so cert issuing uses it
        window.selectedTemplate      = `custom-${tplId}`;
        window.selectedCustomTplId   = tplId;
        window.selectedCustomTplName = tplName;

        if (typeof showToast === 'function') showToast(`Template "${tplName}" selected`);
    };

    // ══════════════════════════════════════════════════════════
    // 4. TEMPLATE BUILDER MODAL
    // ══════════════════════════════════════════════════════════
    let _editingTplId = null;

    window.openTemplateBuilder = function (editData) {
        _editingTplId = editData?.id || null;
        document.getElementById('certTemplateBuilderModal')?.remove();

        const isEdit = !!_editingTplId;
        const d = editData || {};

        const modal = document.createElement('div');
        modal.id = 'certTemplateBuilderModal';
        modal.className = 'modal active';
        modal.style.cssText = 'z-index:6000;';

        modal.innerHTML = `
       <div class="modal-content" style="max-width:900px;padding:0;overflow:hidden;border-radius:20px;display:flex;flex-direction:column;max-height:90vh;">

            <!-- HEADER -->
            <div style="
                background: linear-gradient(135deg,#1e1b4b,#312e81);
                padding: 24px 30px;
                display: flex; align-items: center; justify-content: space-between;
            ">
                <div style="display:flex;align-items:center;gap:14px;">
                    <div style="width:44px;height:44px;background:rgba(255,255,255,0.15);border-radius:12px;
                                display:flex;align-items:center;justify-content:center;">
                        <i class="fas fa-palette" style="color:white;font-size:20px;"></i>
                    </div>
                    <div>
                        <h2 style="color:white;margin:0;font-size:18px;font-weight:800;">
                            ${isEdit ? 'Edit Template' : 'Create New Template'}
                        </h2>
                        <p style="color:rgba(255,255,255,0.6);margin:2px 0 0;font-size:13px;">
                            Design a custom certificate template
                        </p>
                    </div>
                </div>
                <button onclick="document.getElementById('certTemplateBuilderModal').remove()"
                    style="background:rgba(255,255,255,0.15);border:none;width:36px;height:36px;
                           border-radius:50%;cursor:pointer;color:white;font-size:16px;
                           display:flex;align-items:center;justify-content:center;">
                    ✕
                </button>
            </div>

            <!-- BODY: two columns -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;min-height:0;flex:1;overflow:hidden;">

                <!-- LEFT: Controls -->
                <div style="padding:28px;border-right:1px solid #f0f0f0;overflow-y:auto;max-height:480px;">

                    <!-- Template Name -->
                    <div style="margin-bottom:20px;">
                        <label style="display:block;font-weight:700;color:#374151;font-size:13px;margin-bottom:8px;">
                            <i class="fas fa-tag" style="color:#7c3aed;margin-right:6px;"></i>Template Name *
                        </label>
                        <input type="text" id="tplName" value="${d.name || ''}"
                            placeholder="e.g. Royal Blue, Sunset, Corporate..."
                            style="width:100%;padding:11px 14px;border:2px solid #e5e7eb;border-radius:10px;
                                   font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;"
                            oninput="updateCertPreview()"
                            onfocus="this.style.borderColor='#7c3aed'"
                            onblur="this.style.borderColor='#e5e7eb'">
                    </div>

                    <!-- Background Type -->
                    <div style="margin-bottom:20px;">
                        <label style="display:block;font-weight:700;color:#374151;font-size:13px;margin-bottom:10px;">
                            <i class="fas fa-image" style="color:#7c3aed;margin-right:6px;"></i>Background
                        </label>
                        <div style="display:flex;gap:8px;margin-bottom:12px;">
                            <button id="bgTypeColor" onclick="switchBgType('color')"
                                style="flex:1;padding:9px;border:2px solid #7c3aed;border-radius:9px;
                                       background:#ede9fe;color:#5b21b6;font-weight:700;font-size:13px;
                                       cursor:pointer;font-family:inherit;">
                                🎨 Color
                            </button>
                            <button id="bgTypeImage" onclick="switchBgType('image')"
                                style="flex:1;padding:9px;border:2px solid #e5e7eb;border-radius:9px;
                                       background:white;color:#6b7280;font-weight:700;font-size:13px;
                                       cursor:pointer;font-family:inherit;">
                                🖼 Image Upload
                            </button>
                        </div>

                        <!-- Color BG -->
                        <div id="bgColorPanel">
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                                <div>
                                    <label style="font-size:12px;font-weight:600;color:#6b7280;display:block;margin-bottom:5px;">BG Color 1</label>
                                    <div style="display:flex;align-items:center;gap:8px;">
                                        <input type="color" id="tplBgColor" value="${d.bg_color || '#1e1b4b'}"
                                            style="width:44px;height:38px;border:2px solid #e5e7eb;border-radius:8px;cursor:pointer;padding:2px;"
                                            oninput="updateCertPreview()">
                                        <input type="text" id="tplBgColorHex" value="${d.bg_color || '#1e1b4b'}"
                                            style="flex:1;padding:8px;border:2px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:monospace;outline:none;"
                                            oninput="syncColorFromHex('tplBgColor','tplBgColorHex')"
                                            onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='#e5e7eb'">
                                    </div>
                                </div>
                                <div>
                                    <label style="font-size:12px;font-weight:600;color:#6b7280;display:block;margin-bottom:5px;">BG Color 2</label>
                                    <div style="display:flex;align-items:center;gap:8px;">
                                        <input type="color" id="tplAccentColor" value="${d.accent_color || '#7c3aed'}"
                                            style="width:44px;height:38px;border:2px solid #e5e7eb;border-radius:8px;cursor:pointer;padding:2px;"
                                            oninput="updateCertPreview()">
                                        <input type="text" id="tplAccentHex" value="${d.accent_color || '#7c3aed'}"
                                            style="flex:1;padding:8px;border:2px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:monospace;outline:none;"
                                            oninput="syncColorFromHex('tplAccentColor','tplAccentHex')"
                                            onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='#e5e7eb'">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Image BG -->
                        <div id="bgImagePanel" style="display:none;">
                            <div id="tplImageDropZone"
                                onclick="document.getElementById('tplBgImageInput').click()"
                                style="border:2px dashed #c4b5fd;border-radius:12px;padding:24px;text-align:center;
                                       cursor:pointer;background:#f5f3ff;transition:all 0.2s;"
                                onmouseenter="this.style.borderColor='#7c3aed';this.style.background='#ede9fe'"
                                onmouseleave="this.style.borderColor='#c4b5fd';this.style.background='#f5f3ff'">
                                <i class="fas fa-cloud-upload-alt" style="font-size:28px;color:#7c3aed;display:block;margin-bottom:8px;"></i>
                                <div style="font-size:13px;font-weight:600;color:#5b21b6;">Click to upload background</div>
                                <div style="font-size:11px;color:#9ca3af;margin-top:4px;">PNG, JPG, WebP — Recommended: 1200×850px</div>
                            </div>
                            <input type="file" id="tplBgImageInput" accept="image/*" style="display:none"
                                onchange="handleTplBgImageUpload(this)">
                            <div id="tplImagePreviewThumb" style="margin-top:10px;display:none;">
                                <img id="tplThumbImg" style="width:100%;max-height:80px;object-fit:cover;border-radius:8px;border:2px solid #e5e7eb;">
                                <button onclick="clearTplBgImage()"
                                    style="margin-top:6px;background:#fee2e2;color:#dc2626;border:none;
                                           border-radius:8px;padding:5px 12px;font-size:12px;font-weight:700;
                                           cursor:pointer;font-family:inherit;width:100%;">
                                    <i class="fas fa-times"></i> Remove Image
                                </button>
                            </div>
                            ${d.bg_image_url ? `
                            <div id="tplExistingImage" style="margin-top:8px;">
                                <img src="${d.bg_image_url}" style="width:100%;max-height:80px;object-fit:cover;border-radius:8px;border:2px solid #e5e7eb;">
                                <p style="font-size:11px;color:#6b7280;margin:4px 0 0;">Current background image</p>
                            </div>` : ''}
                        </div>
                    </div>

                    <!-- Text Colors -->
                    <div style="margin-bottom:20px;">
                        <label style="display:block;font-weight:700;color:#374151;font-size:13px;margin-bottom:10px;">
                            <i class="fas fa-font" style="color:#7c3aed;margin-right:6px;"></i>Text Colors
                        </label>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            ${[
                                { id: 'tplTitleColor', label: 'Title Color', def: d.title_color || '#ffd700' },
                                { id: 'tplNameColor',  label: 'Name Color',  def: d.name_color  || '#ffffff' },
                                { id: 'tplTextColor',  label: 'Body Text',   def: d.text_color  || '#c7d2fe' },
                            ].map(c => `
                            <div>
                                <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:5px;">${c.label}</label>
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <input type="color" id="${c.id}" value="${c.def}"
                                        style="width:38px;height:34px;border:2px solid #e5e7eb;border-radius:6px;cursor:pointer;padding:2px;"
                                        oninput="updateCertPreview()">
                                    <span style="font-size:12px;font-family:monospace;color:#6b7280;" id="${c.id}Hex">${c.def}</span>
                                </div>
                            </div>`).join('')}

                            <!-- Border Style -->
                            <div>
                                <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:5px;">Border Style</label>
                                <select id="tplBorderStyle" onchange="updateCertPreview()"
                                    style="width:100%;padding:7px;border:2px solid #e5e7eb;border-radius:8px;
                                           font-size:12px;font-family:inherit;outline:none;">
                                    <option value="gold"   ${(d.border_style||'gold')==='gold'   ?'selected':''}>✨ Gold Border</option>
                                    <option value="white"  ${d.border_style==='white'  ?'selected':''}>⬜ White Border</option>
                                    <option value="accent" ${d.border_style==='accent' ?'selected':''}>🎨 Accent Border</option>
                                    <option value="none"   ${d.border_style==='none'   ?'selected':''}>🚫 No Border</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Preset palettes -->
                    <div style="margin-bottom:8px;">
                        <label style="display:block;font-weight:700;color:#374151;font-size:13px;margin-bottom:10px;">
                            <i class="fas fa-swatchbook" style="color:#7c3aed;margin-right:6px;"></i>Quick Presets
                        </label>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            ${[
                                { name:'Ocean',     bg:'#0c2a4a', ac:'#0099ff', tc:'#7dd3fc', nc:'#fff', tx:'#bae6fd' },
                                { name:'Emerald',   bg:'#064e3b', ac:'#10b981', tc:'#6ee7b7', nc:'#fff', tx:'#a7f3d0' },
                                { name:'Rose Gold',  bg:'#3b1219', ac:'#e11d48', tc:'#fda4af', nc:'#fff', tx:'#fecdd3' },
                                { name:'Midnight',  bg:'#0f172a', ac:'#6366f1', tc:'#a5b4fc', nc:'#fff', tx:'#c7d2fe' },
                                { name:'Sand',      bg:'#78350f', ac:'#d97706', tc:'#fef3c7', nc:'#fff', tx:'#fde68a' },
                                { name:'Slate',     bg:'#1e293b', ac:'#94a3b8', tc:'#e2e8f0', nc:'#fff', tx:'#cbd5e1' },
                            ].map(p => `
                            <button onclick="applyPreset('${p.bg}','${p.ac}','${p.tc}','${p.nc}','${p.tx}')"
                                style="padding:6px 12px;border-radius:20px;border:2px solid transparent;
                                       font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;
                                       background:linear-gradient(135deg,${p.bg},${p.ac});color:white;
                                       transition:all 0.2s;white-space:nowrap;"
                                onmouseenter="this.style.transform='scale(1.05)'"
                                onmouseleave="this.style.transform=''">
                                ${p.name}
                            </button>`).join('')}
                        </div>
                    </div>
                </div>

                <!-- RIGHT: Live Preview -->
                <div style="padding:20px;background:#f0f0f0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                    <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;
                                letter-spacing:1px;margin-bottom:12px;">Live Preview</div>
                    <div id="certLivePreview" style="
                        width:100%;max-width:380px;min-height:265px;border-radius:10px;
                        overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.25);
                        position:relative;font-family:Georgia,serif;text-align:center;
                        display:flex;flex-direction:column;align-items:center;justify-content:center;
                        padding:24px 20px;box-sizing:border-box;
                        background:linear-gradient(135deg,#1e1b4b,#7c3aed);
                    ">
                        <!-- Inner border -->
                        <div id="prevInnerBorder" style="position:absolute;inset:8px;border:1px solid rgba(255,215,0,0.4);border-radius:4px;pointer-events:none;"></div>

                        <!-- Logo -->
                        <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:50%;
                                    display:flex;align-items:center;justify-content:center;margin-bottom:8px;flex-shrink:0;">
                            <i class="fas fa-graduation-cap" style="color:white;font-size:14px;"></i>
                        </div>

                        <div id="prevOrg" style="font-size:7px;letter-spacing:2px;text-transform:uppercase;
                                                  color:rgba(255,215,0,0.9);margin-bottom:10px;
                                                  font-family:'Plus Jakarta Sans',sans-serif;font-weight:700;">
                            ASAI — AFRICAN SCHOOL OF AI
                        </div>

                        <div id="prevTitle" style="font-size:18px;font-weight:700;color:#ffd700;margin-bottom:6px;line-height:1.2;">
                            Certificate of Completion
                        </div>

                        <div style="font-size:7px;letter-spacing:1.5px;text-transform:uppercase;
                                    color:rgba(255,255,255,0.6);margin-bottom:10px;
                                    font-family:'Plus Jakarta Sans',sans-serif;">
                            THIS IS TO CERTIFY THAT
                        </div>

                        <div id="prevName" style="font-size:20px;font-weight:700;color:white;
                                                   border-bottom:2px solid rgba(255,215,0,0.6);
                                                   padding-bottom:5px;margin-bottom:8px;min-width:160px;">
                            Student Name
                        </div>

                        <div id="prevText" style="font-size:9px;color:rgba(199,210,254,0.9);
                                                   font-style:italic;max-width:240px;line-height:1.5;margin-bottom:12px;">
                            has successfully completed the ASAI Full Program
                        </div>

                        <div style="display:flex;justify-content:space-between;align-items:flex-end;
                                    width:100%;margin-top:auto;padding-top:10px;">
                            <div style="text-align:center;">
                                <div style="width:80px;height:1px;background:rgba(255,255,255,0.4);margin:0 auto 3px;"></div>
                                <div style="font-size:7px;color:rgba(255,255,255,0.7);font-family:'Plus Jakarta Sans',sans-serif;">Program Director</div>
                            </div>
                            <div id="prevSeal" style="width:36px;height:36px;border-radius:50%;
                                        background:rgba(255,255,255,0.15);border:2px solid rgba(255,215,0,0.6);
                                        display:flex;align-items:center;justify-content:center;">
                                <i class="fas fa-star" style="color:rgba(255,215,0,0.9);font-size:12px;"></i>
                            </div>
                            <div style="text-align:center;">
                                <div style="width:80px;height:1px;background:rgba(255,255,255,0.4);margin:0 auto 3px;"></div>
                                <div style="font-size:7px;color:rgba(255,255,255,0.7);font-family:'Plus Jakarta Sans',sans-serif;">Issue Date</div>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top:14px;text-align:center;font-size:11px;color:#9ca3af;">
                        Preview updates in real-time as you design
                    </div>
                </div>
            </div>

            <!-- FOOTER ACTIONS -->
            <div style="padding:20px 28px;border-top:1px solid #f0f0f0;display:flex;gap:12px;background:white;">
                <button onclick="document.getElementById('certTemplateBuilderModal').remove()"
                    style="flex:1;padding:13px;border:2px solid #e5e7eb;border-radius:12px;
                           background:white;color:#6b7280;font-weight:700;cursor:pointer;font-family:inherit;font-size:14px;">
                    Cancel
                </button>
                <button onclick="saveCustomTemplate()"
                    style="flex:2;padding:13px;background:linear-gradient(135deg,#7c3aed,#6d28d9);border:none;
                           border-radius:12px;color:white;font-weight:800;cursor:pointer;font-family:inherit;
                           font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;
                           box-shadow:0 6px 20px rgba(124,58,237,0.35);">
                    <i class="fas fa-save"></i>
                    ${isEdit ? 'Update Template' : 'Save Template'}
                </button>
            </div>
        </div>
        `;

        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        // Initialize preview
        setTimeout(updateCertPreview, 50);
        // Set correct bg type if editing with image
        if (d.bg_image_url) setTimeout(() => switchBgType('image'), 100);
    };

    // ══════════════════════════════════════════════════════════
    // 5. PREVIEW UPDATER
    // ══════════════════════════════════════════════════════════
    window.updateCertPreview = function () {
        const preview = document.getElementById('certLivePreview');
        if (!preview) return;

        const bgColor     = document.getElementById('tplBgColor')?.value     || '#1e1b4b';
        const accentColor = document.getElementById('tplAccentColor')?.value || '#7c3aed';
        const titleColor  = document.getElementById('tplTitleColor')?.value  || '#ffd700';
        const nameColor   = document.getElementById('tplNameColor')?.value   || '#ffffff';
        const textColor   = document.getElementById('tplTextColor')?.value   || '#c7d2fe';
        const borderStyle = document.getElementById('tplBorderStyle')?.value || 'gold';
        const bgType      = window._tplBgType || 'color';
        const imageUrl    = window._tplBgImageDataUrl || window._tplExistingImageUrl || null;

        // Update hex labels
        ['tplTitleColor','tplNameColor','tplTextColor'].forEach(id => {
            const el = document.getElementById(id);
            const label = document.getElementById(id + 'Hex');
            if (el && label) label.textContent = el.value;
        });
        const bgHex = document.getElementById('tplBgColorHex');
        const acHex = document.getElementById('tplAccentHex');
        if (bgHex) bgHex.value = bgColor;
        if (acHex) acHex.value = accentColor;

   // Background
       if (bgType === 'image' && imageUrl) {
    // Show ONLY the image — hide all ASAI content inside preview
    preview.style.backgroundImage    = `url('${imageUrl}')`;
    preview.style.backgroundSize     = 'cover';
    preview.style.backgroundPosition = 'center';
    preview.style.backgroundRepeat   = 'no-repeat';

    // Remove any old overlay
    document.getElementById('prevImageOverlay')?.remove();

    // Hide all child elements — the image IS the certificate
    [...preview.children].forEach(child => {
        child.style.display = 'none';
    });

} else {
    // Color background — show all ASAI content
    preview.style.backgroundImage = 'none';
    preview.style.background      = `linear-gradient(135deg, ${bgColor}, ${accentColor})`;

    document.getElementById('prevImageOverlay')?.remove();

    // Restore all child elements
    [...preview.children].forEach(child => {
        child.style.display  = '';
        child.style.position = '';
        child.style.zIndex   = '';
    });
}
        // Inner border
        const innerBorder = document.getElementById('prevInnerBorder');
        if (innerBorder) {
            const borderColors = { gold: 'rgba(255,215,0,0.4)', white: 'rgba(255,255,255,0.3)', accent: accentColor + '60', none: 'transparent' };
            innerBorder.style.borderColor = borderColors[borderStyle] || 'transparent';
        }

        // Text colors
        const setColor = (id, color) => { const el = document.getElementById(id); if (el) el.style.color = color; };
        setColor('prevTitle', titleColor);
        setColor('prevName',  nameColor);
        setColor('prevText',  textColor);
        setColor('prevOrg',   titleColor);

        // Name underline
        const prevName = document.getElementById('prevName');
        if (prevName) prevName.style.borderBottomColor = accentColor + '80';

        // Seal
        const seal = document.getElementById('prevSeal');
        if (seal) {
            seal.style.borderColor = accentColor;
            const starIcon = seal.querySelector('i');
            if (starIcon) starIcon.style.color = titleColor;
        }
    };

    // ══════════════════════════════════════════════════════════
    // 6. BACKGROUND TYPE SWITCHER
    // ══════════════════════════════════════════════════════════
    window.switchBgType = function (type) {
        window._tplBgType = type;
        const colorPanel = document.getElementById('bgColorPanel');
        const imagePanel = document.getElementById('bgImagePanel');
        const colorBtn   = document.getElementById('bgTypeColor');
        const imageBtn   = document.getElementById('bgTypeImage');

        if (colorPanel) colorPanel.style.display = type === 'color' ? 'block' : 'none';
        if (imagePanel) imagePanel.style.display = type === 'image' ? 'block' : 'none';

        const activeStyle   = 'border-color:#7c3aed;background:#ede9fe;color:#5b21b6;';
        const inactiveStyle = 'border-color:#e5e7eb;background:white;color:#6b7280;';
        if (colorBtn) colorBtn.style.cssText += type === 'color' ? activeStyle : inactiveStyle;
        if (imageBtn) imageBtn.style.cssText += type === 'image' ? activeStyle : inactiveStyle;

        updateCertPreview();
    };

    window.handleTplBgImageUpload = function (input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
        window._tplBgImageDataUrl = e.target.result;
        window._tplBgImageFile    = file;
        window._tplBgType         = 'image';
        const thumb = document.getElementById('tplImagePreviewThumb');
            const img   = document.getElementById('tplThumbImg');
            if (thumb) thumb.style.display = 'block';
            if (img)   img.src = e.target.result;
            const existing = document.getElementById('tplExistingImage');
            if (existing) existing.style.display = 'none';
            updateCertPreview();
        };
        reader.readAsDataURL(file);
    };

    window.clearTplBgImage = function () {
        window._tplBgImageDataUrl = null;
        window._tplBgImageFile    = null;
        const thumb = document.getElementById('tplImagePreviewThumb');
        if (thumb) thumb.style.display = 'none';
        const input = document.getElementById('tplBgImageInput');
        if (input) input.value = '';
        updateCertPreview();
    };

    // ══════════════════════════════════════════════════════════
    // 7. PRESETS
    // ══════════════════════════════════════════════════════════
    window.applyPreset = function (bg, ac, tc, nc, tx) {
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        set('tplBgColor',    bg);
        set('tplBgColorHex', bg);
        set('tplAccentColor', ac);
        set('tplAccentHex',  ac);
        set('tplTitleColor', tc);
        set('tplNameColor',  nc);
        set('tplTextColor',  tx);
        switchBgType('color');
        updateCertPreview();
    };

    window.syncColorFromHex = function (colorId, hexId) {
        const hex = document.getElementById(hexId)?.value;
        if (hex && /^#[0-9a-fA-F]{6}$/.test(hex)) {
            const el = document.getElementById(colorId);
            if (el) el.value = hex;
            updateCertPreview();
        }
    };

    // ══════════════════════════════════════════════════════════
    // 8. SAVE TO SUPABASE
    // ══════════════════════════════════════════════════════════
    window.saveCustomTemplate = async function () {
        const name = document.getElementById('tplName')?.value?.trim();
        if (!name) {
            if (typeof showToast === 'function') showToast('Please enter a template name', 'error');
            return;
        }

        const saveBtn = document.querySelector('#certTemplateBuilderModal button[onclick="saveCustomTemplate()"]');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

        try {
            let bgImageUrl = _editingTplId
                ? (document.getElementById('tplExistingImage') ? window._tplExistingImageUrl : null)
                : null;

            // Upload background image to Supabase Storage if provided
            if (window._tplBgImageFile) {
                const ext    = window._tplBgImageFile.name.split('.').pop();
                const path   = `cert-templates/${Date.now()}.${ext}`;
                const { data: upData, error: upErr } = await db()
                    .storage.from('certificates')
                    .upload(path, window._tplBgImageFile, { upsert: true });

                if (upErr) {
                    // Fallback: use base64 data URL if storage fails
                    console.warn('Storage upload failed, using data URL:', upErr.message);
                    bgImageUrl = window._tplBgImageDataUrl;
                } else {
                    const { data: urlData } = db().storage.from('certificates').getPublicUrl(path);
                    bgImageUrl = urlData?.publicUrl || window._tplBgImageDataUrl;
                }
            }

            const bgType = window._tplBgType || 'color';

            const payload = {
                name,
                bg_color:     document.getElementById('tplBgColor')?.value     || '#1e1b4b',
                accent_color: document.getElementById('tplAccentColor')?.value || '#7c3aed',
                title_color:  document.getElementById('tplTitleColor')?.value  || '#ffd700',
                name_color:   document.getElementById('tplNameColor')?.value   || '#ffffff',
                text_color:   document.getElementById('tplTextColor')?.value   || '#c7d2fe',
                border_style: document.getElementById('tplBorderStyle')?.value || 'gold',
                bg_image_url: bgType === 'image' ? bgImageUrl : null,
            };

            let savedTpl;

            if (_editingTplId) {
                const { data, error } = await db()
                    .from('certificate_templates')
                    .update(payload)
                    .eq('id', _editingTplId)
                    .select()
                    .single();
                if (error) throw error;
                savedTpl = data;
            } else {
                const { data: { user } } = await db().auth.getUser();
                const { data, error } = await db()
                    .from('certificate_templates')
                    .insert({ ...payload, created_by: user?.id })
                    .select()
                    .single();
                if (error) throw error;
                savedTpl = data;
            }

            // Reset state
            window._tplBgImageDataUrl = null;
            window._tplBgImageFile    = null;
            _editingTplId = null;

            document.getElementById('certTemplateBuilderModal')?.remove();

            // Add/update card in grid
            addTemplateCardToGrid(savedTpl);

            if (typeof showToast === 'function') {
                showToast(`✅ Template "${name}" saved permanently!`);
            }

        } catch (err) {
            console.error('Save template error:', err);
            if (typeof showToast === 'function') showToast('Error: ' + err.message, 'error');
            if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Template'; }
        }
    };

    // ══════════════════════════════════════════════════════════
    // 9. EDIT existing custom template
    // ══════════════════════════════════════════════════════════
    window.editCustomTemplate = async function (tplId) {
        try {
            const { data, error } = await db()
                .from('certificate_templates')
                .select('*')
                .eq('id', tplId)
                .single();
            if (error) throw error;
            window._tplExistingImageUrl = data.bg_image_url || null;
            openTemplateBuilder(data);
        } catch (err) {
            if (typeof showToast === 'function') showToast('Error loading template: ' + err.message, 'error');
        }
    };

    // ══════════════════════════════════════════════════════════
    // 10. DELETE custom template
    // ══════════════════════════════════════════════════════════
    window.deleteCustomTemplate = async function (tplId, tplName, btn) {
        if (!confirm(`Delete template "${tplName}"?\n\nThis cannot be undone.`)) return;
        try {
            const { error } = await db()
                .from('certificate_templates')
                .delete()
                .eq('id', tplId);
            if (error) throw error;
            document.getElementById(`tpl-custom-${tplId}`)?.remove();
            if (typeof showToast === 'function') showToast(`Template "${tplName}" deleted`);
        } catch (err) {
            if (typeof showToast === 'function') showToast('Error: ' + err.message, 'error');
        }
    };

    // ══════════════════════════════════════════════════════════
    // 11. HOOK INTO CERT PREVIEW (support custom templates)
    // ══════════════════════════════════════════════════════════
    async function getCustomTemplateTheme(tplId) {
        try {
            const { data } = await db()
                .from('certificate_templates')
                .select('*')
                .eq('id', tplId)
                .single();
            if (!data) return null;

            const borderColors = {
                gold:   '#ffd700',
                white:  'rgba(255,255,255,0.5)',
                accent: data.accent_color,
                none:   'transparent'
            };
            const bc = borderColors[data.border_style || 'gold'];

 const hasImage = !!data.bg_image_url;
return {
    bg:        hasImage
                   ? `url('${data.bg_image_url}') center/cover no-repeat`
                   : `linear-gradient(135deg, ${data.bg_color || '#1e1b4b'}, ${data.accent_color || '#7c3aed'})`,
    _hasImage: hasImage,
    border:    'none',
    inner:     hasImage ? `1px solid ${borderColors[data.border_style || 'gold']}` : 'none',
    title:     data.title_color  || '#ffd700',
    name:      data.name_color   || '#ffffff',
    nameUL:    data.accent_color || '#ffd700',
    text:      data.text_color   || '#c7d2fe',
    sub:       data.title_color  || '#ffd700',
    org:       data.title_color  || '#ffd700',
    seal:      'rgba(255,255,255,0.15)',
    sealB:     `2px solid ${data.accent_color || '#ffd700'}`,
    sealC:     data.title_color  || '#ffd700',
    _raw:      data
};
        } catch (_) { return null; }
    }

    // Patch the global certPreview / previewCert to support custom templates
    const _origCertPreview = window.certPreview;
    window.certPreview = async function (studentName, courseName, certNumber, template) {
        if (template && template.startsWith('custom-')) {
            const tplId = template.replace('custom-', '');
            const t = await getCustomTemplateTheme(tplId);
            if (t) {
                _renderCertPreviewModal(studentName, courseName, certNumber, t);
                return;
            }
        }
        // Fall back to original
        if (_origCertPreview) _origCertPreview(studentName, courseName, certNumber, template);
    };

    // Also patch previewCert alias
    window.previewCert = (id, sN, cN, num, tpl) => window.certPreview(sN, cN, num, tpl);

    function _renderCertPreviewModal(studentName, courseName, certNumber, t) {
        const date = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.zIndex = '5500';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:900px;">
                <div class="modal-header">
                    <h2><i class="fas fa-certificate" style="color:#7c3aed;margin-right:8px;"></i>Certificate Preview — ${t._raw?.name || 'Custom'}</h2>
                    <button class="modal-close" onclick="this.closest('.modal').remove()"><i class="fas fa-times"></i></button>
                </div>
                <div style="background:#e5e7eb;padding:28px;border-radius:14px;display:flex;justify-content:center;overflow:auto;">
    <div style="width:720px;min-height:500px;background:${t.bg};border:${t.border};padding:50px 60px;
                position:relative;font-family:Georgia,serif;text-align:center;
                box-shadow:0 24px 70px rgba(0,0,0,0.35);display:flex;flex-direction:column;align-items:center;
                background-size:cover;background-position:center;">

        ${t._hasImage ? `<div style="position:absolute;inset:0;background:rgba(5,10,30,0.62);z-index:0;"></div>` : ''}

        <div style="position:relative;z-index:1;width:100%;display:flex;flex-direction:column;align-items:center;flex:1;">
                        <div style="position:absolute;inset:14px;border:${t.inner};pointer-events:none;border-radius:2px;"></div>
                        <div style="width:60px;height:60px;background:rgba(255,255,255,0.15);border-radius:50%;
                                    display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
                            <i class="fas fa-graduation-cap" style="color:white;font-size:24px;"></i>
                        </div>
                        <div style="font-size:11px;font-weight:700;letter-spacing:3.5px;text-transform:uppercase;
                                    color:${t.org};margin-bottom:20px;font-family:'Plus Jakarta Sans',sans-serif;">
                            ASAI — African School of AI
                        </div>
                        <div style="font-size:36px;font-weight:700;color:${t.title};line-height:1.1;margin-bottom:10px;">
                            Certificate of Completion
                        </div>
                        <div style="font-size:12px;color:${t.sub};letter-spacing:2.5px;text-transform:uppercase;
                                    margin-bottom:24px;font-family:'Plus Jakarta Sans',sans-serif;">This is to certify that</div>
                        <div style="font-size:34px;font-weight:700;color:${t.name};border-bottom:2px solid ${t.nameUL};
                                    padding-bottom:8px;margin-bottom:18px;min-width:300px;">${studentName}</div>
                        <div style="font-size:13px;color:${t.text};font-style:italic;margin-bottom:8px;">has successfully completed</div>
                        <div style="font-size:20px;font-weight:600;color:${t.name};margin-bottom:22px;">${courseName || 'ASAI Full Program Certificate'}</div>
                        <div style="font-size:13px;color:${t.text};font-style:italic;max-width:460px;line-height:1.7;margin-bottom:28px;">
                            demonstrating knowledge, dedication, and commitment to excellence in AI education.
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:flex-end;width:100%;margin-top:auto;padding-top:16px;">
                            <div style="text-align:center;">
                                <div style="width:140px;height:1px;background:${t.sub};opacity:0.5;margin:0 auto 6px;"></div>
                                <div style="font-size:12px;font-weight:600;color:${t.text};font-family:'Plus Jakarta Sans',sans-serif;">Dr. Amina Mohammed</div>
                                <div style="font-size:10px;color:${t.sub};font-family:'Plus Jakarta Sans',sans-serif;">Program Director</div>
                            </div>
                            <div style="width:72px;height:72px;border-radius:50%;background:${t.seal};border:${t.sealB};
                                        display:flex;align-items:center;justify-content:center;">
                                <i class="fas fa-star" style="color:${t.sealC};font-size:22px;"></i>
                            </div>
                            <div style="text-align:center;">
                                <div style="width:140px;height:1px;background:${t.sub};opacity:0.5;margin:0 auto 6px;"></div>
                                <div style="font-size:12px;font-weight:600;color:${t.text};font-family:'Plus Jakarta Sans',sans-serif;">Date: ${date}</div>
                                <div style="font-size:10px;color:${t.sub};font-family:'Plus Jakarta Sans',sans-serif;">Issue Date</div>
                            </div>
                        </div>
                        <div style="position:absolute;bottom:16px;right:20px;font-size:9px;color:${t.sub};
                                    font-family:'Courier New',monospace;opacity:0.7;">ID: ${certNumber || 'PREVIEW'}</div>
        </div><!-- closes z-index:1 content wrapper -->
    </div><!-- closes certificate wrapper -->
</div>
                <div style="display:flex;gap:12px;margin-top:18px;">
                    <button class="btn-primary" onclick="showToast('PDF download — integrate html2pdf.js')" style="flex:1;">
                        <i class="fas fa-download"></i> Download PDF
                    </button>
                    <button class="btn-secondary" onclick="this.closest('.modal').remove()" style="flex:1;">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    }

    // ══════════════════════════════════════════════════════════
    // 12. INIT — inject button when DOM/section is ready
    // ══════════════════════════════════════════════════════════
    function tryInit() {
        const grid = document.querySelector('.template-grid');
        if (grid) {
            injectAddTemplateButton();
        } else {
            setTimeout(tryInit, 600);
        }
    }

    // Also re-inject when Certificates tab is clicked
    document.addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item[data-section="certificates"]');
        if (navItem) setTimeout(injectAddTemplateButton, 400);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit);
    } else {
        setTimeout(tryInit, 800);
    }

    console.log('✅ cert-template-builder.js loaded — Custom template creator ready');

})();