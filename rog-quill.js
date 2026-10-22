/* START OF SCRIPT - ROG Shared Quill */
(function (global) {

  'use strict';



  // ==========================================================================

  // Configuration

  // ==========================================================================



  var CONFIG = {



    // ---- upload service ----------------------------------------------------

    endpoint:   'https://rog-tech.io:8450/api/v1/tadabase/files/upload',

    tokenPrefix:   'tb-apiToken_',

    userPrefix:    'tb-user_',

    appId: '', // empty as default

    fileField:  'file',            // FormData field name the service expects

    urlPath:    'url',             // property on the JSON response holding the URL

    application: '',



    // ---- submit lock -------------------------------------------------------

    // Disabled while an upload is in flight. Matches the selector already used

    // by ROG_renderQuill's own submit hook, and is looked up inside the

    // editor's scope so one form's upload never locks another form's button.

    submitSelector: '.af-form-submit',



    // ---- resize ------------------------------------------------------------

    // Click an image to get drag handles. Writes the `width` attribute only.

    enableResize: true,



    // ---- limits ------------------------------------------------------------

    maxBytes: 10 * 1024 * 1024,

    allowedMime: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'],



    maxDisplayWidth: 600,

    maxPixelWidth: 1600,

    downscaleQuality: 0.9,

    // SVG is deliberately excluded: it is XML that can carry <script>.



    // ---- copy --------------------------------------------------------------

    text: {

      uploading:   'מעלה תמונה',

      uploadingN:  'מעלה {n} תמונות',

      tooBig:      'התמונה גדולה מדי (מקסימום 10MB)',

      badType:     'סוג הקובץ אינו נתמך. ניתן להעלות PNG, JPG, GIF, WEBP או BMP',

      notAnImage:  'הקובץ אינו תמונה תקינה',

      uploadFail:  'העלאת התמונה נכשלה',

      errorTitle:  'נראה שמשהו השתבש...',

      errorBody:   'נא לפנות למוקד ROG במידה והתקלה ממשיכה!'

    }

  };



    // ==========================================================================

  // Size caps — downscale before upload, cap display width after

  // ==========================================================================



  function loadImage(blob) {

    return new Promise(function (resolve, reject) {

      var url = URL.createObjectURL(blob);

      var img = new Image();

      img.onload  = function () { URL.revokeObjectURL(url); resolve(img); };

      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(CONFIG.text.notAnImage)); };

      img.src = url;

    });

  }



  /**

   * Returns { blob, naturalWidth, displayWidth }.

   * blob          — the original, or a downscaled copy if wider than maxPixelWidth

   * displayWidth  — value for the width attribute, or null for natural size

   */

  function prepareImage(blob) {

    return loadImage(blob).then(function (img) {

      var w = img.naturalWidth, h = img.naturalHeight;

      var maxPx = CONFIG.maxPixelWidth;

      var out = Promise.resolve(blob);



      if (maxPx && w > maxPx && blob.type !== 'image/gif') {

        out = new Promise(function (resolve) {

          var canvas = document.createElement('canvas');

          canvas.width  = maxPx;

          canvas.height = Math.round(h * maxPx / w);

          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

          // canvas cannot encode BMP; PNG keeps it lossless.

          var type = blob.type === 'image/bmp' ? 'image/png' : blob.type;

          canvas.toBlob(function (b) { resolve(b || blob); }, type, CONFIG.downscaleQuality);

        }).then(function (b) { w = Math.min(w, maxPx); return b; });

      }



      return out.then(function (b) {

        return { blob: b, naturalWidth: w, displayWidth: displayWidthFor(w) };

      });

    });

  }



  /** The width attribute to write for an image of this natural width. */

  function displayWidthFor(naturalWidth) {

    var cap = CONFIG.maxDisplayWidth;

    return (cap && naturalWidth > cap) ? cap : null;

  }



  /** Cap an <img> element in pasted HTML. Drops `height` so the ratio holds. */

  function capImgElement(img, naturalWidth) {

    var cap = CONFIG.maxDisplayWidth;

    if (!cap) return;

    var current = parseInt(img.getAttribute('width'), 10);

    var target = naturalWidth ? displayWidthFor(naturalWidth) : null;

    if (current > cap) target = cap;

    if (target) {

      img.setAttribute('width', String(target));

      img.removeAttribute('height');

    }

  }





  // ==========================================================================

  // App id resolution

  // ==========================================================================

  //

  // TB לא קיים בזמן שה-header נטען, ולכן אי אפשר לקבע את שמות המפתחות

  // ב-CONFIG. הפתרון הוא לפתור אותם בעצלתיים — הקריאה הראשונה מתרחשת

  // בהעלאה הראשונה, הרבה אחרי ש-TB נרשם על window.

  //

  // שלוש דרכים, לפי סדר אמינות:

  //   1. TB.getAppId()  — המקור הרשמי

  //   2. סריקת localStorage אחרי מפתח tb-apiToken_*  — עובד גם בלי TB

  //   3. CONFIG.appId   — override ידני, נבדק ראשון אם הוגדר

  //

  // התוצאה נשמרת במטמון: ה-app_id לא משתנה בתוך אותו עמוד.



  var _appId = null;



  function resolveAppId() {

    if (_appId) return _appId;

    if (CONFIG.appId) return (_appId = String(CONFIG.appId));



    // 1 — המקור הרשמי

    try {

      if (global.TB && typeof global.TB.getAppId === 'function') {

        var id = global.TB.getAppId();

        if (id) return (_appId = String(id));

      }

    } catch (e) {

      console.warn('[QuillImageUpload] TB.getAppId() threw', e);

    }



    // 2 — נפילה לאחור: המפתח עצמו מכיל את ה-app_id.

    // עובד גם אם TB נעלם, נטען מאוחר, או שינה API.

    try {

      var prefix = CONFIG.tokenPrefix;

      for (var i = 0; i < global.localStorage.length; i++) {

        var key = global.localStorage.key(i);

        if (key && key.indexOf(prefix) === 0 && key.length > prefix.length) {

          return (_appId = key.slice(prefix.length));

        }

      }

    } catch (e) {}



    return '';   // לא נשמר במטמון — ננסה שוב בהעלאה הבאה

  }



  /** קריאת ערך מ-localStorage לפי prefix + app_id. */

  function storageValue(prefix) {

    var id = resolveAppId();

    if (!id) return '';

    try { return global.localStorage.getItem(prefix + id) || ''; }

    catch (e) { return ''; }

  }



  function getToken() { return storageValue(CONFIG.tokenPrefix); }

  function getUser()  { return storageValue(CONFIG.userPrefix); }



  // ==========================================================================

  // Upload — ported from uploadFileS3

  // ==========================================================================

  //

  // Kept from the original:

  //   • endpoint, and the token pulled from localStorage into a query param

  //   • organizationId / tableId / recordId as query params

  //   • FormData with a "file" field

  //   • reading res.data.url off the response

  //

  // Dropped, because it belongs to the file-field widget rather than to Quill:

  //   • fieldSlug + the `.${fieldSlug} #${file.id}` progress-bar DOM plumbing

  //   • successArr and its record/field payload

  //   • createConfirmedIcon

  //   • the {id, file} wrapper — here we receive a raw Blob

  //

  // Uses XHR rather than axios: upload progress is native, and it removes a

  // dependency on axios being loaded on whichever page the editor renders on.

  //

  // Note on the original's `"contect-type"` header — it is misspelled, and

  // that typo is load-bearing. Spelled correctly it would have overwritten

  // the multipart Content-Type without its boundary parameter and broken the

  // request. Here the header is simply omitted, which is the correct thing to

  // do: the browser sets it, boundary and all, from the FormData.



  function uploadImage(blob, onProgress, context) {

    return new Promise(function (resolve, reject) {

      var ctx = context || {};

      var token = getToken();

    //   try { token = global.localStorage.getItem(CONFIG.tokenKey) || ''; } catch (e) {}



      var url = new URL(CONFIG.endpoint);

      url.searchParams.append('organizationId', ctx.organizationId || '');

      url.searchParams.append('tableId',        ctx.tableId || '');

      url.searchParams.append('recordId',       ctx.recordId || '');

      url.searchParams.append('token',          token);

      url.searchParams.append('application', CONFIG.application)





      var form = new FormData();

      form.append(CONFIG.fileField, blob, buildFilename(blob));



      var xhr = new XMLHttpRequest();

      xhr.open('POST', url.toString(), true);



      // Do NOT set Content-Type — the browser must add the multipart boundary.



      xhr.upload.onprogress = function (e) {

        if (e.lengthComputable && typeof onProgress === 'function') {

          onProgress(e.loaded / e.total);

        }

      };



      xhr.onload = function () {

        if (xhr.status < 200 || xhr.status >= 300) {

          return reject(new Error('HTTP ' + xhr.status));

        }

        var data;

        try {

          data = JSON.parse(xhr.responseText);

        } catch (e) {

          return reject(new Error('תשובה לא תקינה מהשרת'));

        }

        var link = data && data[CONFIG.urlPath];

        if (!link || typeof link !== 'string') {

          return reject(new Error('השרת לא החזיר כתובת לקובץ'));

        }

        resolve(link);

      };



      xhr.onerror   = function () { reject(new Error('שגיאת רשת')); };

      xhr.ontimeout = function () { reject(new Error('פג הזמן הקצוב להעלאה')); };



      xhr.send(form);

    });

  }



  /** Clipboard blobs are nameless; the service needs something to store. */

  function buildFilename(blob) {

    var ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');

    var stamp = new Date().toISOString().replace(/[:.]/g, '-');

    var rand = Math.random().toString(36).slice(2, 8);

    return 'paste-' + stamp + '-' + rand + '.' + ext;

  }



  // ==========================================================================

  // Validation — MIME claim plus magic-number proof

  // ==========================================================================



  var SIGNATURES = [

    { mime: 'image/png',  bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },

    { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },

    { mime: 'image/gif',  bytes: [0x47, 0x49, 0x46, 0x38] },

    { mime: 'image/bmp',  bytes: [0x42, 0x4d] },

    { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] }   // + "WEBP" at offset 8

  ];



  function readHeader(blob, length) {

    return new Promise(function (resolve, reject) {

      var reader = new FileReader();

      reader.onload  = function () { resolve(new Uint8Array(reader.result)); };

      reader.onerror = function () { reject(reader.error); };

      reader.readAsArrayBuffer(blob.slice(0, length));

    });

  }



  function matches(bytes, sig) {

    for (var i = 0; i < sig.bytes.length; i++) {

      if (bytes[i] !== sig.bytes[i]) return false;

    }

    return true;

  }



  /**

   * A file can claim image/png and be a renamed executable. blob.type comes

   * from the client and is not evidence; the file signature is.

   */

  function validateImage(blob) {

    if (!blob || typeof blob.size !== 'number' || blob.size === 0) {

      return Promise.reject(new Error(CONFIG.text.notAnImage));

    }

    if (blob.size > CONFIG.maxBytes) {

      return Promise.reject(new Error(CONFIG.text.tooBig));

    }

    if (CONFIG.allowedMime.indexOf(blob.type) === -1) {

      return Promise.reject(new Error(CONFIG.text.badType));

    }



    return readHeader(blob, 16).then(function (bytes) {

      var ok = SIGNATURES.some(function (sig) {

        if (!matches(bytes, sig)) return false;

        if (sig.mime === 'image/webp') {

          return bytes[8] === 0x57 && bytes[9] === 0x45 &&

                 bytes[10] === 0x42 && bytes[11] === 0x50;

        }

        return true;

      });

      if (!ok) throw new Error(CONFIG.text.notAnImage);

    });

  }



  // ==========================================================================

  // UI lock

  // ==========================================================================

  // While an upload runs: the submit button is disabled, the editor is made

  // read-only, and an overlay reports progress. Nothing can be submitted and

  // nothing can be typed into a document that is about to change underneath.



  var STYLE_ID = 'qiu-styles';



  function injectStyles() {

    if (document.getElementById(STYLE_ID)) return;

    var css =

      '.qiu-overlay{position:absolute;inset:0;z-index:20;display:flex;' +

      'align-items:center;justify-content:center;background:rgba(255,255,255,.82);' +

      'backdrop-filter:blur(1px);pointer-events:all;}' +

      '.qiu-box{display:flex;align-items:center;gap:10px;padding:10px 16px;' +

      'border-radius:8px;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.15);' +

      'font:14px/1.4 inherit;color:#333;direction:rtl;}' +

      '.qiu-spin{width:18px;height:18px;border:2px solid #d9d9d9;' +

      'border-top-color:#4a90d9;border-radius:50%;animation:qiu-rot .7s linear infinite;' +

      'flex:0 0 auto;}' +

      '@keyframes qiu-rot{to{transform:rotate(360deg)}}' +

      '.qiu-pct{font-variant-numeric:tabular-nums;color:#666;min-width:38px;}' +

      '[data-qiu-locked]{opacity:.55;cursor:not-allowed!important;}';

    var el = document.createElement('style');

    el.id = STYLE_ID;

    el.textContent = css;

    document.head.appendChild(el);

  }



  /**

   * Find the submit buttons belonging to THIS editor's form.

   * Scoped, so an upload in one editor never locks a different form's button.

   */

  function lockedSubmits(scope) {

    if (!CONFIG.submitSelector) return [];

    var root =  document;

    if (root.jquery) root = root[0];               // unwrap a jQuery object

    if (!root || !root.querySelectorAll) root = document;

    return Array.prototype.slice.call(root.querySelectorAll(CONFIG.submitSelector));

  }



  function showOverlay(quill, count) {

    injectStyles();

    var container = quill.root.parentElement;   // .ql-container

    if (!container) return null;



    if (getComputedStyle(container).position === 'static') {

      container.style.position = 'relative';

    }



    var label = count > 1

      ? CONFIG.text.uploadingN.replace('{n}', count)

      : CONFIG.text.uploading;



    var overlay = document.createElement('div');

    overlay.className = 'qiu-overlay';

    overlay.innerHTML =

      '<div class="qiu-box">' +

        '<span class="qiu-spin"></span>' +

        '<span class="qiu-label"></span>' +

        '<span class="qiu-pct"></span>' +

      '</div>';

    overlay.querySelector('.qiu-label').textContent = label;

    container.appendChild(overlay);

    return overlay;

  }



  function lock(quill, count) {

    var overlay = showOverlay(quill, count);



    // Remember which buttons we actually disabled, so unlocking never

    // re-enables one that was already disabled for an unrelated reason.

    var touched = lockedSubmits(stateOf(quill).scope).filter(function (el) {

      if (el.disabled) return false;

      el.disabled = true;

      el.setAttribute('data-qiu-locked', '1');

      return true;

    });



    quill.enable(false);



    return {

      progress: function (fraction) {

        if (!overlay) return;

        var pct = overlay.querySelector('.qiu-pct');

        if (pct) pct.textContent = Math.round(fraction * 100) + '%';

      },

      release: function () {

        if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay);

        touched.forEach(function (el) {

          el.disabled = false;

          el.removeAttribute('data-qiu-locked');

        });

        quill.enable(true);

      }

    };

  }



  // ==========================================================================

  // Errors

  // ==========================================================================



  function notify(message) {

    if (global.Swal && typeof global.Swal.fire === 'function') {

      global.Swal.fire({

        icon: 'error',

        title: CONFIG.text.errorTitle,

        text: message || CONFIG.text.errorBody

      });

    } else if (global.TB && typeof global.TB.showAlert === 'function') {

      global.TB.showAlert(message || CONFIG.text.uploadFail, 'error');

    } else {

      global.alert(message || CONFIG.text.uploadFail);

    }

    console.warn('[QuillImageUpload] ' + message);

  }



  // ==========================================================================

  // Helpers

  // ==========================================================================



  /**

   * Per-instance state: the form scope for the submit lock, and the

   * record/table/organization ids to send with uploads. Set by attach().

   */

  var INSTANCES = new WeakMap();



  function stateOf(quill) {

    return INSTANCES.get(quill) || { scope: null, context: {} };

  }



  /** context may be a plain object or a function, evaluated per upload. */

  function contextOf(quill) {

    var c = stateOf(quill).context;

    try {

      return (typeof c === 'function' ? c() : c) || {};

    } catch (e) {

      console.warn('[QuillImageUpload] context() threw', e);

      return {};

    }

  }



  function dataUriToBlob(uri) {

    var parts = uri.split(',');

    var meta = parts[0];

    var mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/png';

    var body = parts.slice(1).join(',');

    var binary = /;base64/i.test(meta) ? atob(body) : decodeURIComponent(body);

    var arr = new Uint8Array(binary.length);

    for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);

    return new Blob([arr], { type: mime });

  }



  /**

   * Track progress across several uploads as one number, so the overlay shows

   * a single figure climbing to 100% rather than restarting per image.

   */

  function makeAggregator(total, report) {

    var each = new Array(total).fill(0);

    return function (i) {

      return function (fraction) {

        each[i] = fraction;

        var sum = each.reduce(function (a, b) { return a + b; }, 0);

        report(sum / total);

      };

    };

  }



  // ==========================================================================

  // Vector 1 & 2: paste

  // ==========================================================================



  function onPaste(quill, e) {

    var cd = e.clipboardData || global.clipboardData;

    if (!cd) return;



    // ---- (a) image files on the clipboard ----

    var files = [];

    if (cd.files && cd.files.length) {

      for (var i = 0; i < cd.files.length; i++) {

        if (/^image\//.test(cd.files[i].type)) files.push(cd.files[i]);

      }

    }

    if (!files.length && cd.items) {

      for (var j = 0; j < cd.items.length; j++) {

        var item = cd.items[j];

        if (item.kind === 'file' && /^image\//.test(item.type)) {

          var f = item.getAsFile();

          if (f) files.push(f);

        }

      }

    }



    if (files.length) {

      e.preventDefault();

      e.stopPropagation();

      var range = quill.getSelection(true) || { index: quill.getLength() - 1, length: 0 };

      if (range.length) quill.deleteText(range.index, range.length, 'user');

      uploadThenInsert(quill, files, range.index);

      return;

    }



    // ---- (b) HTML carrying data: URIs ----

    // This is the case that produced the broken record: copying an image from

    // a web page puts HTML on the clipboard, not a file.

    var html = cd.getData('text/html');

    if (html && /<img[^>]+src\s*=\s*["']data:image\//i.test(html)) {

      e.preventDefault();

      e.stopPropagation();

      var range2 = quill.getSelection(true) || { index: quill.getLength() - 1, length: 0 };

      if (range2.length) quill.deleteText(range2.index, range2.length, 'user');

      uploadThenPasteHtml(quill, html, range2.index);

    }

  }



  // ==========================================================================

  // Blocking upload flows

  // ==========================================================================



  /** Validate everything first, upload, then insert. Editor stays locked throughout. */

  function uploadThenInsert(quill, blobs, index) {

    return Promise.all(blobs.map(validateImage))

      .then(function () {

        var handle = lock(quill, blobs.length);

        var progressFor = makeAggregator(blobs.length, handle.progress);



        var ctx = contextOf(quill);

        var results = [];   // { url, displayWidth }

        var chain = Promise.resolve();

        blobs.forEach(function (blob, i) {

          chain = chain.then(function () {

            return prepareImage(blob).then(function (prepared) {

              return uploadImage(prepared.blob, progressFor(i), ctx).then(function (url) {

                results.push({ url: url, displayWidth: prepared.displayWidth });

              });

            });

          });

        });



        return chain

          .then(function () {

            handle.release();

            results.forEach(function (r, i) {

              quill.insertEmbed(index + i, 'image', r.url, 'user');

              if (r.displayWidth) {

                quill.formatText(index + i, 1, 'width', String(r.displayWidth), 'user');

              }

            });

            quill.setSelection(index + results.length, 0, 'silent');

          })

          .catch(function (err) {

            handle.release();

            throw err;

          });

      })

      .catch(function (err) {

        notify(err.message || CONFIG.text.uploadFail);

        console.error('[QuillImageUpload]', err);

      });

  }



  /**

   * Upload every data: image inside pasted HTML, then paste the rewritten

   * HTML in one go. Surrounding text and formatting survive untouched.

   */

  function uploadThenPasteHtml(quill, html, index) {

    var doc = new DOMParser().parseFromString(html, 'text/html');

    var imgs = Array.prototype.slice.call(doc.querySelectorAll('img'));



    var jobs = [];

    imgs.forEach(function (img) {

      var src = img.getAttribute('src') || '';

      if (/^data:image\//i.test(src)) {

        var blob;

        try { blob = dataUriToBlob(src); }

        catch (e) { img.remove(); return; }

        jobs.push({ img: img, blob: blob });

      } else if (/^https?:\/\//i.test(src)) {

        capImgElement(img, 0)

      }

      else {

        img.remove();          // blob:, file:, relative, javascript: …



      }

    });



    if (!jobs.length) {

      quill.clipboard.dangerouslyPasteHTML(index, doc.body.innerHTML, 'user');

      return Promise.resolve();

    }



    return Promise.all(jobs.map(function (j) { return validateImage(j.blob); }))

      .then(function () {

        var handle = lock(quill, jobs.length);

        var progressFor = makeAggregator(jobs.length, handle.progress);



        var ctx = contextOf(quill);

        var chain = Promise.resolve();

        // jobs.forEach(function (job, i) {

        //   chain = chain.then(function () {

        //     return uploadImage(job.blob, progressFor(i), ctx).then(function (url) {

        //       job.img.setAttribute('src', url);

        //       job.img.removeAttribute('srcset');

        //     });

        //   });

        // });

        jobs.forEach(function (job, i) {

          chain = chain.then(function () {

            return prepareImage(job.blob).then(function (prepared) {

              return uploadImage(prepared.blob, progressFor(i), ctx).then(function (url) {

                job.img.setAttribute('src', url);

                job.img.removeAttribute('srcset');

                capImgElement(job.img, prepared.naturalWidth);

              });

            });

          });

        });



        return chain

          .then(function () {

            handle.release();

            quill.clipboard.dangerouslyPasteHTML(index, doc.body.innerHTML, 'user');

          })

          .catch(function (err) {

            handle.release();

            throw err;

          });

      })

      .catch(function (err) {

        notify(err.message || CONFIG.text.uploadFail);

        console.error('[QuillImageUpload]', err);

      });

  }



  // ==========================================================================

  // Vector 3: drag and drop

  // ==========================================================================



  function onDrop(quill, e) {

    var dt = e.dataTransfer;

    if (!dt || !dt.files || !dt.files.length) return;



    var files = [];

    for (var i = 0; i < dt.files.length; i++) {

      if (/^image\//.test(dt.files[i].type)) files.push(dt.files[i]);

    }

    if (!files.length) return;



    e.preventDefault();

    e.stopPropagation();



    var index = quill.getLength() - 1;

    if (document.caretRangeFromPoint) {

      var r = document.caretRangeFromPoint(e.clientX, e.clientY);

      if (r && global.Quill && global.Quill.find) {

        var blot = global.Quill.find(r.startContainer, true);

        if (blot) {

          try { index = quill.getIndex(blot) + r.startOffset; } catch (err) {}

        }

      }

    }

    uploadThenInsert(quill, files, index);

  }



  // ==========================================================================

  // Vector 4: the toolbar image button

  // ==========================================================================

  // Left alone it opens a file picker and inserts base64 — the same bug by

  // another door.



  function overrideToolbar(quill) {

    var toolbar = quill.getModule('toolbar');

    if (!toolbar || typeof toolbar.addHandler !== 'function') return;



    toolbar.addHandler('image', function () {

      var input = document.createElement('input');

      input.type = 'file';

      input.accept = CONFIG.allowedMime.join(',');

      input.style.display = 'none';

      document.body.appendChild(input);



      input.onchange = function () {

        var file = input.files && input.files[0];

        if (input.parentElement) input.parentElement.removeChild(input);

        if (!file) return;

        var range = quill.getSelection(true) || { index: quill.getLength() - 1, length: 0 };

        uploadThenInsert(quill, [file], range.index);

      };



      input.click();

    });

  }



  // ==========================================================================

  // Safety net

  // ==========================================================================

  // If an image reaches the model through a path not handled above — a browser

  // quirk, a code path we did not anticipate — drop it rather than let a data:

  // URI be silently destroyed by the sanitizer on save.



  function installMatcher(quill) {

    if (!quill.clipboard || typeof quill.clipboard.addMatcher !== 'function') return;

    quill.clipboard.addMatcher('IMG', function (node, delta) {

      var src = node.getAttribute && node.getAttribute('src');

      if (src && /^data:/i.test(src)) {

        var Delta = delta.constructor;

        return new Delta();

      }

      return delta;

    });

  }



  // ==========================================================================

  // Resize

  // ==========================================================================

  // Click an image to get corner handles, a live pixel readout and preset

  // widths. Only the `width` attribute is written — never `height` — so the

  // aspect ratio is maintained by the browser and can never drift.

  //

  // Why the width ATTRIBUTE and not inline style: Quill's own Image blot

  // whitelists exactly ['alt', 'height', 'width']. A style attribute is

  // discarded by Quill before Tadabase's sanitizer ever sees it. The attribute

  // survives both, and travels with the HTML into PDF exports and emails.

  //

  // The value is written as a bare integer ("200"), which is what the HTML

  // spec requires. "200px" is non-conforming; browsers tolerate it but PDF

  // and email renderers frequently discard it.



  var RZ = {

    minWidth: 60,

    active: null        // { quill, img, box } — at most one selection at a time

  };



  function injectResizeStyles() {

    if (document.getElementById('qiu-rz-styles')) return;

    var css =

      '.qiu-rz{position:absolute;z-index:15;pointer-events:none;' +

      'outline:2px solid #4a90d9;outline-offset:-1px;}' +

      '.qiu-rz-h{position:absolute;width:12px;height:12px;background:#fff;' +

      'border:2px solid #4a90d9;border-radius:2px;pointer-events:all;' +

      'box-sizing:border-box;}' +

      '.qiu-rz-h[data-c="nw"]{top:-6px;inset-inline-start:-6px;cursor:nwse-resize;}' +

      '.qiu-rz-h[data-c="ne"]{top:-6px;inset-inline-end:-6px;cursor:nesw-resize;}' +

      '.qiu-rz-h[data-c="sw"]{bottom:-6px;inset-inline-start:-6px;cursor:nesw-resize;}' +

      '.qiu-rz-h[data-c="se"]{bottom:-6px;inset-inline-end:-6px;cursor:nwse-resize;}' +

      '.qiu-rz-bar{position:absolute;top:100%;margin-top:6px;' +

      'inset-inline-start:0;display:flex;align-items:center;gap:4px;' +

      'padding:4px 6px;border-radius:6px;background:#2c3e50;color:#fff;' +

      'font:12px/1 sans-serif;white-space:nowrap;pointer-events:all;' +

      'box-shadow:0 2px 8px rgba(0,0,0,.25);direction:ltr;}' +

      '.qiu-rz-bar button{all:unset;padding:3px 7px;border-radius:4px;' +

      'cursor:pointer;color:#fff;font:12px/1 sans-serif;}' +

      '.qiu-rz-bar button:hover{background:rgba(255,255,255,.18);}' +

      '.qiu-rz-px{opacity:.65;padding-inline-start:4px;font-variant-numeric:tabular-nums;}' +

      '.qiu-rz-drag,.qiu-rz-drag *{cursor:nwse-resize!important;user-select:none!important;}';

    var el = document.createElement('style');

    el.id = 'qiu-rz-styles';

    el.textContent = css;

    document.head.appendChild(el);

  }



  /** Usable content width of the editor, for the percentage presets. */

//   function contentWidth(quill) {

//     var cs = getComputedStyle(quill.root);

//     return Math.max(

//       RZ.minWidth,

//       Math.round(quill.root.clientWidth -

//                  parseFloat(cs.paddingLeft || 0) -

//                  parseFloat(cs.paddingRight || 0))

//     );

//   }



  /** Usable content width of the editor, capped by maxDisplayWidth. */

  function contentWidth(quill) {

    var cs = getComputedStyle(quill.root);

    var w = Math.max(

      RZ.minWidth,

      Math.round(quill.root.clientWidth -

                 parseFloat(cs.paddingLeft || 0) -

                 parseFloat(cs.paddingRight || 0))

    );

    return CONFIG.maxDisplayWidth ? Math.min(w, CONFIG.maxDisplayWidth) : w;

  }



  /**

   * Write the width into the document through Quill's format API, so it lands

   * in the Delta and fires text-change with source 'user' — which is what

   * pushes the change into the textarea and Angular.

   *

   * @param {number|null} px  null removes the attribute (back to natural size)

   */

  function commitWidth(quill, img, px) {

    var value = px === null ? null : String(Math.round(px));

    var done = false;



    if (global.Quill && typeof global.Quill.find === 'function') {

      try {

        var blot = global.Quill.find(img);

        if (blot) {

          quill.formatText(quill.getIndex(blot), 1, 'width', value, 'user');

          done = true;

        }

      } catch (e) {

        console.warn('[QuillImageUpload] formatText failed, falling back', e);

      }

    }



    if (!done) {

      // Fallback: touch the DOM, then make Quill re-read it so the Delta and

      // the text-change event stay in step with what is on screen.

      if (value === null) img.removeAttribute('width');

      else img.setAttribute('width', value);

      quill.update('user');

    }

  }



  function clearSelection() {

    if (!RZ.active) return;

    if (RZ.active.box && RZ.active.box.parentElement) {

      RZ.active.box.parentElement.removeChild(RZ.active.box);

    }

    RZ.active = null;

  }



  function position(box, img, container) {

    var i = img.getBoundingClientRect();

    var c = container.getBoundingClientRect();

    box.style.top    = (i.top  - c.top  + container.scrollTop)  + 'px';

    box.style.left   = (i.left - c.left + container.scrollLeft) + 'px';

    box.style.width  = i.width  + 'px';

    box.style.height = i.height + 'px';

  }



  function readout(box, img) {

    var px = box.querySelector('.qiu-rz-px');

    if (px) px.textContent = Math.round(img.getBoundingClientRect().width) + 'px';

  }



  function selectImage(quill, img) {

    clearSelection();

    if (!quill.isEnabled || !quill.isEnabled()) {

      // isEnabled is not present on every Quill build; fall back to the flag

      // the upload lock leaves on the container.

      if (quill.container && quill.container.querySelector('.qiu-overlay')) return;

    }



    injectResizeStyles();

    var container = quill.root.parentElement;

    if (!container) return;

    if (getComputedStyle(container).position === 'static') {

      container.style.position = 'relative';

    }



    var box = document.createElement('div');

    box.className = 'qiu-rz';

    box.innerHTML =

      '<span class="qiu-rz-h" data-c="nw"></span>' +

      '<span class="qiu-rz-h" data-c="ne"></span>' +

      '<span class="qiu-rz-h" data-c="sw"></span>' +

      '<span class="qiu-rz-h" data-c="se"></span>' +

      '<div class="qiu-rz-bar">' +

        '<button type="button" data-p="0.25">25%</button>' +

        '<button type="button" data-p="0.5">50%</button>' +

        '<button type="button" data-p="1">100%</button>' +

        '<button type="button" data-p="reset" title="גודל מקורי">&#8635;</button>' +

        '<span class="qiu-rz-px"></span>' +

      '</div>';

    container.appendChild(box);



    RZ.active = { quill: quill, img: img, box: box, container: container };

    position(box, img, container);

    readout(box, img);



    // ---- presets ----

    box.querySelectorAll('.qiu-rz-bar button').forEach(function (btn) {

      // mousedown, not click: stop the editor losing its selection first.

      btn.addEventListener('mousedown', function (e) {

        e.preventDefault();

        e.stopPropagation();

      });

      btn.addEventListener('click', function (e) {

        e.preventDefault();

        e.stopPropagation();

        var p = btn.getAttribute('data-p');

        if (p === 'reset') {

          commitWidth(quill, img, displayWidthFor(img.naturalWidth));

        } else {

          commitWidth(quill, img, contentWidth(quill) * parseFloat(p));

        }

        // Let layout settle before measuring again.

        setTimeout(function () {

          if (RZ.active && RZ.active.img === img) {

            position(box, img, container);

            readout(box, img);

          }

        }, 0);

      });

    });



    // ---- drag handles ----

    box.querySelectorAll('.qiu-rz-h').forEach(function (handle) {

      handle.addEventListener('pointerdown', function (e) {

        e.preventDefault();

        e.stopPropagation();



        var corner = handle.getAttribute('data-c');

        var startX = e.clientX;

        var rect = img.getBoundingClientRect();

        var startW = rect.width;

        var maxW = contentWidth(quill);



        // Dragging an east handle widens as x grows; a west handle as x shrinks.

        var dir = (corner === 'ne' || corner === 'se') ? 1 : -1;



        document.body.classList.add('qiu-rz-drag');

        handle.setPointerCapture && handle.setPointerCapture(e.pointerId);



        var current = startW;



        function onMove(ev) {

          var delta = (ev.clientX - startX) * dir;

          current = Math.max(RZ.minWidth, Math.min(maxW, startW + delta));

          // Write the tracked attribute directly for a live preview. Quill

          // keeps `width`, so this survives its DOM normalisation; the commit

          // on release is what records it in the Delta.

          img.setAttribute('width', String(Math.round(current)));

          position(box, img, container);

          readout(box, img);

        }



        function onUp() {

          document.removeEventListener('pointermove', onMove);

          document.removeEventListener('pointerup', onUp);

          document.body.classList.remove('qiu-rz-drag');

          commitWidth(quill, img, current);

          setTimeout(function () {

            if (RZ.active && RZ.active.img === img) {

              position(box, img, container);

              readout(box, img);

            }

          }, 0);

        }



        document.addEventListener('pointermove', onMove);

        document.addEventListener('pointerup', onUp);

      });

    });

  }



  function installResize(quill) {

    if (CONFIG.enableResize === false) return;



    var canListen = typeof quill.on === 'function';



    quill.root.addEventListener('click', function (e) {

      if (e.target && e.target.tagName === 'IMG') {

        selectImage(quill, e.target);

      } else {

        clearSelection();

      }

    });



    // Any of these can move the image out from under the handles.

    if (canListen) quill.on('text-change', function () {

      if (RZ.active && RZ.active.quill === quill) {

        if (!RZ.active.img.isConnected) clearSelection();

        else position(RZ.active.box, RZ.active.img, RZ.active.container);

      }

    });



    quill.root.addEventListener('scroll', function () {

      if (RZ.active && RZ.active.quill === quill) {

        position(RZ.active.box, RZ.active.img, RZ.active.container);

      }

    });



    if (canListen) quill.on('selection-change', function (range) {

      if (range === null) clearSelection();   // editor blurred

    });



    // Clicking anywhere outside the editor dismisses the handles.

    document.addEventListener('mousedown', function (e) {

      if (!RZ.active) return;

      if (quill.root.contains(e.target)) return;

      if (RZ.active.box.contains(e.target)) return;

      clearSelection();

    });

  }



  // ==========================================================================

  // Attach

  // ==========================================================================



  /**

   * Hook one Quill instance. Call from inside ROG_renderQuill, right after

   * the editor is constructed.

   *

   * @param {Quill}  quill

   * @param {Object} [opts]

   * @param {Element|jQuery} [opts.scope]   Form scope for the submit lock.

   *        Pass $searchRoot. Without it the lock falls back to the whole

   *        document, which would disable every form's submit button on the page.

   * @param {Object|Function} [opts.context] { recordId, tableId, organizationId }

   *        All optional — the service accepts uploads without them. Pass a

   *        function instead of an object if the ids are only known later

   *        (e.g. recordId that appears after a first save).

   * @returns {boolean} false if already attached

   */

  function attach(quill, opts) {

    if (!quill || !quill.root) return false;

    if (INSTANCES.has(quill)) return false;      // idempotent: re-renders are safe



    opts = opts || {};

    INSTANCES.set(quill, {

      scope:   opts.scope || null,

      context: opts.context || {}

    });



    // Capture phase, so we run before Quill's own clipboard handling.

    quill.root.addEventListener('paste', function (e) { onPaste(quill, e); }, true);

    quill.root.addEventListener('drop',  function (e) { onDrop(quill, e); },  true);

    quill.root.addEventListener('dragover', function (e) { e.preventDefault(); });



    installMatcher(quill);

    overrideToolbar(quill);



    // Resize is an enhancement. If it fails to set up, uploading — the thing

    // that actually prevents data loss — must still work.

    try {

      installResize(quill);

    } catch (e) {

      console.warn('[QuillImageUpload] resize unavailable, upload still active', e);

    }



    return true;

  }



  // ==========================================================================

  // Public API

  // ==========================================================================



  global.QuillImageUpload = {

    attach: attach,

    config: CONFIG,



    /** Global overrides — endpoint, limits, copy, submitSelector. */

    configure: function (opts) {

      Object.keys(opts || {}).forEach(function (k) {

        if (k === 'text') Object.assign(CONFIG.text, opts.text);

        else CONFIG[k] = opts[k];

      });

      return CONFIG;

    },



    /** Replace the uploader wholesale if the service shape ever changes. */

    setUploader: function (fn) { uploadImage = fn; }

  };



})(window);





/* ============================================================================

 * PART 2 of 2 — ROG_renderQuill

 * ----------------------------------------------------------------------------

 * Your original function. Three additions, each marked  // ++ ADDED :

 *   1. recordId / tableId / organizationId read out of opts

 *   2. QuillImageUpload.attach(quill, {...}) after the editor is built

 *   3. an upload-in-progress guard on the submit click handler

 * Nothing else was removed, renamed or reordered.

 * ========================================================================== */



var ROG_renderQuill = (componentId, arrayOfFields, opts = {}) => {

  const {

    root = document,      // e.g., data.ele

    delay = 50,           // match your original setTimeout



    // ++ ADDED — all optional; forwarded to the upload service as query params.

    recordId = '',

    tableId = '',

    organizationId = '',



    toolbarOptions = [

      ['bold', 'italic', 'underline', 'strike'],

      ['blockquote', 'code-block'],

      [{ header: 1 }, { header: 2 }],

      [{ list: 'ordered' }, { list: 'bullet' }],

      [{ script: 'sub' }, { script: 'super' }],

      [{ indent: '-1' }, { indent: '+1' }],

      [{ direction: 'rtl' }],

      [{ size: ['small', false, 'large', 'huge'] }],

      [{ header: [1, 2, 3, 4, 5, 6, false] }],

      [{ color: [] }, { background: [] }],

      [{ font: [] }],

      [{ align: [] }],

      ['clean'],

      ['formula'],

      ['video'],

      ['image']

    ]

  } = opts;



  const editors = {}; // { [rawId: string]: Quill }



  // ---- REGISTER <br> BLOT ONCE ---- (for shift+enter behavior)

  if (!window.__quillLinebreakRegistered) {

    const Break = Quill.import('blots/break');

    class LineBreak extends Break {}

    LineBreak.blotName = 'linebreak';

    LineBreak.tagName  = 'BR';

    Quill.register(LineBreak, true);

    window.__quillLinebreakRegistered = true;

  }



  if (!window.__qlSoftBreakRegistered) {

    const Embed = Quill.import('blots/embed');   // <-- not Break

    class SoftBreak extends Embed {}

    SoftBreak.blotName = 'softbreak';

    SoftBreak.tagName  = 'BR';

    Quill.register(SoftBreak, true);

    window.__qlSoftBreakRegistered = true;

  }



  setTimeout(function () {

    arrayOfFields.forEach((rawId) => {

      // Scope like .component_3_field_6638 (old convention)

      const wrapperSelector = `.${componentId}_${rawId}`;

      const $scope = jQuery(wrapperSelector, root);

      const $searchRoot = $scope.length ? $scope : jQuery(root);



      // Try common textarea name patterns WITHOUT normalizing the id

      const candidates = [

        `textarea[name^="fieldfield_${rawId}"]`, // e.g. fieldfield_field_6638...

        `textarea[name="${rawId}"]`,             // e.g. name="field_6638"

        `textarea[name="field${rawId}"]`         // fallback pattern seen in some themes

      ];

      let $textarea = jQuery(null);

      for (const sel of candidates) {

        const $found = jQuery(sel, $searchRoot);

        if ($found.length) { $textarea = $found; break; }

      }

      if (!$textarea.length) {

        console.warn(`ROG_renderQuill3: textarea for ${rawId} not found in scope ${wrapperSelector}`);

        return;

      }



      const richTextId = $textarea.attr('id');

      if (!richTextId) {

        console.warn(`ROG_renderQuill3: textarea for ${rawId} has no id`);

        return;

      }



      // Prefer TinyMCE content if present

      let initialValue = '';

      try {

        if (window.tinyMCE && tinyMCE.get(richTextId)) {

          initialValue = tinyMCE.get(richTextId).getContent() || '';

        } else {

          initialValue = $textarea.val() || '';

        }

      } catch (e) {

        console.warn('ROG_renderQuill3: TinyMCE read failed, fallback to textarea', e);

        initialValue = $textarea.val() || '';

      }



      // Inject Quill host; hide TinyMCE chrome if present

      const editorId = `${componentId}_editor_${richTextId}`;

      const hostHtml = `<div id="${editorId}" dir="rtl" style="text-align:right;"></div>`;

      const $formGroup = $textarea.closest('.form-group');

      const $mce = jQuery('.mce-tinymce', $formGroup);

      if ($mce.length) {

        $mce.hide().after(hostHtml);

      } else {

        $textarea.after(hostHtml);

      }



      // Init Quill (+ clipboard + keyboard bindings restored)

      const quill = new Quill('#' + editorId, {

        modules: {

          toolbar: toolbarOptions,

          clipboard: { matchVisual: false },

          keyboard: {

            bindings: {

              // Old "handleEnter": insert literal newline & move cursor

              handleEnter: {

                key: 13,

                shiftKey: false,

                handler: function (range, context) {

                  this.quill.insertText(range.index, '\n', Quill.sources.SILENT);

                  this.quill.setSelection(range.index + 1, Quill.sources.SILENT);

                  return false; // block default

                }

              },

              // Old "shiftEnterInNumberedList": soft break inside ordered list

              shiftEnterInNumberedList: {

                key: 13,

                shiftKey: true,

                handler: function (range, context) {

                  const inList = context.format && (context.format.list === 'ordered' || context.format.list === 'bullet');

                  if (inList) {

                    const d = new Delta()

                      .retain(range.index)

                      .insert({ softbreak: true })

                      .insert('\u200B'); // ZWSP caret anchor

                    this.quill.updateContents(d, Quill.sources.USER);

                    this.quill.setSelection(range.index + 2, Quill.sources.SILENT); // after the ZWSP

                    return false; // block default (new list item)

                  }

                  return true;                   // elsewhere also behave as soft break (optional)

                }

              }

            }

          }

        },

        theme: 'snow'

      });



      // before loading initial value

      const Delta = Quill.import('delta');

      quill.clipboard.addMatcher('BR', () => new Delta().insert({ softbreak: true }));



      // ++ ADDED ------------------------------------------------------------

      // Intercept pasted / dropped / toolbar-selected images, upload them, and

      // insert an https URL instead of a data: URI. Must come after the BR

      // matcher above so both matchers are registered on the same clipboard.

      //

      // scope   -> confines the submit-button lock to THIS form

      // context -> forwarded as query params on the upload request

      if (window.QuillImageUpload) {

        window.QuillImageUpload.attach(quill, {

          scope: $searchRoot,

          context: { recordId, tableId, organizationId }

        });

      } else {

        console.warn('ROG_renderQuill: QuillImageUpload not loaded — pasted images will be stripped on save');

      }

      // ---------------------------------------------------------------------



      // Load initial HTML

      if (initialValue) {

        quill.setContents(quill.clipboard.convert(initialValue));

        $textarea.val(initialValue);

      }



      // Angular sync helper (safe no-op if Angular absent)

      const syncToAngular = (html) => {

        $textarea.val(html);

        try {

          if (window.angular && angular.element) {

            const ngElem = angular.element($textarea);

            const ngModel = ngElem.controller && ngElem.controller('ngModel');

            const scope = ngElem.scope && ngElem.scope();



            if (ngModel) {

              ngModel.$setViewValue(html);

              ngModel.$render && ngModel.$render();

            }

            if (scope && scope.record && scope.field) {

              scope.record[scope.field.slug] = html;

              scope.field.value = html;

            }

            if (scope && !scope.$$phase) {

              scope.$apply();

            }

          }

        } catch (e) {

          console.warn('ROG_renderQuill3: Angular sync warning', e);

        }

      };



      // Keep in sync

      // NOTE: the image module inserts with source 'user', so this fires and

      // the new <img> reaches the textarea. Do not change those to 'silent'.

      quill.on('text-change', function () {

        const html = quill.root.innerHTML;

        if (html === '<p><br></p>') {

          quill.format('direction', 'rtl');

          quill.format('align', 'right');

        }

        $textarea.val(html).change(); // keep legacy .change()

        syncToAngular(html);

      });



      // Stop parent popups closing on Enter; let Quill handle content

      quill.root.addEventListener('keydown', function (event) {

        const code = event.keyCode || event.which;

        if (code === 13 && !event.shiftKey) event.stopPropagation();

        if (code === 13 && event.shiftKey) {

          event.preventDefault();

          event.stopPropagation();

        }

      });



      // Ensure sync on submit

      jQuery('.af-form-submit', $searchRoot).on('click', function (e) {

        // ++ ADDED — belt and braces. The button is disabled during an upload,

        // so this should never fire then; it guards the case where something

        // else re-enables it, or a keyboard submit bypasses the disabled state.

        if (window.QuillImageUpload && quill.container &&

            quill.container.querySelector('.qiu-overlay')) {

          e.preventDefault();

          e.stopImmediatePropagation();

          return false;

        }

        syncToAngular(quill.root.innerHTML);

      });



      // Enforce RTL/right align after init

      setTimeout(() => {

        quill.format('direction', 'rtl');

        quill.format('align', 'right');

      }, 0);



      editors[rawId] = quill;

    });

  }, delay);



  return editors;

};
/* END OF SCRIPT - ROG Shared Quill */
